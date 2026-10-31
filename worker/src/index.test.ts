import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const env = { BUSONE_CONTACT: 'me@example.com' }
const rfiHtml = readFileSync(new URL('../../fixtures/rfi/parma-partenze.html', import.meta.url), 'utf8')
const upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
vi.stubGlobal('fetch', upstream)

// Il Worker tiene la cache in memoria: un modulo nuovo per ogni test.
let worker: typeof import('./index').default
const get = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://w.test${path}`, init), env)
beforeEach(async () => {
  vi.resetModules()
  upstream.mockReset()
  worker = (await import('./index')).default
})
afterEach(() => vi.useRealTimers())

const vt = (url: string) => url.startsWith('http://www.viaggiatreno.it')
const rfi = (url: string) => url.startsWith('https://iechub.rfi.it')

test('/health risponde ok', async () => {
  expect(await (await get('/health')).json()).toEqual({ ok: true })
})

test('rotta sconosciuta: 404', async () => {
  expect((await get('/nope')).status).toBe(404)
})

test('BusOne realtime: header di identificazione e CORS', async () => {
  upstream.mockResolvedValue(new Response('x', { headers: { 'Last-Modified': 'ieri' } }))
  const res = await get('/busone/gtfs-rt/vehicle-positions.pb')
  expect(upstream).toHaveBeenCalledWith('https://proxy.busone.app/tep/gtfs-rt/vehicle-positions.pb', {
    headers: { 'X-BusOne-Client': 'parma-live (uso personale); me@example.com', 'X-BusOne-Use': 'personal' },
  })
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
})

test('BusOne WebSocket: upgrade inoltrato con gli header', async () => {
  upstream.mockResolvedValue(new Response('x'))
  await get('/busone/ws', { headers: { Upgrade: 'websocket' } })
  expect(upstream).toHaveBeenCalledWith('https://proxy.busone.app/tep/ws', {
    headers: expect.objectContaining({ Upgrade: 'websocket', 'X-BusOne-Use': 'personal' }),
  })
})

test('partenze da ViaggiaTreno quando risponde, con la data di Roma e cache 30 s', async () => {
  upstream.mockImplementation(async (url) =>
    vt(url) ? Response.json([{ numeroTreno: 2477, compNumeroTreno: 'RV 2477', compOrarioPartenza: '19:52', destinazione: 'RIMINI', ritardo: 3 }]) : new Response('', { status: 500 }),
  )
  const res = await get('/api/trains/departures')
  const body = (await res.json()) as { source: string; notice: string | null; trains: { label: string }[] }
  expect(body).toMatchObject({ source: 'viaggiatreno', notice: null, trains: [{ label: 'RV 2477' }] })
  expect(upstream.mock.calls[0]![0]).toMatch(/\/partenze\/S05014\/\w{3}%20\w{3}%20\d\d%20\d{4}%20\d\d%3A\d\d%3A\d\d%20GMT%2B0[12]00$/)
  expect(res.headers.get('Cache-Control')).toBe('public, max-age=30')
  await get('/api/trains/departures')
  expect(upstream).toHaveBeenCalledTimes(1) // dalla cache
})

test('ViaggiaTreno bloccato (403): ripiego sul monitor RFI con avviso', async () => {
  upstream.mockImplementation(async (url) => (vt(url) ? new Response('Access Denied', { status: 403 }) : new Response(rfiHtml)))
  const body = (await (await get('/api/trains/departures')).json()) as { source: string; notice: string; trains: unknown[] }
  expect(body.source).toBe('rfi')
  expect(body.notice).toBe('ViaggiaTreno non disponibile: dati dal monitor RFI')
  expect(body.trains).toHaveLength(29)
})

test('entrambe le fonti giù: ultimo dato buono (stale), poi 503 con messaggio chiaro', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  upstream.mockImplementation(async (url) => (vt(url) ? new Response('', { status: 403 }) : new Response(rfiHtml)))
  await get('/api/trains/arrivals')
  vi.advanceTimersByTime(60_000) // oltre i 30 s: si riprova
  upstream.mockImplementation(async () => new Response('', { status: 502 }))
  const stale = await get('/api/trains/arrivals')
  expect(stale.status).toBe(200)
  expect(await stale.json()).toMatchObject({ stale: true, source: 'rfi' })
  vi.advanceTimersByTime(20 * 60_000) // oltre i 15 min: niente più ripiego
  const down = await get('/api/trains/arrivals')
  expect(down.status).toBe(503)
  expect(await down.json()).toEqual({ error: 'ViaggiaTreno non disponibile e monitor RFI non disponibile' })
})

test('dettaglio treno: ViaggiaTreno giù → dettaglio parziale RFI; treno assente → 404; numero non valido → 400', async () => {
  upstream.mockImplementation(async (url) => (vt(url) ? new Response('', { status: 403 }) : rfi(url) ? new Response(rfiHtml) : new Response('', { status: 404 })))
  const body = (await (await get('/api/trains/train/2477')).json()) as { source: string; train: { partial: boolean; stops: unknown[] } }
  expect(body.source).toBe('rfi')
  expect(body.train.partial).toBe(true)
  expect((await get('/api/trains/train/99999')).status).toBe(404)
  expect((await get('/api/trains/train/abc')).status).toBe(400)
})
