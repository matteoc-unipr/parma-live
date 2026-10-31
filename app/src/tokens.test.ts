import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import tokens from '../../design/tokens.json'

// Il tema scuro è duplicato in tokens.css ([data-theme] e prefers-color-scheme): verifica che nessuna copia derivi dall'handoff.
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

const block = (selector: string) => {
  const start = css.indexOf(selector)
  expect(start, selector).toBeGreaterThan(-1)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--pl-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]))
}
const kebab = (k: string) => k.replace(/([A-Z])/g, '-$1').replace(/(\d)/g, '-$1').toLowerCase()
const expected = (theme: Record<string, string>) =>
  Object.fromEntries(Object.entries(theme).map(([k, v]) => [kebab(k), v]))

test('tema chiaro = tokens.json', () => {
  expect(block(':root {')).toMatchObject(expected(tokens.color.light))
})

test.each(['[data-theme="dark"] {', ':root:not([data-theme="light"]) {'])('tema scuro %s = tokens.json', (sel) => {
  expect(block(sel)).toMatchObject(expected(tokens.color.dark))
})

// Contrasto WCAG 2.1 (DESIGN.md §2): ogni colore usato per testo ≥ 4.5:1 su sfondo e superficie.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

test.each(['light', 'dark'] as const)('contrasti del tema %s', (theme) => {
  const c = tokens.color[theme]
  for (const fg of ['text', 'text2', 'text3', 'accent', 'ok', 'late', 'cancel'] as const)
    for (const bg of ['bg', 'surface'] as const) expect(contrast(c[fg], c[bg]), `${fg} su ${bg}`).toBeGreaterThanOrEqual(4.5)
  expect(contrast(c.onAccent, c.accent), 'onAccent su accent').toBeGreaterThanOrEqual(4.5)
})
