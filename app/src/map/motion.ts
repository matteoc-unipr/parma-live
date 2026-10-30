// Movimento fluido dei bus: tra due fix la posizione viene interpolata, lungo la shape della corsa quando possibile.

type LonLat = [number, number]
export type Path = { coords: LonLat[]; cum: number[]; kx: number }
export type Pose = { lon: number; lat: number; bearing: number | null }

const KY = 110_540 // metri per grado di latitudine
const MAX_OFF_SHAPE_M = 60 // oltre: il fix non sta sulla shape, si interpola in linea retta
const MAX_DURATION_MS = 35_000 // le posizioni BusOne escono ogni 30 s
const TELEPORT_M = 2_000 // salto troppo lungo: niente animazione

export function makePath(coords: LonLat[]): Path {
  const kx = 111_320 * Math.cos(((coords[0]?.[1] ?? 45) * Math.PI) / 180)
  const cum = [0]
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1]!
    const [x1, y1] = coords[i]!
    cum.push(cum[i - 1]! + Math.hypot((x1 - x0) * kx, (y1 - y0) * KY))
  }
  return { coords, cum, kx }
}

/** Distanza lungo la shape del punto più vicino, e quanto il punto ne dista (m). */
export function project(path: Path, lon: number, lat: number) {
  const { coords, cum, kx } = path
  let best = { dist: 0, offset: Infinity }
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1]!
    const [x1, y1] = coords[i]!
    const dx = (x1 - x0) * kx
    const dy = (y1 - y0) * KY
    const px = (lon - x0) * kx
    const py = (lat - y0) * KY
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0
    const offset = Math.hypot(px - t * dx, py - t * dy)
    if (offset < best.offset) best = { dist: cum[i - 1]! + t * Math.sqrt(len2), offset }
  }
  return best
}

const bearingOf = (dx: number, dy: number) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360

/** Punto a `dist` metri dall'inizio della shape, con la direzione del segmento. */
export function pointAt(path: Path, dist: number): Pose {
  const { coords, cum, kx } = path
  let lo = 1
  let hi = coords.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum[mid]! < dist) lo = mid + 1
    else hi = mid
  }
  const [x0, y0] = coords[lo - 1]!
  const [x1, y1] = coords[lo]!
  const seg = cum[lo]! - cum[lo - 1]!
  const t = seg ? Math.max(0, Math.min(1, (dist - cum[lo - 1]!) / seg)) : 0
  return { lon: x0 + (x1 - x0) * t, lat: y0 + (y1 - y0) * t, bearing: bearingOf((x1 - x0) * kx, (y1 - y0) * KY) }
}

type Track = {
  from: Pose
  to: Pose
  t0: number
  dur: number
  tripId: string
  /** interpolazione lungo la shape: distanze di partenza e arrivo */
  along: { path: Path; dA: number; dB: number } | null
}

export type Fix = { id: string; tripId: string; lon: number; lat: number; bearing: number | null }

/** Stato di animazione di tutti i bus; `poseAt(now)` è puro rispetto al tempo passato. */
export class BusMotion {
  private tracks = new Map<string, Track>()

  /** Nuove posizioni dal feed. `intervalMs`: tempo tra questo aggiornamento e il precedente. */
  update(fixes: Fix[], now: number, intervalMs: number, pathOf: (tripId: string) => Path | undefined) {
    const next = new Map<string, Track>()
    const dur = Math.min(MAX_DURATION_MS, Math.max(0, intervalMs))
    for (const f of fixes) {
      const to: Pose = { lon: f.lon, lat: f.lat, bearing: f.bearing }
      const prev = this.tracks.get(f.id)
      if (!prev || prev.tripId !== f.tripId || dur === 0) {
        next.set(f.id, { from: to, to, t0: now, dur: 0, tripId: f.tripId, along: null })
        continue
      }
      const from = this.pose(prev, now)
      const kx = 111_320 * Math.cos((f.lat * Math.PI) / 180)
      if (Math.hypot((to.lon - from.lon) * kx, (to.lat - from.lat) * KY) > TELEPORT_M) {
        next.set(f.id, { from: to, to, t0: now, dur: 0, tripId: f.tripId, along: null })
        continue
      }
      let along: Track['along'] = null
      const path = pathOf(f.tripId)
      if (path) {
        const a = project(path, from.lon, from.lat)
        const b = project(path, to.lon, to.lat)
        // Solo in avanti e vicino alla shape: altrimenti (capolinea, deviazioni) linea retta.
        if (a.offset < MAX_OFF_SHAPE_M && b.offset < MAX_OFF_SHAPE_M && b.dist >= a.dist && b.dist - a.dist < TELEPORT_M)
          along = { path, dA: a.dist, dB: b.dist }
      }
      next.set(f.id, { from, to, t0: now, dur, tripId: f.tripId, along })
    }
    this.tracks = next
  }

  private pose(t: Track, now: number): Pose {
    const k = t.dur ? Math.min(1, Math.max(0, (now - t.t0) / t.dur)) : 1
    // Lungo la shape anche a fine corsa: nessuno scatto dal punto agganciato al fix grezzo.
    if (t.along) return pointAt(t.along.path, t.along.dA + (t.along.dB - t.along.dA) * k)
    if (k === 1) return t.to
    return {
      lon: t.from.lon + (t.to.lon - t.from.lon) * k,
      lat: t.from.lat + (t.to.lat - t.from.lat) * k,
      bearing: t.to.bearing ?? t.from.bearing,
    }
  }

  poseAt(id: string, now: number) {
    const t = this.tracks.get(id)
    return t ? this.pose(t, now) : undefined
  }

  /** true finché almeno un bus è in movimento: serve a fermare il loop rAF quando è tutto fermo. */
  moving(now: number) {
    for (const t of this.tracks.values()) if (t.dur && now - t.t0 < t.dur) return true
    return false
  }
}
