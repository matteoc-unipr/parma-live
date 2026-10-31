// Stato della ricerca A→B: risultati correnti e tempi misurati.
import { create } from 'zustand'
import type { Place } from '../store'
import { planTrip, type PlanResult } from './client'

type PlanState = { status: 'idle' | 'loading' | 'done' | 'error'; result: PlanResult | null; error: string | null }
export const usePlan = create<PlanState>(() => ({ status: 'idle', result: null, error: null }))

let seq = 0
/** Calcola A→B. I risultati precedenti restano visibili durante gli aggiornamenti (refresh ogni 15 s). */
export async function runPlan(from: Place, to: Place, { refresh = false } = {}) {
  const my = ++seq
  if (!refresh) usePlan.setState({ status: 'loading', result: null, error: null })
  try {
    const result = await planTrip(from, to)
    if (my === seq) usePlan.setState({ status: 'done', result, error: null })
  } catch (e) {
    if (my === seq) usePlan.setState({ status: 'error', error: String(e) })
  }
}
