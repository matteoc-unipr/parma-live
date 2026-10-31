// Client del Web Worker del planner. Un solo worker per tutta l'app.
import { useRealtime } from '../data/realtime'
import type { Journey, Point } from './plan'
import type { PlanRequest, PlanResponse } from './planner.worker'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (r: PlanResponse) => void>()

function ensure() {
  if (worker) return worker
  worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<PlanResponse>) => {
    pending.get(e.data.id)?.(e.data)
    pending.delete(e.data.id)
  }
  return worker
}

function send(req: Omit<PlanRequest, 'id'>) {
  const id = nextId++
  return new Promise<PlanResponse>((resolve) => {
    pending.set(id, resolve)
    ensure().postMessage({ ...req, id })
  })
}

/** Carica in anticipo orari e indice (aprendo la tab Cerca), così la prima ricerca non paga il caricamento. */
export const warmPlanner = () => void send({ warm: true })

export type PlanResult = { journeys: Journey[]; computeMs: number; roundTripMs: number }

export async function planTrip(from: Point, to: Point, limit = 3): Promise<PlanResult> {
  const t0 = performance.now()
  const res = await send({ from, to, now: Date.now(), updates: useRealtime.getState().updates, limit })
  if ('error' in res) throw new Error(res.error)
  return { journeys: res.journeys, computeMs: res.computeMs, roundTripMs: performance.now() - t0 }
}
