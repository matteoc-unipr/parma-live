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
