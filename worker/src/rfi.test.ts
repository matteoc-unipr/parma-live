import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parseMonitor } from './rfi'

const fixture = (name: string) => readFileSync(new URL(`../../fixtures/rfi/${name}`, import.meta.url), 'utf8')

test('partenze di Parma: tutti gli operatori, ritardo, binario, fermate successive', () => {
  const trains = parseMonitor(fixture('parma-partenze.html'))
  expect(trains).toHaveLength(29)
  expect(new Set(trains.map((t) => t.operator))).toEqual(
    new Set(['FRECCIAROSSA', 'TRENITALIA', 'TRENITALIA TPER', 'TRENORD', 'INTERCITY', 'INTERCITY NOTTE']),
  )
  const t = trains.find((x) => x.number === '2477')!
  expect(t).toMatchObject({
    operator: 'TRENITALIA TPER',
    category: 'RV',
    station: 'RIMINI',
    time: '19:52',
    delayMin: 15,
    note: null,
    platform: '4',
    atPlatform: false,
    info: 'VIA RAVENNA - (VIA RAVENNA)',
  })
  expect(t.stops[0]).toEqual({ name: "S.ILARIO D'E", time: '19:58' })
  expect(t.stops.at(-1)).toEqual({ name: 'RIMINI', time: '23:18' })
  expect(trains.find((x) => x.number === '8825')).toMatchObject({ category: "ALTA VELOCITA'", delayMin: null, platform: '4' })
})

test('arrivi: provenienza, treno in stazione, niente fermate successive', () => {
  const trains = parseMonitor(fixture('parma-arrivi.html'))
  expect(trains).toHaveLength(30)
  expect(trains[0]).toMatchObject({ number: '8825', station: 'MILANO CENTRALE', atPlatform: true, stops: [], info: null })
})
