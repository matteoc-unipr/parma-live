// Planner A→B, tutto in memoria (gira nel Web Worker). Due round:
// 1) dalle fermate vicine ad A, la prima corsa utile di ogni pattern → arrivi a valle (soluzioni dirette se vicino a B);
// 2) dalle fermate raggiunte, cambio (stessa fermata o entro 200 m, ≥ 3 min) su un pattern che porta vicino a B.
// Ogni orario è la stima live quando c'è, altrimenti il programmato + il ritardo noto della corsa.
import { serviceDayStart, stopStatus, type TripUpdate } from '../lib/board'

export type PlannerStop = { id: string; name: string; lat: number; lon: number }
export type PlannerPattern = { id: string; route: string; dir: number; shape: string; stops: string[] }
/** [trip_id, pattern_id, partenza in secondi dall'inizio del giorno di servizio, indice in offsets] */
export type TripRow = [string, string, number, number]
export type PlannerData = { stops: PlannerStop[]; patterns: PlannerPattern[]; trips: Record<string, TripRow[]>; offsets: number[][] }
export type Point = { lat: number; lon: number }

export const WALK_RADIUS_M = 600
export const WALK_M_PER_MIN = 80
export const TRANSFER_RADIUS_M = 200
export const MIN_TRANSFER_S = 180
const HORIZON_MS = 3 * 3600_000
const EARLY_SLACK_MS = 30 * 60_000 // corse in ritardo: si guardano anche i programmati fino a 30 min prima

const KY = 110_540
const KX = 111_320 * Math.cos((44.8 * Math.PI) / 180) // Parma: proiezione equirettangolare locale
const CELL = TRANSFER_RADIUS_M

export type WalkLeg = { kind: 'walk'; from: Point; to: Point; meters: number; seconds: number }
export type RideLeg = {
  kind: 'ride'
  patternId: string
  routeId: string
  tripId: string
  date: string
  fromStop: string
  toStop: string
  fromIdx: number
  toIdx: number
  depart: number
  arrive: number
  live: boolean
  delaySec: number | null
}
export type Journey = { legs: (WalkLeg | RideLeg)[]; leave: number; arrive: number; transfers: number; signature: string }

type Run = { tripId: string; date: string; base: number; start: number; off: number[] }
type IStop = PlannerStop & { x: number; y: number }
export type PlannerIndex = {
  stops: Map<string, IStop>
  patterns: PlannerPattern[]
  byStop: Map<string, [number, number][]>
  runs: Run[][]
  grid: Map<string, string[]>
}

