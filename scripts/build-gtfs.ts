// Scarica il GTFS di BusOne e scrive i dati statici compatti in app/public/data/.
// Uso: BUSONE_CONTACT=tua@email node scripts/build-gtfs.ts [--date YYYYMMDD] [--zip percorso/gtfs.zip]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { unzipSync } from 'fflate'

type Row = Record<string, string>
type Gtfs = Record<'routes' | 'stops' | 'trips' | 'stop_times' | 'shapes' | 'calendar' | 'calendar_dates', Row[]>
export type Pattern = { id: string; route: string; dir: number; headsign: string; shape: string; stops: string[] }
/** [secondi dall'inizio del giorno di servizio, trip_id, pattern id] */
export type Departure = [number, string, string]

const DAY = 86400

/** CSV RFC 4180: virgolette, "" come escape, CRLF, BOM. */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') field += c
  }
  if (field || row.length) rows.push([...row, field])
  const [header = [], ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ''])))
}

/** "25:10:00" → 90600. I tempi GTFS possono superare 24h: la corsa appartiene al giorno di servizio precedente. */
export const parseTime = (t: string) => {
  const [h = 0, m = 0, s = 0] = t.split(':').map(Number)
  return h * 3600 + m * 60 + s
}

export function addDays(date: string, n: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8) + n))
  return d.toISOString().slice(0, 10).replaceAll('-', '')
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** service_id attivi in una data: calendar.txt (intervallo + giorno della settimana) poi eccezioni di calendar_dates (1 aggiunge, 2 toglie). */
export function activeServices(date: string, calendar: Row[], calendarDates: Row[]): Set<string> {
  const weekday = WEEKDAYS[new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8))).getUTCDay()]!
  const active = new Set(
    calendar.filter((c) => c.start_date! <= date && date <= c.end_date! && c[weekday] === '1').map((c) => c.service_id!),
  )
  for (const e of calendarDates) {
    if (e.date !== date) continue
    if (e.exception_type === '1') active.add(e.service_id!)
    if (e.exception_type === '2') active.delete(e.service_id!)
  }
  return active
}

