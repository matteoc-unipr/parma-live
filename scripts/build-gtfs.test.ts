import { describe, expect, test } from 'vitest'
import { activeServices, addDays, build, parseCsv, parseTime, simplify } from './build-gtfs.ts'

const csv = (text: string) => parseCsv(text.trim() + '\n')

describe('parseCsv', () => {
  test('virgolette, virgole e "" dentro i campi, CRLF, BOM', () => {
    const rows = parseCsv('﻿id,name\r\n"1","str Lazzaretto ""Rapid"", nord"\r\n2,Piazza\r\n')
    expect(rows).toEqual([
      { id: '1', name: 'str Lazzaretto "Rapid", nord' },
      { id: '2', name: 'Piazza' },
    ])
  })
  test('ultima riga senza newline e campi vuoti', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([{ a: '1', b: '', c: '3' }])
  })
})

test('parseTime oltre le 24h', () => {
  expect(parseTime('00:00:00')).toBe(0)
  expect(parseTime('25:10:00')).toBe(90600)
  expect(parseTime('28:50:00')).toBe(103800)
})

test('addDays attraversa mese, anno e 29 febbraio', () => {
  expect(addDays('20261031', 1)).toBe('20261101')
  expect(addDays('20270101', -1)).toBe('20261231')
  expect(addDays('20280228', 1)).toBe('20280229')
})

describe('activeServices', () => {
  const calendar = csv(`
service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
FER,1,1,1,1,1,0,0,20261001,20261231
FEST,0,0,0,0,0,0,1,20261001,20261231`)

  test('giorno della settimana dentro l’intervallo', () => {
    expect(activeServices('20261030', calendar, [])).toEqual(new Set(['FER'])) // venerdì
    expect(activeServices('20261101', calendar, [])).toEqual(new Set(['FEST'])) // domenica
    expect(activeServices('20261031', calendar, [])).toEqual(new Set()) // sabato
  })
  test('fuori dall’intervallo del calendario', () => {
    expect(activeServices('20270104', calendar, [])).toEqual(new Set())
  })
  test('eccezioni: 2 toglie un feriale festivo, 1 aggiunge il festivo', () => {
    const exceptions = csv(`
service_id,date,exception_type
FER,20261208,2
FEST,20261208,1`)
    expect(activeServices('20261208', calendar, exceptions)).toEqual(new Set(['FEST'])) // martedì, Immacolata
    expect(activeServices('20261209', calendar, exceptions)).toEqual(new Set(['FER']))
  })
  test('solo calendar_dates, senza calendar.txt (come il feed TEP)', () => {
    const dates = csv(`
service_id,date,exception_type
S1,20261030,1`)
    expect(activeServices('20261030', [], dates)).toEqual(new Set(['S1']))
    expect(activeServices('20261031', [], dates)).toEqual(new Set())
  })
})

test('simplify toglie i punti allineati e tiene gli angoli', () => {
  const line: [number, number][] = [
    [10.3, 44.8],
    [10.301, 44.80001], // ~1 m fuori asse: sotto la tolleranza
    [10.302, 44.8],
    [10.302, 44.801], // angolo di ~110 m
  ]
  expect(simplify(line, 4)).toEqual([line[0], line[2], line[3]])
})

