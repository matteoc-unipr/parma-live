import { expect, test } from 'vitest'
import { fuzzySearch, normalize } from './fuzzy'

const names = ['Piazzale della Pace', 'Università Campus', 'Barriera Bixio', 'b.ra Garibaldi', 'Stazione ferroviaria', "Sant'Ilario", 'Ospedale Maggiore']
const find = (q: string) => fuzzySearch(names, (n) => n, q)

test('normalize: accenti, maiuscole, punteggiatura', () => {
  expect(normalize("Università  Sant'Ilario")).toBe('universita sant ilario')
})

test('tollerante agli accenti in entrambe le direzioni', () => {
  expect(find('universita')[0]).toBe('Università Campus')
  expect(find('UNIVERSITÀ')[0]).toBe('Università Campus')
})

test('per parole, in qualsiasi ordine, con prefissi', () => {
  expect(find('pace piazz')[0]).toBe('Piazzale della Pace')
  expect(find('b.ra gar')[0]).toBe('b.ra Garibaldi')
  expect(find('sant ilario')[0]).toBe("Sant'Ilario")
})

test('un errore di battitura su parole lunghe', () => {
  expect(find('stazone')[0]).toBe('Stazione ferroviaria')
  expect(find('ospedlae')).toEqual([]) // due errori: niente
  expect(find('bix')).toEqual(['Barriera Bixio']) // parole corte: solo corrispondenze vere
})

test('tutte le parole devono corrispondere; i prefissi battono le sottostringhe', () => {
  expect(find('stazione garibaldi')).toEqual([])
  expect(fuzzySearch(['Via Langhirano', 'Langhirano'], (n) => n, 'langhirano')).toEqual(['Langhirano', 'Via Langhirano'])
})
