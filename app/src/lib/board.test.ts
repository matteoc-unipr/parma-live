import { describe, expect, test } from 'vitest'
import { buildBoard, serviceDayStart, stopStatus, type StopTimes, type StopUpdate, type TripUpdate } from './board'

process.env.TZ = 'Europe/Rome'
const at = (iso: string) => new Date(iso).getTime()
const now = at('2026-10-30T19:00:00+01:00')
const sec = (hhmm: string) => +hhmm.slice(0, 2) * 3600 + +hhmm.slice(3) * 60
const inMin = (m: number) => (now + m * 60_000) / 1000
const stu = (stopId: string, seq: number, time: number | null, delay: number | null = 0, rel: StopUpdate['rel'] = time ? 'SCHEDULED' : 'NO_DATA'): StopUpdate => ({ stopId, seq, time, delay, rel })
const tu = (tripId: string, stops: StopUpdate[], canceled = false, startDate = '20261030'): TripUpdate => ({ tripId, startDate, canceled, stops })
const map = (...tus: TripUpdate[]) => new Map(tus.map((t) => [t.tripId, t]))

test('giorno di servizio: mezzogiorno − 12 h, anche al cambio d’ora', () => {
  expect(serviceDayStart('20261030')).toBe(at('2026-10-30T00:00:00+01:00'))
  // 25/10/2026, ritorno all'ora solare: mezzogiorno è CET, quindi l'inizio è 23:00 UTC del 24, cioè le 01:00 locali (CEST), non la mezzanotte.
  expect(serviceDayStart('20261025')).toBe(at('2026-10-24T23:00:00Z'))
  expect(serviceDayStart('20261025')).toBe(at('2026-10-25T00:00:00+02:00') + 3600_000)
})

describe('stopStatus', () => {
  test('nessuna trip update o giorno diverso: programmato', () => {
    expect(stopStatus(undefined, '20261030', 'S').kind).toBe('scheduled')
    expect(stopStatus(tu('T', [stu('S', 3, inMin(2))], false, '20261031'), '20261030', 'S').kind).toBe('scheduled')
  })
  test('corsa cancellata e fermata saltata', () => {
    expect(stopStatus(tu('T', [], true), '20261030', 'S').kind).toBe('cancelled')
    expect(stopStatus(tu('T', [stu('S', 3, null, null, 'SKIPPED'), stu('X', 4, inMin(3))]), '20261030', 'S').kind).toBe('skipped')
  })
  test('NO_DATA prima della prima stima: già passata; dopo: vale l’orario', () => {
    const t = tu('T', [stu('A', 1, null), stu('B', 2, inMin(1)), stu('C', 3, null)])
    expect(stopStatus(t, '20261030', 'A').kind).toBe('passed')
    expect(stopStatus(t, '20261030', 'C').kind).toBe('scheduled')
    expect(stopStatus(t, '20261030', 'B')).toEqual({ kind: 'live', eta: inMin(1) * 1000, delaySec: 0 })
  })
  test('fermata assente dalla trip update (feed TEP: solo fermate future): già passata', () => {
    expect(stopStatus(tu('T', [stu('B', 5, inMin(1))]), '20261030', 'A').kind).toBe('passed')
  })
  test('trip update senza alcuna stima: vale l’orario', () => {
    expect(stopStatus(tu('T', [stu('A', 1, null)]), '20261030', 'A').kind).toBe('scheduled')
  })
})

describe('buildBoard', () => {
  test('live ordinati per ETA, poi gli altri per orario; passati, solo-arrivo e fuori finestra esclusi', () => {
    const times: StopTimes = {
      '20261030': [
        [sec('18:50'), 'PASSATO', 'p1'],
        [sec('19:05'), 'LIVE_LATE', 'p1'],
        [sec('19:03'), 'LIVE_OK', 'p2'],
        [sec('19:10'), 'SCHED', 'p1'],
        [sec('19:08'), 'SOPPRESSA', 'p1'],
        [sec('19:12'), 'SALTA', 'p1'],
        [sec('19:15'), 'CAPOLINEA', 'p1', 1],
        [sec('21:00'), 'LONTANO', 'p1'],
        [sec('19:20'), 'GIA_PASSATA_RT', 'p1'],
      ],
    }
    const updates = map(
      tu('LIVE_LATE', [stu('S', 3, inMin(2), -180)]),
      tu('LIVE_OK', [stu('S', 3, inMin(4), 60)]),
      tu('SOPPRESSA', [], true),
      tu('SALTA', [stu('S', 3, null, null, 'SKIPPED'), stu('Y', 4, inMin(14))]),
      tu('GIA_PASSATA_RT', [stu('ALTRA', 9, inMin(0))]),
    )
    const { rows, night } = buildBoard('S', times, updates, now)
    expect(night).toBe(false)
    expect(rows.map((r) => [r.tripId, r.source])).toEqual([
      ['LIVE_LATE', 'live'],
      ['LIVE_OK', 'live'],
      ['SOPPRESSA', 'cancelled'],
      ['SCHED', 'scheduled'],
      ['SALTA', 'skipped'],
    ])
  })

  test('stesso trip_id in due giorni: la stima vale solo per il giorno della trip update', () => {
    const times: StopTimes = { '20261030': [[sec('19:05'), 'T', 'p']], '20261031': [[sec('19:05'), 'T', 'p']] }
    const { rows } = buildBoard('S', times, map(tu('T', [stu('S', 1, inMin(6), 60)])), now)
    expect(rows.map((r) => r.source)).toEqual(['live'])
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
})
