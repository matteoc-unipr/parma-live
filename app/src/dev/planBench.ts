// `?fps`: window.__planBench(n) misura n ricerche A→B tra punti casuali in città, attraverso il Web Worker vero.
import { useStatic } from '../data/static'
import { planTrip } from '../planner/client'

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]!
const round = (x: number) => Math.round(x * 10) / 10

export function installPlanBench() {
  Object.assign(window, {
    __planBench: async (n = 100) => {
      const data = useStatic.getState().data
      if (!data) throw new Error('dati statici non ancora caricati')
      // Fermate del comune di Parma, con un punto casuale entro ~300 m: indirizzi realistici, non sempre su una fermata.
      const city = [...data.stops.values()].filter((s) => s.lat > 44.77 && s.lat < 44.83 && s.lon > 10.28 && s.lon < 10.37)
      const at = (i: number) => {
        const s = city[Math.floor(((i * 7919 + 13) % 104729) / 104729 * city.length)]!
        return { lat: s.lat + ((i % 7) - 3) * 0.0008, lon: s.lon + ((i % 5) - 2) * 0.0011 }
      }
      const t0 = performance.now()
      await planTrip(at(0), at(1)) // a freddo: include il caricamento di orari e indice nel worker
      const cold = performance.now() - t0
      const compute: number[] = []
      const roundTrip: number[] = []
      let found = 0
      for (let i = 0; i < n; i++) {
        const r = await planTrip(at(2 * i + 2), at(2 * i + 3))
        compute.push(r.computeMs)
        roundTrip.push(r.roundTripMs)
        if (r.journeys.length) found++
      }
      return {
        n,
        withResults: found,
        coldMs: round(cold),
        computeMs: { p50: round(pct(compute, 0.5)), p95: round(pct(compute, 0.95)), max: round(pct(compute, 1)) },
        roundTripMs: { p50: round(pct(roundTrip, 0.5)), p95: round(pct(roundTrip, 0.95)), max: round(pct(roundTrip, 1)) },
      }
    },
  })
}
