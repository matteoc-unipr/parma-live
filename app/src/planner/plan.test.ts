import { describe, expect, test } from 'vitest'
import type { TripUpdate } from '../lib/board'
import { buildIndex, plan, type PlannerData, type RideLeg } from './plan'

process.env.TZ = 'Europe/Rome'
const KY = 110_540
const KX = 111_320 * Math.cos((44.8 * Math.PI) / 180)
/** Punto a x,y metri da un'origine a Parma. */
const at = (x: number, y = 0) => ({ lat: 44.8 + y / KY, lon: 10.3 + x / KX })
const stop = (id: string, x: number) => ({ id, name: id, ...at(x) })
const hm = (s: string) => +s.slice(0, 2) * 3600 + +s.slice(3) * 60
const time = (s: string) => new Date(`2026-10-31T${s}:00+01:00`).getTime()
const D = '20261031'

// Fermate su una retta: A vicino a S1, B vicino a S3, C vicino a S6; S4 e S5 a 100 m (cambio a piedi).
const data: PlannerData = {
  stops: [stop('S1', 0), stop('S2', 1000), stop('S3', 2000), stop('S4', 3000), stop('S5', 3100), stop('S6', 5000), stop('LONTANA', -800)],
  patterns: [
    { id: 'P', route: 'R1', dir: 0, shape: '', stops: ['S1', 'S2', 'S3'] },
    { id: 'Q', route: 'R1', dir: 1, shape: '', stops: ['S3', 'S2', 'S1'] },
    { id: 'P1', route: 'R2', dir: 0, shape: '', stops: ['S1', 'S4'] },
    { id: 'P2', route: 'R3', dir: 0, shape: '', stops: ['S5', 'S6'] },
    { id: 'PD', route: 'R5', dir: 0, shape: '', stops: ['S1', 'S6'] },
    { id: 'PF', route: 'R9', dir: 0, shape: '', stops: ['LONTANA', 'S6'] },
  ],
  offsets: [[0, 300, 600], [0, 600], [0, 300], [0, 2100]],
  trips: {
    [D]: [
      ['P-1000', 'P', hm('10:00'), 0],
      ['P-1020', 'P', hm('10:20'), 0],
      ['Q-0950', 'Q', hm('09:50'), 0],
      ['P1-1000', 'P1', hm('10:00'), 1],
      ['P2-1012', 'P2', hm('10:12'), 2], // 2 min dopo l'arrivo a S4: cambio troppo corto
      ['P2-1015', 'P2', hm('10:15'), 2],
      ['P2-1030', 'P2', hm('10:30'), 2],
      ['PD-1005', 'PD', hm('10:05'), 3], // diretta S1→S6, arriva 10:40
      ['PF-1000', 'PF', hm('10:00'), 1],
    ],
  },
}
const ix = buildIndex(data)
const now = time('09:55')
const A = at(-100)
const rides = (j: { legs: { kind: string }[] }) => j.legs.filter((l): l is RideLeg => l.kind === 'ride')

describe('plan', () => {
  test('diretta: fermata vicino ad A prima di una vicino a B, nel verso giusto', () => {
    const [j, ...rest] = plan(ix, A, at(2100), now, new Map())
    expect(rest).toEqual([]) // Q va al contrario, le altre non passano vicino a B
    expect(j!.signature).toBe('R1')
    expect(rides(j!)[0]).toMatchObject({ tripId: 'P-1000', fromStop: 'S1', toStop: 'S3', depart: time('10:00'), arrive: time('10:10') })
    expect(j!.arrive).toBe(time('10:10') + 75_000) // 100 m a 80 m/min
    expect(j!.leave).toBe(time('10:00') - 75_000)
  })

  test('un cambio entro 200 m e con almeno 3 minuti; prima per arrivo, poi la diretta più lenta', () => {
    const js = plan(ix, A, at(5050), now, new Map())
    expect(js.map((j) => j.signature)).toEqual(['R2>R3', 'R5'])
    const [t] = js
    expect(t!.transfers).toBe(1)
    expect(t!.legs.map((l) => l.kind)).toEqual(['walk', 'ride', 'walk', 'ride', 'walk'])
    expect(rides(t!)[1]).toMatchObject({ tripId: 'P2-1015', fromStop: 'S5', depart: time('10:15') }) // non la 10:12
  })

  test('raggio di 600 m: la fermata a 700 m da A non si usa', () => {
    expect(plan(ix, A, at(5050), now, new Map()).some((j) => j.signature.includes('R9'))).toBe(false)
  })

  test('corsa soppressa: si prende la successiva', () => {
    const updates = new Map<string, TripUpdate>([['P2-1015', { tripId: 'P2-1015', startDate: D, canceled: true, stops: [] }]])
    const t = plan(ix, A, at(5050), now, updates).find((j) => j.transfers)!
    expect(rides(t)[1]!.tripId).toBe('P2-1030')
  })

  test('ordinate per arrivo stimato: il ritardo live può far preferire un’altra soluzione', () => {
    // R2 in ritardo di 30 min: il cambio arriverebbe dopo la diretta R5 e quindi sparisce.
    const late = new Map<string, TripUpdate>([
      ['P1-1000', { tripId: 'P1-1000', startDate: D, canceled: false, stops: [{ stopId: 'S1', seq: 1, time: (time('10:00') + 1800_000) / 1000, delay: 1800, rel: 'SCHEDULED' }, { stopId: 'S4', seq: 2, time: (time('10:10') + 1800_000) / 1000, delay: 1800, rel: 'SCHEDULED' }] }],
    ])
    expect(plan(ix, A, at(5050), now, late).map((j) => j.signature)).toEqual(['R5'])
  })

  test('troppo tardi per tutte le corse in orizzonte: nessuna soluzione', () => {
    expect(plan(ix, A, at(2100), time('14:00'), new Map())).toEqual([])
  })
})
