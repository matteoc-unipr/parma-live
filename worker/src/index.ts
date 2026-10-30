interface Env {
  BUSONE_CONTACT: string
}

const BUSONE = 'https://proxy.busone.app/tep/'
const VIAGGIATRENO = 'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Last-Modified' }

// shortcut: cache in memoria per isolate (su workers.dev cf.cacheTtl e Cache API sono no-op); con un dominio custom passare a caches.default.
const REALTIME_TTL_MS = 5000
const memo = new Map<string, { at: number; body: ArrayBuffer; init: ResponseInit }>()

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
      if (!path.includes('/gtfs-rt/')) return withCors(await fetch(upstream, { headers }))
      const hit = memo.get(upstream)
      if (hit && Date.now() - hit.at < REALTIME_TTL_MS) return withCors(new Response(hit.body, hit.init))
      const res = await fetch(upstream, { headers })
      // Il body di una Response non può sopravvivere alla richiesta: in cache teniamo i byte.
      const body = await res.arrayBuffer()
      const init = { status: res.status, headers: new Headers(res.headers) }
      if (res.ok) memo.set(upstream, { at: Date.now(), body, init })
      return withCors(new Response(body, init))
    }

    // shortcut: passthrough senza cache né parsing, serve a verificare che Akamai non blocchi i Worker; il proxy treni vero arriva con la UI treni.
    if (path.startsWith('/vt/')) {
      return withCors(await fetch(VIAGGIATRENO + path.slice('/vt/'.length) + url.search))
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
