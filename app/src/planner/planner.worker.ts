// Web Worker del planner: carica una volta orari e fermate, poi risponde alle richieste senza toccare il thread della UI.
import type { TripUpdate } from '../lib/board'
import { buildIndex, plan, type PlannerData, type Point } from './plan'

export type PlanRequest = { id: number; from: Point; to: Point; now: number; updates: Map<string, TripUpdate>; limit?: number } | { id: number; warm: true }
export type PlanResponse = { id: number; journeys: ReturnType<typeof plan>; computeMs: number } | { id: number; error: string }

const get = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`/data/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

let index: ReturnType<typeof load> | null = null
async function load() {
  const [stops, patterns, trips, offsets] = await Promise.all([
    get<PlannerData['stops']>('stops.json'),
    get<PlannerData['patterns']>('patterns.json'),
    get<PlannerData['trips']>('trips.json'),
    get<PlannerData['offsets']>('offsets.json'),
  ])
  return buildIndex({ stops, patterns, trips, offsets })
}

self.onmessage = async (e: MessageEvent<PlanRequest>) => {
  const req = e.data
  try {
    index ??= load()
    const ix = await index
    if ('warm' in req) return self.postMessage({ id: req.id, journeys: [], computeMs: 0 } satisfies PlanResponse)
    const t0 = performance.now()
    const journeys = plan(ix, req.from, req.to, req.now, req.updates, req.limit)
    self.postMessage({ id: req.id, journeys, computeMs: performance.now() - t0 } satisfies PlanResponse)
  } catch (err) {
    index = null // al prossimo tentativo si ricarica
    self.postMessage({ id: req.id, error: String(err) } satisfies PlanResponse)
  }
}