/** Douglas-Peucker su coordinate [lon, lat], tolleranza in metri (proiezione equirettangolare locale). */
export function simplify(points: [number, number][], toleranceM: number): [number, number][] {
  if (points.length < 3) return points
  const kx = 111320 * Math.cos((points[0]![1] * Math.PI) / 180)
  const ky = 110540
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = [points[a]![0] * kx, points[a]![1] * ky]
    const [dx, dy] = [points[b]![0] * kx - ax, points[b]![1] * ky - ay]
    const len2 = dx * dx + dy * dy
    let max = -1
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = [points[i]![0] * kx - ax, points[i]![1] * ky - ay]
      const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0
      const d = Math.hypot(px - t * dx, py - t * dy)
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (max > toleranceM) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5

/** Id stabile tra una build e l'altra (FNV-1a della sequenza di fermate): i file on-demand restano coerenti con patterns.json in cache. */
function patternId(route: string, dir: string, stops: string[]) {
  let h = 0x811c9dc5
  for (const c of stops.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193)
  return `${route}-${dir}-${(h >>> 0).toString(36)}`
}

const mostCommon = (xs: string[]) => {
  const counts = new Map<string, number>()
  for (const x of xs) if (x) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

export function build(g: Gtfs, today: string) {
  const stopTimesByTrip = new Map<string, Row[]>()
  for (const st of g.stop_times) {
    const list = stopTimesByTrip.get(st.trip_id!) ?? []
    list.push(st)
    stopTimesByTrip.set(st.trip_id!, list)
  }
  for (const list of stopTimesByTrip.values()) list.sort((a, b) => +a.stop_sequence! - +b.stop_sequence!)

  const stopName = new Map(g.stops.map((s) => [s.stop_id!, s.stop_name!]))

  // Pattern: stessa linea, direzione e sequenza di fermate.
  const groups = new Map<string, { route: string; dir: string; stops: string[]; trips: Row[] }>()
  const tripPattern = new Map<string, string>()
  for (const trip of g.trips) {
    const stops = (stopTimesByTrip.get(trip.trip_id!) ?? []).map((st) => st.stop_id!)
    if (stops.length < 2) continue
    const id = patternId(trip.route_id!, trip.direction_id!, stops)
    const group = groups.get(id) ?? { route: trip.route_id!, dir: trip.direction_id!, stops, trips: [] }
    group.trips.push(trip)
    groups.set(id, group)
    tripPattern.set(trip.trip_id!, id)
  }
  const patterns: Pattern[] = [...groups].map(([id, p]) => ({
    id,
    route: p.route,
    dir: Number(p.dir),
    headsign: mostCommon(p.trips.map((t) => t.trip_headsign!)) ?? stopName.get(p.stops.at(-1)!) ?? '',
    shape: mostCommon(p.trips.map((t) => t.shape_id!)) ?? '',
    stops: p.stops,
  }))

  const shapePoints = new Map<string, Row[]>()
  const usedShapes = new Set(patterns.map((p) => p.shape))
  for (const pt of g.shapes) {
    if (!usedShapes.has(pt.shape_id!)) continue
    const list = shapePoints.get(pt.shape_id!) ?? []
    list.push(pt)
    shapePoints.set(pt.shape_id!, list)
  }
  const shapes = Object.fromEntries(
    [...shapePoints].map(([id, pts]) => {
      pts.sort((a, b) => +a.shape_pt_sequence! - +b.shape_pt_sequence!)
      const line = simplify(pts.map((p) => [+p.shape_pt_lon!, +p.shape_pt_lat!]), 4)
      return [id, line.map(([lon, lat]) => [round5(lon), round5(lat)])]
    }),
  )

  // Indice orari: ieri (solo la coda dopo mezzanotte, fino a ~29:00), oggi, domani (margine se la build notturna salta).
  const days = [addDays(today, -1), today, addDays(today, 1)]
  const byStop = new Map<string, Record<string, Departure[]>>()
  const tripsByDay: Record<string, [string, string, number][]> = {}
  for (const date of days) {
    const services = activeServices(date, g.calendar, g.calendar_dates)
    const minSec = date < today ? DAY : 0
    tripsByDay[date] = []
    for (const trip of g.trips) {
      const pattern = tripPattern.get(trip.trip_id!)
      if (!pattern || !services.has(trip.service_id!)) continue
      const sts = stopTimesByTrip.get(trip.trip_id!)!
      if (parseTime(sts.at(-1)!.arrival_time!) < minSec) continue
      tripsByDay[date].push([trip.trip_id!, pattern, parseTime(sts[0]!.departure_time!)])
      // Il capolinea d'arrivo e le fermate senza salita non sono partenze.
      for (const st of sts.slice(0, -1)) {
        const sec = parseTime(st.departure_time!)
        if (sec < minSec || st.pickup_type === '1') continue
        const board = byStop.get(st.stop_id!) ?? {}
        ;(board[date] ??= []).push([sec, trip.trip_id!, pattern])
        byStop.set(st.stop_id!, board)
      }
    }
  }
  for (const board of byStop.values()) for (const list of Object.values(board)) list.sort((a, b) => a[0] - b[0])

  const servedStops = new Set(patterns.flatMap((p) => p.stops))
  return {
    routes: g.routes.map((r) => ({
      id: r.route_id!,
      short: r.route_short_name!,
      long: r.route_long_name!,
      color: r.route_color ? `#${r.route_color}` : null,
      text: r.route_text_color ? `#${r.route_text_color}` : null,
    })),
    stops: g.stops
      .filter((s) => servedStops.has(s.stop_id!))
      .map((s) => ({ id: s.stop_id!, name: s.stop_name!, lat: round5(+s.stop_lat!), lon: round5(+s.stop_lon!) })),
    patterns,
    shapes,
    trips: tripsByDay,
    stopTimes: byStop,
    days,
  }
}

function serviceDateInRome(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(now).replaceAll('-', '')
}

async function main() {
  const { values } = parseArgs({ options: { date: { type: 'string' }, zip: { type: 'string' } } })
  let zip: Uint8Array
  if (values.zip) zip = readFileSync(values.zip)
  else {
    const contact = process.env.BUSONE_CONTACT
    if (!contact) throw new Error('imposta BUSONE_CONTACT (email inviata a BusOne in X-BusOne-Client)')
    const res = await fetch('https://proxy.busone.app/tep/gtfs.zip', {
      headers: { 'X-BusOne-Client': `parma-live (uso personale); ${contact}`, 'X-BusOne-Use': 'personal' },
    })
    if (!res.ok) throw new Error(`gtfs.zip: HTTP ${res.status}`)
    zip = new Uint8Array(await res.arrayBuffer())
  }
  const files = unzipSync(zip)
  const text = new TextDecoder()
  const read = (name: string) => (files[`${name}.txt`] ? parseCsv(text.decode(files[`${name}.txt`])) : [])
  const g = Object.fromEntries(
    (['routes', 'stops', 'trips', 'stop_times', 'shapes', 'calendar', 'calendar_dates'] as const).map((n) => [n, read(n)]),
  ) as Gtfs

  const today = values.date ?? serviceDateInRome()
  const out = build(g, today)

  const dir = join(import.meta.dirname, '../app/public/data')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'stop-times'), { recursive: true })
  const write = (name: string, data: unknown) => writeFileSync(join(dir, name), JSON.stringify(data))
  write('meta.json', { builtAt: new Date().toISOString(), days: out.days, attribution: 'BusOne (https://busone.app) e TEP' })
  write('routes.json', out.routes)
  write('stops.json', out.stops)
  write('patterns.json', out.patterns)
  write('shapes.json', out.shapes)
  write('trips.json', out.trips)
  for (const [stopId, board] of out.stopTimes) write(`stop-times/${stopId}.json`, board)
  console.log(`ok: ${out.routes.length} linee, ${out.stops.length} fermate, ${out.patterns.length} pattern, giorni ${out.days.join(' ')}`)
}

if (import.meta.main) await main()
