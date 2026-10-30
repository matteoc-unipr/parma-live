interface Env {
  BUSONE_CONTACT: string
}

const BUSONE = 'https://proxy.busone.app/tep/'
const VIAGGIATRENO = 'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/'
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

    // shortcut: passthrough senza cache né parsing, serve a verificare che Akamai non blocchi i Worker; il proxy treni vero arriva con la UI treni.
    if (path.startsWith('/vt/')) {
      return withCors(await fetch(VIAGGIATRENO + path.slice('/vt/'.length) + url.search))
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
