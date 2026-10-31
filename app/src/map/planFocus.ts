// Cosa mostrare sulla mappa quando lo sheet in cima è quello dei risultati A→B: linee coinvolte, soluzione scelta, bus da prendere.
import type { Pattern } from '../data/static'
import type { Journey, RideLeg } from '../planner/plan'
import { usePlan } from '../planner/state'
import { useUi } from '../store'

export type PlanFocus = {
  journeys: Journey[]
  selected: Journey
  /** "route|dir" delle linee di tutte le soluzioni: solo questi bus restano sulla mappa */
  allowed: Set<string>
  /** "route|dir" della soluzione scelta: bus al 100%, gli altri al 30% */
  highlighted: Set<string>
  /** corsa del primo bus da prendere (marker grande) */
  takeTrip: string
  /** fermate di salita, cambio e discesa della soluzione scelta */
  stops: string[]
}

const rides = (j: Journey) => j.legs.filter((l): l is RideLeg => l.kind === 'ride')
export const lineKey = (p: Pick<Pattern, 'route' | 'dir'>) => `${p.route}|${p.dir}`

export function planFocus(patterns: Map<string, Pattern>): PlanFocus | null {
  const { sheet, search } = useUi.getState()
  const journeys = usePlan.getState().result?.journeys
  if (sheet?.kind !== 'plan' || !journeys?.length) return null
  const selected = journeys[Math.min(search.selected, journeys.length - 1)]!
  const keys = (j: Journey) => rides(j).map((r) => lineKey(patterns.get(r.patternId)!))
  return {
    journeys,
    selected,
    allowed: new Set(journeys.flatMap(keys)),
    highlighted: new Set(keys(selected)),
    takeTrip: rides(selected)[0]!.tripId,
    stops: rides(selected).flatMap((r) => [r.fromStop, r.toStop]),
  }
}
