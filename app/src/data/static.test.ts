import { expect, test } from 'vitest'
import { contrastWithWhite, fallbackColor, lineColor, lineTextColor } from './static'

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

test('nessun colore generato nella fascia del fucsia (300–345°)', () => {
  for (let i = 0; i < 500; i++) {
    const [r, g, b] = rgb(fallbackColor(String(i)))
    const max = Math.max(r!, g!, b!)
    const min = Math.min(r!, g!, b!)
    if (max === min) continue
    const hue = max === r ? (60 * ((g! - b!) / (max - min)) + 360) % 360 : max === g ? 60 * ((b! - r!) / (max - min)) + 120 : 60 * ((r! - g!) / (max - min)) + 240
    expect(hue < 299 || hue > 346, `${i}: ${hue}`).toBe(true)
  }
})

test('numero del badge leggibile (≥ 4.5:1): bianco o nero, l’ufficiale solo se leggibile', () => {
  const route = (color: string, text: string | null = null) => ({ id: 'x', short: 'x', long: '', color, text })
  expect(lineTextColor(route('#1D3A8F'))).toBe('#FFFFFF') // blu scuro
  expect(lineTextColor(route('#A4B425'))).toBe('#0B0B0F') // verde chiaro: col bianco 2.3:1
  expect(lineTextColor(route('#A4B425', '#FFFFFF'))).toBe('#0B0B0F') // ufficiale illeggibile
  expect(lineTextColor(route('#1D3A8F', '#FFFF00'))).toBe('#FFFF00')
})
