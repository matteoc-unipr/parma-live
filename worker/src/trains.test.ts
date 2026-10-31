import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseMonitor } from './rfi'
import { fromRfi, fromVtAndamento, fromVtBoardItem, parseTrainSearch, rfiDetail, vtDate } from './trains'

const fixture = (path: string) => readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8')
const ms = (iso: string) => new Date(iso).getTime()

describe('ViaggiaTreno (campioni reali del 31/10/2026)', () => {
  const partenze = JSON.parse(fixture('viaggiatreno/partenze.json'))
  const arrivi = JSON.parse(fixture('viaggiatreno/arrivi.json'))
  const andamento = JSON.parse(fixture('viaggiatreno/andamento.json'))

  test('data alla Roma nel formato di Date.toString(), ora solare e legale', () => {
    expect(vtDate(ms('2026-10-31T09:45:00Z'))).toBe('Sat Oct 31 2026 10:45:00 GMT+0100')
    expect(vtDate(ms('2026-07-15T08:05:09Z'))).toBe('Wed Jul 15 2026 10:05:09 GMT+0200')
  })

  test('partenza: categoria+numero, destinazione, binario programmato ed effettivo, ritardo', () => {
    expect(fromVtBoardItem(partenze[0], 'departures')).toEqual({
      number: '3915', label: 'REG 3915', category: 'REG', time: '10:27', station: 'ANCONA',
      platform: { planned: '4', actual: '4' }, delayMin: 1, cancelled: false, inStation: true, lastSeen: null,
    })
  })

  test('arrivo: provenienza e orario d’arrivo; binario ancora sconosciuto', () => {
    expect(fromVtBoardItem(arrivi[0], 'arrivals')).toMatchObject({ label: 'REG 90317', station: 'SUZZARA', time: '07:28', delayMin: 6, platform: { planned: null, actual: null } })
  })

  test('cancellato e rilevazione "--" (campione SINTETICO: nessuna soppressione nei dati reali)', () => {
    expect(fromVtBoardItem({ ...partenze[0], provvedimento: 1, stazioneUltimoRilevamento: '--' }, 'departures')).toMatchObject({ cancelled: true, lastSeen: null })
    expect(fromVtAndamento({ ...andamento, tipoTreno: 'ST' }).cancelled).toBe(true)
  })

  test('andamento: ultima rilevazione, fermate passate con orario reale, future stimate col ritardo del treno', () => {
    const d = fromVtAndamento(andamento)
    expect(d).toMatchObject({ label: 'REG 3915', origin: 'PIACENZA', destination: 'ANCONA', delayMin: 1, partial: false, lastSeen: { station: "S.ILARIO D'ENZA", time: '10:33' } })
    expect(d.stops).toHaveLength(31)
    expect(d.stops[0]).toMatchObject({ name: 'PIACENZA', planned: '09:46', actual: '09:47', passed: true, platform: { planned: '8', actual: '8' } })
    const parma = d.stops.find((s) => s.name === 'PARMA')!
    expect(parma).toMatchObject({ planned: '10:27', actual: '10:27', passed: true, platform: { planned: '4', actual: '4' } })
    const last = d.stops.at(-1)!
    expect(last).toMatchObject({ name: 'ANCONA', planned: '14:50', actual: '14:51', passed: false, platform: { planned: '1 Ovest', actual: null } }) // +1 min del treno
  })

  test('ricerca del numero: stazione d’origine e mezzanotte', () => {
    expect(parseTrainSearch(fixture('viaggiatreno/cerca-numero.txt'))).toEqual({ origin: 'S05000', midnight: '1793401200000' })
    expect(parseTrainSearch('')).toBeNull()
  })
})

describe('ripiego RFI', () => {
  const departures = parseMonitor(fixture('rfi/parma-partenze.html')).map(fromRfi)
  const arrivals = parseMonitor(fixture('rfi/parma-arrivi.html')).map(fromRfi)

  test('tabellone RFI negli stessi campi: binario solo "attuale", niente rilevazioni', () => {
    expect(departures.find((t) => t.number === '2477')).toMatchObject({
      label: 'RV 2477', time: '19:52', station: 'RIMINI', platform: { planned: null, actual: '4' }, delayMin: 15, cancelled: false, lastSeen: null,
    })
    expect(departures.find((t) => t.number === '8825')!.label).toBe('FR 8825')
  })

  test('dettaglio parziale: Parma e fermate successive stimate col ritardo; provenienza dagli arrivi', () => {
    const d = rfiDetail('2477', departures, arrivals)!
    expect(d).toMatchObject({ partial: true, origin: 'MILANO CENTRALE', destination: 'RIMINI', delayMin: 15 })
    expect(d.stops[0]).toMatchObject({ name: 'PARMA', planned: '19:52', actual: '20:07', platform: { actual: '4' } })
    expect(d.stops.at(-1)).toMatchObject({ name: 'RIMINI', planned: '23:18', actual: '23:33' })
    expect(rfiDetail('99999', departures, arrivals)).toBeNull()
  })
})
