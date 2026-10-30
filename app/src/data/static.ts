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

// Colori ufficiali dal GTFS; dove mancano, i segnaposto del design.
const designLines: Record<string, string> = tokens.color.line
export const lineColor = (route: Route | undefined) =>
  route?.color ?? designLines[route?.short ?? ''] ?? tokens.color.light.text2
export const lineLabel = (route: Route | undefined) => (route?.short === 'Campus Express' ? 'CE' : (route?.short ?? '?'))