describe('build', () => {
  // Venerdì 30/10: N1 è una notturna di giovedì che passa la mezzanotte, D1/D2 diurne, X1 non attiva.
  const g = {
    routes: csv(`
route_id,route_short_name,route_long_name,route_color,route_text_color
1,1,Linea 1,E3001B,FFFFFF
N,N,Notturna,,`),
    stops: csv(`
stop_id,stop_name,stop_lat,stop_lon
A,Alfa,44.8000004,10.3000004
B,Beta,44.81,10.31
C,Gamma,44.82,10.32
Z,Isolata,44.9,10.4`),
    trips: csv(`
route_id,service_id,trip_id,trip_headsign,direction_id,shape_id
N,GIO,N1,,0,SH
1,VEN,D1,Gamma,0,SH
1,VEN,D2,Gamma,0,SH
1,VEN,X0,Beta,1,SH
1,MAI,X1,Gamma,0,SH
1,GIO,G1,Gamma,0,SH`),
    stop_times: csv(`
trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type
N1,23:50:00,23:50:00,A,1,0
N1,24:10:00,24:10:00,B,2,0
N1,24:30:00,24:30:00,C,3,0
D2,09:00:00,09:00:00,A,1,0
D2,09:05:00,09:05:00,B,2,1
D2,09:10:00,09:10:00,C,3,0
D1,08:00:00,08:00:00,A,1,0
D1,08:05:00,08:05:00,B,2,0
D1,08:10:00,08:10:00,C,3,0
X0,10:00:00,10:00:00,C,1,0
X0,10:05:00,10:05:00,B,2,0
X1,08:00:00,08:00:00,A,1,0
X1,08:10:00,08:10:00,C,2,0
G1,22:00:00,22:00:00,A,1,0
G1,22:10:00,22:10:00,B,2,0
G1,22:20:00,22:20:00,C,3,0`),
    shapes: csv(`
shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence
SH,44.82,10.32,2
SH,44.8,10.3,1`),
    calendar: [],
    calendar_dates: csv(`
service_id,date,exception_type
GIO,20261029,1
VEN,20261030,1
VEN,20261031,1`),
  }
  const out = build(g, '20261030')
  const board = (stop: string) => out.stopTimes.get(stop) ?? {}

  test('giorni: ieri, oggi, domani', () => {
    expect(out.days).toEqual(['20261029', '20261030', '20261031'])
  })

  test('corsa dopo mezzanotte: resta nel giorno di servizio di ieri, solo la parte oltre le 24h', () => {
    expect(board('B')['20261029']).toEqual([[87000, 'N1', expect.stringMatching(/^N-0-/)]])
    expect(board('A')['20261029']).toBeUndefined() // 23:50 di ieri è già passato
    expect(out.trips['20261029']!.map((t) => t[0])).toEqual(['N1']) // G1 finisce alle 22:20: esclusa
  })

  test('partenze di oggi ordinate per orario, escluse le corse non attive', () => {
    expect(board('A')['20261030']!.map((d) => d.slice(0, 2))).toEqual([
      [28800, 'D1'],
      [32400, 'D2'],
    ])
  })

  test('niente partenza al capolinea d’arrivo né dove pickup_type=1', () => {
    expect(board('C')['20261030']!.map((d) => d[1])).toEqual(['X0']) // C è capolinea di D1/D2, partenza di X0
    expect(board('B')['20261030']!.map((d) => d[1])).toEqual(['D1']) // D2 a B non carica
  })

  test('pattern: stessa sequenza = stesso pattern, id stabili tra build', () => {
    const d1 = out.trips['20261030']!.find((t) => t[0] === 'D1')![1]
    const d2 = out.trips['20261030']!.find((t) => t[0] === 'D2')![1]
    expect(d1).toBe(d2)
    expect(build(g, '20261031').patterns.map((p) => p.id)).toEqual(out.patterns.map((p) => p.id))
    expect(out.patterns.find((p) => p.id === d1)).toMatchObject({ route: '1', dir: 0, headsign: 'Gamma', stops: ['A', 'B', 'C'] })
  })

  test('headsign mancante → nome dell’ultima fermata', () => {
    expect(out.patterns.find((p) => p.route === 'N')!.headsign).toBe('Gamma')
  })

  test('routes con colori, fermate servite a 5 decimali, shape ordinate', () => {
    expect(out.routes[0]).toEqual({ id: '1', short: '1', long: 'Linea 1', color: '#E3001B', text: '#FFFFFF' })
    expect(out.routes[1]!.color).toBeNull()
    expect(out.stops.map((s) => s.id)).toEqual(['A', 'B', 'C'])
    expect(out.stops[0]).toEqual({ id: 'A', name: 'Alfa', lat: 44.8, lon: 10.3 })
    expect(out.shapes.SH).toEqual([
      [10.3, 44.8],
      [10.32, 44.82],
    ])
  })
})