const cellKey = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`

export function buildIndex(d: PlannerData): PlannerIndex {
  const stops = new Map<string, IStop>()
  const grid = new Map<string, string[]>()
  for (const s of d.stops) {
    const st = { ...s, x: s.lon * KX, y: s.lat * KY }
    stops.set(s.id, st)
    const k = cellKey(st.x, st.y)
    grid.set(k, [...(grid.get(k) ?? []), s.id])
  }
  const pIndex = new Map(d.patterns.map((p, i) => [p.id, i]))
  const byStop = new Map<string, [number, number][]>()
  d.patterns.forEach((p, pi) => p.stops.forEach((s, i) => byStop.set(s, [...(byStop.get(s) ?? []), [pi, i]])))
  const runs: Run[][] = d.patterns.map(() => [])
  for (const [date, rows] of Object.entries(d.trips)) {
    const base = serviceDayStart(date)
    for (const [tripId, patternId, start, offIdx] of rows) {
      const pi = pIndex.get(patternId)
      if (pi !== undefined) runs[pi]!.push({ tripId, date, base, start, off: d.offsets[offIdx]! })
    }
  }
  for (const list of runs) list.sort((a, b) => a.base + a.start * 1000 - (b.base + b.start * 1000))
  return { stops, patterns: d.patterns, byStop, runs, grid }
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const walkSec = (m: number) => (m / WALK_M_PER_MIN) * 60

/** Fermate entro `radius` metri dal punto: stopId → metri. */
function near(ix: PlannerIndex, p: { x: number; y: number }, radius: number) {
  const out = new Map<string, number>()
  const r = Math.ceil(radius / CELL)
  const cx = Math.floor(p.x / CELL)
  const cy = Math.floor(p.y / CELL)
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (const id of ix.grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
        const m = dist(ix.stops.get(id)!, p)
        if (m <= radius) out.set(id, m)
      }
  return out
}

type At = { t: number; live: boolean; delaySec: number | null }

/** Orario della corsa alla fermata `idx` del suo pattern; null se lì non si può usare (soppressa, saltata, già passata). */
function timeAt(run: Run, idx: number, stopId: string, updates: Map<string, TripUpdate>): At | null {
  const tu = updates.get(run.tripId)
  const st = stopStatus(tu, run.date, stopId)
  if (st.kind === 'live') return { t: st.eta, live: true, delaySec: st.delaySec }
  if (st.kind !== 'scheduled') return null
  const sched = run.base + (run.start + run.off[idx]!) * 1000
  // Corsa con stime ma non per questa fermata: si applica il ritardo della prima fermata stimata.
  const delay = tu?.startDate === run.date ? (tu.stops.find((s) => s.time)?.delay ?? 0) : 0
  return { t: sched + delay * 1000, live: false, delaySec: tu?.startDate === run.date ? delay : null }
}

/** Prima corsa del pattern che passa da `idx` non prima di `notBefore`. */
function earliest(ix: PlannerIndex, pi: number, idx: number, notBefore: number, updates: Map<string, TripUpdate>) {
  const stopId = ix.patterns[pi]!.stops[idx]!
  let best: { run: Run; at: At } | null = null
  for (const run of ix.runs[pi]!) {
    const sched = run.base + (run.start + run.off[idx]!) * 1000
    if (sched < notBefore - EARLY_SLACK_MS) continue
    if (sched > notBefore + HORIZON_MS || (best && sched > best.at.t + EARLY_SLACK_MS)) break
    const at = timeAt(run, idx, stopId, updates)
    if (at && at.t >= notBefore && (!best || at.t < best.at.t)) best = { run, at }
  }
  return best
}

const pt = (s: IStop): Point => ({ lat: s.lat, lon: s.lon })

export function plan(ix: PlannerIndex, from: Point, to: Point, now: number, updates: Map<string, TripUpdate>, limit = 3): Journey[] {
  const A = { x: from.lon * KX, y: from.lat * KY }
  const B = { x: to.lon * KX, y: to.lat * KY }
  const nearA = near(ix, A, WALK_RADIUS_M)
  const nearB = near(ix, B, WALK_RADIUS_M)
  const walk = (a: Point, b: Point, meters: number): WalkLeg => ({ kind: 'walk', from: a, to: b, meters, seconds: walkSec(meters) })
  const ride = (pi: number, run: Run, i: number, k: number, dep: At, arr: At): RideLeg => {
    const p = ix.patterns[pi]!
    return {
      kind: 'ride', patternId: p.id, routeId: p.route, tripId: run.tripId, date: run.date,
      fromStop: p.stops[i]!, toStop: p.stops[k]!, fromIdx: i, toIdx: k,
      depart: dep.t, arrive: arr.t, live: dep.live, delaySec: dep.delaySec,
    }
  }

  const best = new Map<string, Journey>()
  const consider = (legs: Journey['legs'], walkBm: number) => {
    const rides = legs.filter((l): l is RideLeg => l.kind === 'ride')
    const first = rides[0]!
    const last = rides.at(-1)!
    const head = legs[0]!
    const walkA = head.kind === 'walk' ? head.seconds : 0
    const j: Journey = {
      legs,
      leave: first.depart - walkA * 1000,
      arrive: last.arrive + walkSec(walkBm) * 1000,
      transfers: rides.length - 1,
      signature: rides.map((r) => r.routeId).join('>'),
    }
    const prev = best.get(j.signature)
    if (!prev || j.arrive < prev.arrive) best.set(j.signature, j)
  }

  // Round 1: prima corsa utile da ogni fermata vicina ad A; arrivi a valle per i cambi.
  type Reach = { arr: At; pi: number; run: Run; i: number; k: number; dep: At; walkA: number }
  const reach = new Map<string, Map<string, Reach>>() // fermata → linea → arrivo migliore
  for (const [sA, mA] of nearA) {
    for (const [pi, i] of ix.byStop.get(sA) ?? []) {
      const p = ix.patterns[pi]!
      if (i === p.stops.length - 1) continue
      const r = earliest(ix, pi, i, now + walkSec(mA) * 1000, updates)
      if (!r) continue
      for (let k = i + 1; k < p.stops.length; k++) {
        const s = p.stops[k]!
        const arr = timeAt(r.run, k, s, updates)
        if (!arr) continue
        const sStop = ix.stops.get(s)!
        const mB = nearB.get(s)
        if (mB !== undefined)
          consider([walk(from, pt(ix.stops.get(sA)!), mA), ride(pi, r.run, i, k, r.at, arr), walk(pt(sStop), to, mB)], mB)
        const lines = reach.get(s) ?? new Map<string, Reach>()
        const prev = lines.get(p.route)
        if (!prev || arr.t < prev.arr.t) lines.set(p.route, { arr, pi, run: r.run, i, k, dep: r.at, walkA: mA })
        reach.set(s, lines)
      }
    }
  }

  // Cambio: fermata raggiunta → fermate entro 200 m, pronti dopo max(3 min, tempo a piedi).
  type Ready = { t: number; via: Reach; at: string; walkM: number }
  const ready = new Map<string, Map<string, Ready>>()
  for (const [k, lines] of reach) {
    const sk = ix.stops.get(k)!
    for (const [m, walkM] of near(ix, sk, TRANSFER_RADIUS_M))
      for (const [route, via] of lines) {
        const t = via.arr.t + Math.max(MIN_TRANSFER_S, walkSec(walkM)) * 1000
        const byLine = ready.get(m) ?? new Map<string, Ready>()
        const prev = byLine.get(route)
        if (!prev || t < prev.t) byLine.set(route, { t, via, at: k, walkM })
        ready.set(m, byLine)
      }
  }

  // Round 2: secondo pattern che passa da una fermata di cambio e poi da una fermata vicina a B.
  for (const [sB, mB] of nearB) {
    for (const [pi, q] of ix.byStop.get(sB) ?? []) {
      const p = ix.patterns[pi]!
      for (let b = 0; b < q; b++) {
        const lines = ready.get(p.stops[b]!)
        if (!lines) continue
        for (const [route1, r] of lines) {
          if (route1 === p.route) continue // cambiare restando sulla stessa linea non serve
          const second = earliest(ix, pi, b, r.t, updates)
          if (!second) continue
          const arr = timeAt(second.run, q, sB, updates)
          if (!arr) continue
          const v = r.via
          const sA = ix.patterns[v.pi]!.stops[v.i]!
          const legs: Journey['legs'] = [
            walk(from, pt(ix.stops.get(sA)!), v.walkA),
            ride(v.pi, v.run, v.i, v.k, v.dep, v.arr),
          ]
          if (r.walkM > 0) legs.push(walk(pt(ix.stops.get(r.at)!), pt(ix.stops.get(p.stops[b]!)!), r.walkM))
          legs.push(ride(pi, second.run, b, q, second.at, arr), walk(pt(ix.stops.get(sB)!), to, mB))
          consider(legs, mB)
        }
      }
    }
  }

  const all = [...best.values()].sort((a, b) => a.arrive - b.arrive)
  // Un cambio ha senso solo se fa arrivare prima della migliore soluzione diretta.
  const bestDirect = all.find((j) => j.transfers === 0)?.arrive ?? Infinity
  return all.filter((j) => j.transfers === 0 || j.arrive < bestDirect).slice(0, limit)
}
