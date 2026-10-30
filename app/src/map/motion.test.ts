import { describe, expect, test } from 'vitest'
import { BusMotion, makePath, pointAt, project } from './motion'

// Shape a L: 0,0 → est ~787 m → nord ~1105 m (a Parma).
const L = makePath([
  [10.3, 44.8],
  [10.31, 44.8],
  [10.31, 44.81],
])
const near = (a: number, b: number, tol = 1) => expect(Math.abs(a - b)).toBeLessThan(tol)

describe('geometria della shape', () => {
  test('lunghezze cumulative in metri', () => {
    near(L.cum[1]!, 790, 5)
    near(L.cum[2]!, 790 + 1105, 5)
  })
  test('proiezione: distanza lungo la shape e scostamento', () => {
    const p = project(L, 10.305, 44.8001) // a metà del primo tratto, ~11 m a nord
    near(p.dist, L.cum[1]! / 2, 2)
    near(p.offset, 11, 1)
  })
  test('pointAt segue la shape anche dopo la curva, con la direzione del segmento', () => {
    const a = pointAt(L, 100)
    expect(a.lat).toBe(44.8)
    near(a.bearing!, 90)
    const b = pointAt(L, L.cum[1]! + 100)
    near(b.lon, 10.31, 1e-9)
    near(b.bearing!, 0)
    expect(pointAt(L, 1e9)).toMatchObject({ lon: 10.31, lat: 44.81 }) // oltre la fine: si ferma
  })
})

describe('BusMotion', () => {
  const pathOf = () => L
  const fix = (lon: number, lat: number, tripId = 'T') => ({ id: 'B', tripId, lon, lat, bearing: 90 })

  test('primo fix: nessuna animazione', () => {
    const m = new BusMotion()
    m.update([fix(10.301, 44.8)], 0, 30_000, pathOf)
    expect(m.poseAt('B', 0)).toMatchObject({ lon: 10.301, lat: 44.8 })
    expect(m.moving(0)).toBe(false)
  })

  test('a metà intervallo il bus è a metà strada lungo la shape, anche dopo la curva', () => {
    const m = new BusMotion()
    m.update([fix(10.305, 44.8)], 0, 0, pathOf) // 395 m dall'inizio
    m.update([fix(10.31, 44.805)], 1000, 30_000, pathOf) // 790 + 552 m
    const mid = m.poseAt('B', 1000 + 15_000)!
    const d = project(L, mid.lon, mid.lat)
    near(d.offset, 0, 0.5) // sulla shape, non sulla diagonale
    near(d.dist, (395 + 1342) / 2, 3)
    expect(m.moving(1000 + 15_000)).toBe(true)
    expect(m.moving(1000 + 30_001)).toBe(false)
  })

  test('fix lontano dalla shape o all’indietro: linea retta', () => {
    const m = new BusMotion()
    m.update([fix(10.308, 44.8)], 0, 0, pathOf)
    m.update([fix(10.302, 44.8)], 0, 10_000, pathOf) // indietro
    const mid = m.poseAt('B', 5000)!
    near(mid.lon, 10.305, 1e-9)
  })

  test('cambio corsa o salto > 2 km: teletrasporto', () => {
    const m = new BusMotion()
    m.update([fix(10.3, 44.8)], 0, 0, pathOf)
    m.update([fix(10.31, 44.8, 'ALTRA')], 0, 30_000, pathOf)
    expect(m.poseAt('B', 1)).toMatchObject({ lon: 10.31 })
    m.update([fix(10.4, 44.9, 'ALTRA')], 0, 30_000, pathOf)
    expect(m.poseAt('B', 1)).toMatchObject({ lon: 10.4 })
  })

  test('bus sparito dal feed: rimosso', () => {
    const m = new BusMotion()
    m.update([fix(10.3, 44.8)], 0, 0, pathOf)
    m.update([], 0, 30_000, pathOf)
    expect(m.poseAt('B', 0)).toBeUndefined()
  })
})
