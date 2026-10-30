import { parseMonitor } from './rfi'

interface Env {
  BUSONE_CONTACT: string
}

const BUSONE = 'https://proxy.busone.app/tep/'
const RFI_MONITOR = 'https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Last-Modified' }

const withCors = (res: Response) => {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v)
  return out
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname

    if (path === '/health') return Response.json({ ok: true })

    if (path.startsWith('/busone/')) {
      const upstream = BUSONE + path.slice('/busone/'.length) + url.search
      const headers: Record<string, string> = {
        'X-BusOne-Client': `parma-live (uso personale); ${env.BUSONE_CONTACT}`,
        'X-BusOne-Use': 'personal',
      }
      // Il WebSocket dal browser non può inviare header: lo apriamo noi e passiamo la 101 al client.
      if (req.headers.get('Upgrade') === 'websocket') return fetch(upstream, { headers: { ...headers, Upgrade: 'websocket' } })
      // shortcut: nessuna cache. Su workers.dev Cache API e cf.cacheTtl sono no-op e la memoria è per-isolate (0 hit misurati):
      // il limite di una richiesta realtime ogni 5 s lo applica l'app. Con un dominio custom passare a caches.default.
      return withCors(await fetch(upstream, { headers }))
    }

    // Tabellone RFI della stazione (default Parma = 2035): /rfi/partenze, /rfi/arrivi.
    const board = path.match(/^\/rfi\/(partenze|arrivi)$/)
    if (board) {
      const placeId = url.searchParams.get('placeId') ?? '2035'
      if (!/^\d+$/.test(placeId)) return new Response('placeId non valido', { status: 400 })
      const res = await fetch(`${RFI_MONITOR}?placeId=${placeId}&arrivals=${board[1] === 'arrivi' ? 'True' : 'False'}`)
      if (!res.ok) return withCors(new Response(`RFI: HTTP ${res.status}`, { status: 502 }))
      return withCors(Response.json({ fetchedAt: new Date().toISOString(), trains: parseMonitor(await res.text()) }))
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
