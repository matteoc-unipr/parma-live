import { expect, test } from 'vitest'
import { contrastWithWhite, fallbackColor, lineColor } from './static'

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

test('colore ufficiale, poi segnaposto del design, poi colore stabile per linea', () => {
  const route = (short: string, color: string | null = null) => ({ id: short, short, long: '', color, text: null })
  expect(lineColor(route('13', '#E3001B'))).toBe('#E3001B')
  expect(lineColor(route('1'))).toBe('#D3241C') // segnaposto del design
  expect(lineColor(route('102'))).toMatch(/^#[0-9A-F]{6}$/)
  expect(lineColor(route('102'))).toBe(lineColor(route('102'))) // stabile
  expect(fallbackColor('102')).not.toBe(fallbackColor('103'))
})

test('il numero bianco resta leggibile su ogni colore generato', () => {
  for (let i = 0; i < 500; i++) expect(contrastWithWhite(rgb(fallbackColor(String(i))))).toBeGreaterThanOrEqual(3)
})
