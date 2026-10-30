// Banco di prova: `?bench=100` sostituisce il feed con N bus sintetici che percorrono le shape reali.
// Aggiornamento ogni 5 s (6 volte più spesso del feed vero): tutti i bus sono sempre in movimento.
import type { Bus } from '../data/realtime'
import { useRealtime } from '../data/realtime'
import { useStatic } from '../data/static'
import { makePath, pointAt, type Path } from '../map/motion'

const EVERY_MS = 5000

export function startBench(n: number) {
  let timer: ReturnType<typeof setInterval> | undefined
  const unsub = useStatic.subscribe(({ data }) => {
    if (!data || timer) return
    const trips = [...data.tripPattern].filter(([, p]) => (data.shapes[data.patterns.get(p)?.shape ?? '']?.length ?? 0) > 20)
    const fleet = Array.from({ length: n }, (_, i) => {
      const [tripId, patternId] = trips[(i * 7919) % trips.length]!
      const pattern = data.patterns.get(patternId)!
      const path: Path = makePath(data.shapes[pattern.shape]!)
      const total = path.cum.at(-1)!
      return { id: `bench-${i}`, tripId, routeId: pattern.route, path, total, d: (i * 997) % total, speed: 5 + (i % 5) }
    })
    const emit = () => {
      const buses: Bus[] = fleet.map((b) => {
        b.d = (b.d + (b.speed * EVERY_MS) / 1000) % b.total
        const p = pointAt(b.path, b.d)
        return { id: b.id, label: b.id, tripId: b.tripId, routeId: b.routeId, lat: p.lat, lon: p.lon, bearing: p.bearing, stopId: null }
      })
      const now = Date.now()
      const prev = useRealtime.getState().feedAt
      useRealtime.setState({ buses, feedAt: now, feedInterval: prev ? now - prev : 0, syncAt: now, failed: false })
    }
    emit()
    timer = setInterval(emit, EVERY_MS)
  })
  useStatic.setState({}) // innesca la subscribe se i dati sono già caricati
  return () => {
    unsub()
    clearInterval(timer)
  }
}
