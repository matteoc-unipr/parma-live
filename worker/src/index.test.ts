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

test('BusOne realtime: header di identificazione e CORS', async () => {
  const res = await get('/busone/gtfs-rt/vehicle-positions.pb')
  expect(upstream).toHaveBeenCalledWith('https://proxy.busone.app/tep/gtfs-rt/vehicle-positions.pb', {
    headers: { 'X-BusOne-Client': 'parma-live (uso personale); me@example.com', 'X-BusOne-Use': 'personal' },
  })
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(res.headers.get('Last-Modified')).toBe('ieri')
})

test('BusOne WebSocket: upgrade inoltrato con gli header', async () => {
  await get('/busone/ws', { headers: { Upgrade: 'websocket' } })
  expect(upstream).toHaveBeenCalledWith('https://proxy.busone.app/tep/ws', {
    headers: expect.objectContaining({ Upgrade: 'websocket', 'X-BusOne-Use': 'personal' }),
  })
})

test('RFI: partenze/arrivi di Parma in JSON, placeId validato', async () => {
  upstream.mockResolvedValueOnce(new Response('<table></table>'))
  const res = await get('/rfi/arrivi')
  expect(upstream).toHaveBeenCalledWith(
    'https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?placeId=2035&arrivals=True',
  )
  expect(await res.json()).toMatchObject({ trains: [] })
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect((await get('/rfi/partenze?placeId=1;x')).status).toBe(400)
})

test('RFI non raggiungibile: 502', async () => {
  upstream.mockResolvedValueOnce(new Response('no', { status: 403 }))
  expect((await get('/rfi/partenze')).status).toBe(502)
})
