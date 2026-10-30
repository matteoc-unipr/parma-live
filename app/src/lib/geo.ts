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
