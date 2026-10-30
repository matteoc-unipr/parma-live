import { expect, test } from 'vitest'
import { buildBoard, serviceDayStart, type TripUpdate } from './board'

process.env.TZ = 'Europe/Rome'
const at = (iso: string) => new Date(iso).getTime()

test('giorno di servizio: mezzogiorno − 12 h, anche al cambio d’ora', () => {
  expect(serviceDayStart('20261030')).toBe(at('2026-10-30T00:00:00+01:00'))
  // 25/10/2026, ritorno all'ora solare: mezzogiorno è CET, quindi l'inizio è 23:00 UTC del 24, cioè le 01:00 locali (CEST), non la mezzanotte.
  expect(serviceDayStart('20261025')).toBe(at('2026-10-24T23:00:00Z'))
  expect(serviceDayStart('20261025')).toBe(at('2026-10-25T00:00:00+02:00') + 3600_000)
})

const now = at('2026-10-30T19:00:00+01:00')
const sec = (hhmm: string) => +hhmm.slice(0, 2) * 3600 + +hhmm.slice(3) * 60

test('live ordinati per ETA, poi programmati; passati e fuori finestra esclusi', () => {
  const times = {
    '20261030': [
      [sec('18:50'), 'PASSATO', 'p1'],
      [sec('19:05'), 'LIVE_LATE', 'p1'],
      [sec('19:03'), 'LIVE_OK', 'p2'],
      [sec('19:10'), 'SCHED', 'p1'],
      [sec('21:00'), 'LONTANO', 'p1'],
      [sec('19:20'), 'GIA_PASSATA_RT', 'p1'],
    ] as [number, string, string][],
  }
  const updates = new Map<string, TripUpdate>([
    ['LIVE_LATE', { tripId: 'LIVE_LATE', startDate: '20261030', stops: [{ stopId: 'S', seq: 3, time: (now + 2 * 60_000) / 1000, delay: -180 }] }],
    ['LIVE_OK', { tripId: 'LIVE_OK', startDate: '20261030', stops: [{ stopId: 'S', seq: 3, time: (now + 4 * 60_000) / 1000, delay: 60 }] }],
    ['GIA_PASSATA_RT', { tripId: 'GIA_PASSATA_RT', startDate: '20261030', stops: [{ stopId: 'ALTRA', seq: 9, time: now / 1000, delay: 0 }] }],
  ])
  const { rows, night } = buildBoard('S', times, updates, now)
  expect(night).toBe(false)
  expect(rows.map((r) => [r.tripId, r.source])).toEqual([
    ['LIVE_LATE', 'live'],
    ['LIVE_OK', 'live'],
    ['SCHED', 'scheduled'],
  ])
})

test('corsa dopo mezzanotte del giorno di servizio precedente', () => {
  const late = at('2026-10-31T00:30:00+01:00')
  const { rows } = buildBoard('S', { '20261030': [[sec('24:40'), 'NOTTURNA', 'p']] }, new Map(), late)
  expect(rows[0]).toMatchObject({ tripId: 'NOTTURNA', scheduled: at('2026-10-31T00:40:00+01:00') })
})

test('notte: nessun passaggio in finestra → prime corse del mattino', () => {
  const night = at('2026-10-31T02:00:00+01:00')
  const { rows, night: isNight } = buildBoard('S', { '20261031': [[sec('05:42'), 'PRIMA', 'p'], [sec('06:10'), 'SECONDA', 'p']] }, new Map(), night)
  expect(isNight).toBe(true)
  expect(rows.map((r) => r.tripId)).toEqual(['PRIMA', 'SECONDA'])
})

test('stesso trip_id in due giorni: la stima vale solo per il giorno della trip update', () => {
  const times = { '20261030': [[sec('19:05'), 'T', 'p']], '20261031': [[sec('19:05'), 'T', 'p']] } as Record<string, [number, string, string][]>
  const updates = new Map<string, TripUpdate>([['T', { tripId: 'T', startDate: '20261030', stops: [{ stopId: 'S', seq: 1, time: (now + 6 * 60_000) / 1000, delay: 60 }] }]])
  const { rows } = buildBoard('S', times, updates, now)
  expect(rows.map((r) => r.source)).toEqual(['live'])
})
