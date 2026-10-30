// Dati statici generati da scripts/build-gtfs.ts in /data (formato in docs/data.md).
import { create } from 'zustand'
import tokens from '../../../design/tokens.json'
import type { StopTimes } from '../lib/board'

export type Route = { id: string; short: string; long: string; color: string | null; text: string | null }
export type Stop = { id: string; name: string; lat: number; lon: number }
export type Pattern = { id: string; route: string; dir: number; headsign: string; shape: string; stops: string[] }

type StaticData = {
  routes: Map<string, Route>
  stops: Map<string, Stop>
  patterns: Map<string, Pattern>
  shapes: Record<string, [number, number][]>
  tripPattern: Map<string, string>
  /** Fermate con lo stesso nome (di solito una per direzione): la "località" scelta in Cerca e nei tragitti. */
  places: Map<string, string[]>
}

const get = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`/data/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

export const useStatic = create<{ data: StaticData | null; error: string | null }>(() => ({ data: null, error: null }))

export async function loadStatic() {
  try {
    const [routes, stops, patterns, shapes, trips] = await Promise.all([
      get<Route[]>('routes.json'),
      get<Stop[]>('stops.json'),
      get<Pattern[]>('patterns.json'),
      get<Record<string, [number, number][]>>('shapes.json'),
      get<Record<string, [string, string, number][]>>('trips.json'),
    ])
    useStatic.setState({
      data: {
        routes: new Map(routes.map((r) => [r.id, r])),
        stops: new Map(stops.map((s) => [s.id, s])),
        patterns: new Map(patterns.map((p) => [p.id, p])),
        shapes,
        tripPattern: new Map(Object.values(trips).flatMap((day) => day.map(([trip, pattern]) => [trip, pattern] as const))),
        // shortcut: raggruppa per nome esatto; due fermate omonime lontane (altri comuni) finirebbero insieme. Se capita, aggiungere la distanza.
        places: stops.reduce((m, s) => m.set(s.name, [...(m.get(s.name) ?? []), s.id]), new Map<string, string[]>()),
      },
    })
  } catch (e) {
    useStatic.setState({ error: String(e) })
  }
}

const stopTimesCache = new Map<string, Promise<StopTimes>>()
export const loadStopTimes = (stopId: string) => {
  if (!stopTimesCache.has(stopId)) stopTimesCache.set(stopId, get<StopTimes>(`stop-times/${stopId}.json`).catch(() => ({})))
  return stopTimesCache.get(stopId)!
}

// Colori: ufficiali dal GTFS; poi i segnaposto del design; poi uno "casuale" stabile per linea.
const designLines: Record<string, string> = tokens.color.line
export const lineColor = (route: Route | undefined) =>
  route?.color ?? designLines[route?.short ?? ''] ?? fallbackColor(route?.short ?? route?.id ?? '')

const hex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0')
const hsl = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0), f(8), f(4)] as const
}
const luminance = (rgb: readonly number[]) => {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
/** Contrasto WCAG del bianco su questo colore. */
export const contrastWithWhite = (rgb: readonly number[]) => 1.05 / (luminance(rgb) + 0.05)

/** Colore stabile ricavato dal nome della linea (stessa linea, stesso colore), scurito finché il numero bianco resta leggibile (≥ 3:1). */
export function fallbackColor(key: string) {
  let h = 0x811c9dc5
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193)
  const hue = ((h >>> 0) % 360 + 360) % 360
  let l = 0.46
  let rgb = hsl(hue, 0.68, l)
  while (contrastWithWhite(rgb) < 3 && l > 0.2) rgb = hsl(hue, 0.68, (l -= 0.02))
  return `#${rgb.map(hex).join('').toUpperCase()}`
}
export const lineLabel = (route: Route | undefined) => (route?.short === 'Campus Express' ? 'CE' : (route?.short ?? '?'))
