import { afterEach, expect, test, vi } from 'vitest'
import worker from './index'

const env = { BUSONE_CONTACT: 'me@example.com' }
const get = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://w.test${path}`, init), env)
const upstream = vi.fn(async () => new Response('x', { headers: { 'Last-Modified': 'ieri' } }))
vi.stubGlobal('fetch', upstream)
afterEach(() => upstream.mockClear())

test('/health risponde ok', async () => {
  const res = await get('/health')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})

test('rotta sconosciuta: 404', async () => {
  expect((await get('/nope')).status).toBe(404)
})

test('BusOne realtime: header di identificazione, CORS, cache 5 s', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const res = await get('/busone/gtfs-rt/vehicle-positions.pb')
  expect(upstream).toHaveBeenCalledWith('https://proxy.busone.app/tep/gtfs-rt/vehicle-positions.pb', {
    headers: { 'X-BusOne-Client': 'parma-live (uso personale); me@example.com', 'X-BusOne-Use': 'personal' },
  })
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(res.headers.get('Last-Modified')).toBe('ieri')
  expect(await res.text()).toBe('x')

  vi.advanceTimersByTime(4000)
  const cached = await get('/busone/gtfs-rt/vehicle-positions.pb')
  expect(await cached.text()).toBe('x')
  expect(upstream).toHaveBeenCalledTimes(1)

  vi.advanceTimersByTime(1500)
  await get('/busone/gtfs-rt/vehicle-positions.pb')
  expect(upstream).toHaveBeenCalledTimes(2)
  vi.useRealTimers()
})

test('BusOne WebSocket: upgrade inoltrato con gli header', async () => {
  await get('/busone/ws', { headers: { Upgrade: 'websocket' } })
  expect(upstream).toHaveBeenCalledWith('https://proxy.busone.app/tep/ws', {
    headers: expect.objectContaining({ Upgrade: 'websocket', 'X-BusOne-Use': 'personal' }),
  })
})

test('ViaggiaTreno: passthrough con query', async () => {
  await get('/vt/autocompletaStazione/PARMA?x=1')
  expect(upstream).toHaveBeenCalledWith(
    'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/autocompletaStazione/PARMA?x=1',
  )
})
