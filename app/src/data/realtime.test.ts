import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// Ambiente browser minimo: documento con visibilità, finestra, WebSocket finto.
class FakeWs {
  static all: FakeWs[] = []
  onopen?: () => void
  onmessage?: (e: { data: string }) => void
  onclose: (() => void) | null = null
  closed = false
  constructor(public url: string) {
    FakeWs.all.push(this)
  }
  close() {
    this.closed = true
  }
  tick(type: string) {
    this.onmessage?.({ data: JSON.stringify({ type }) })
  }
}
const docListeners: Record<string, () => void> = {}
let feedTs = 1000

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  FakeWs.all = []
  feedTs = 1000
  vi.stubGlobal('WebSocket', FakeWs)
  vi.stubGlobal('location', { search: '' })
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })
  vi.stubGlobal('document', {
    hidden: false,
    addEventListener: (t: string, f: () => void) => (docListeners[t] = f),
    removeEventListener: () => {},
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ header: { timestamp: feedTs++ }, entity: [] })),
  )
  vi.stubEnv('VITE_WORKER_URL', 'https://w.test')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const vehicleFetches = () => vi.mocked(fetch).mock.calls.filter(([u]) => String(u).includes('vehicle-positions')).length
const flush = () => vi.advanceTimersByTimeAsync(0)

test('WebSocket aperto: si scarica solo a ogni tick, niente polling', async () => {
  const { startRealtime } = await import('./realtime')
  startRealtime()
  await flush()
  expect(vehicleFetches()).toBe(1) // fetch iniziale
  const ws = FakeWs.all[0]!
  expect(ws.url).toBe('wss://w.test/busone/ws')
  ws.onopen!()
  await vi.advanceTimersByTimeAsync(30_000)
  expect(vehicleFetches()).toBe(1)
  ws.tick('vehicle_positions')
  await flush()
  expect(vehicleFetches()).toBe(2)
})

test('WebSocket caduto: polling ogni 10 s e riconnessione', async () => {
  const { startRealtime } = await import('./realtime')
  startRealtime()
  await flush()
  const ws = FakeWs.all[0]!
  ws.onopen!()
  ws.onclose!()
  await vi.advanceTimersByTimeAsync(10_000)
  expect(vehicleFetches()).toBe(2)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(vehicleFetches()).toBe(3)
  expect(FakeWs.all.length).toBeGreaterThan(1) // ha riprovato a connettersi
  FakeWs.all.at(-1)!.onopen!() // tornato su: il polling si ferma
  const before = vehicleFetches()
  await vi.advanceTimersByTimeAsync(30_000)
  expect(vehicleFetches()).toBe(before)
})

test('pagina in background: socket chiuso, nessun timer; al ritorno fetch immediato', async () => {
  const { startRealtime } = await import('./realtime')
  startRealtime()
  await flush()
  const ws = FakeWs.all[0]!
  ;(document as { hidden: boolean }).hidden = true
  docListeners.visibilitychange!()
  expect(ws.closed).toBe(true)
  const before = vehicleFetches()
  await vi.advanceTimersByTimeAsync(120_000)
  expect(vehicleFetches()).toBe(before)
  expect(FakeWs.all.length).toBe(1) // nessuna riconnessione in background
  ;(document as { hidden: boolean }).hidden = false
  docListeners.visibilitychange!()
  await flush()
  expect(vehicleFetches()).toBe(before + 1)
  expect(FakeWs.all.length).toBe(2)
})

test('stessa emissione già vista: i bus non vengono toccati (l’animazione continua)', async () => {
  const { startRealtime, useRealtime } = await import('./realtime')
  vi.mocked(fetch).mockImplementation(async () => Response.json({ header: { timestamp: 5000 }, entity: [] }))
  startRealtime()
  await flush()
  const buses = useRealtime.getState().buses
  FakeWs.all[0]!.onopen!()
  await vi.advanceTimersByTimeAsync(6000) // oltre il limite di 5 s tra richieste
  FakeWs.all[0]!.tick('vehicle_positions')
  await flush()
  expect(useRealtime.getState().buses).toBe(buses)
})
