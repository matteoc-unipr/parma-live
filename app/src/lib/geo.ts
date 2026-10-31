/** Indice del vertice della polilinea [lon, lat] più vicino al punto (distanza equirettangolare). */
export function nearestIndex(line: [number, number][], lon: number, lat: number) {
  const k = Math.cos((lat * Math.PI) / 180)
  let best = 0
  let bestD = Infinity
  line.forEach(([x, y], i) => {
    const d = ((x - lon) * k) ** 2 + (y - lat) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Polyline di Google (precisione 1e-5) → punti [lon, lat]. */
export function decodePolyline(s: string): [number, number][] {
  const out: [number, number][] = []
  let i = 0
  let lat = 0
  let lon = 0
  const next = () => {
    let shift = 0
    let result = 0
    let b: number
    do {
      b = s.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < s.length) {
    lat += next()
    lon += next()
    out.push([lon / 1e5, lat / 1e5])
  }
  return out
}
