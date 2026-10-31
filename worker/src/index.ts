import { rfiBoard, rfiDetail, vtBoard, vtTrain, type Source, type Train, type TrainDetail } from './trains'

interface Env {
  BUSONE_CONTACT: string
}

const BUSONE = 'https://proxy.busone.app/tep/'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Last-Modified' }
const TRAINS_TTL_MS = 30_000
const TRAINS_STALE_MS = 15 * 60_000 // entrambe le fonti giù: si serve l'ultimo dato buono fino a 15 min

const withCors = (res: Response) => {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v)
  return out
}

// shortcut: cache in memoria per isolate (su workers.dev non c'è cache condivisa, vedi /busone). Il browser
// la completa con Cache-Control: max-age=30, l'app con l'ultimo dato salvato sul telefono.
type Payload = { fetchedAt: string; source: Source; notice: string | null; stale?: boolean }
const memo = new Map<string, { at: number; body: Payload }>()

async function cached<T extends Payload>(key: string, load: () => Promise<T>): Promise<Response> {
  const hit = memo.get(key)
  const headers = { ...CORS, 'Cache-Control': `public, max-age=${TRAINS_TTL_MS / 1000}` }
  if (hit && Date.now() - hit.at < TRAINS_TTL_MS) return Response.json(hit.body, { headers })
  try {
    const body = await load()
    memo.set(key, { at: Date.now(), body })
    return Response.json(body, { headers })
  } catch (e) {
    if (hit && Date.now() - hit.at < TRAINS_STALE_MS) return Response.json({ ...hit.body, stale: true }, { headers: { ...CORS, 'Cache-Control': 'no-store' } })
    const status = e instanceof NotFound ? 404 : 503
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status, headers: { ...CORS, 'Cache-Control': 'no-store' } })
  }
}
class NotFound extends Error {}

const why = (e: unknown) => (e instanceof Error && e.name === 'TimeoutError' ? 'non risponde' : 'non disponibile')

/** ViaggiaTreno, altrimenti RFI. */
async function board(kind: 'departures' | 'arrivals'): Promise<Payload & { trains: Train[] }> {
  const now = Date.now()
  try {
    return { fetchedAt: new Date(now).toISOString(), source: 'viaggiatreno', notice: null, trains: await vtBoard(kind, now) }
  } catch (vtErr) {
    try {
      const trains = await rfiBoard(kind)
      return { fetchedAt: new Date(now).toISOString(), source: 'rfi', notice: `ViaggiaTreno ${why(vtErr)}: dati dal monitor RFI`, trains }
    } catch (rfiErr) {
      throw new Error(`ViaggiaTreno ${why(vtErr)} e monitor RFI ${why(rfiErr)}`, { cause: rfiErr })
    }
  }
}

async function train(numero: string): Promise<Payload & { train: TrainDetail }> {
  const now = new Date().toISOString()
  try {
    return { fetchedAt: now, source: 'viaggiatreno', notice: null, train: await vtTrain(numero) }
  } catch (vtErr) {
    let detail: TrainDetail | null
    try {
      detail = rfiDetail(numero, await rfiBoard('departures'), await rfiBoard('arrivals'))
    } catch (rfiErr) {
      throw new Error(`ViaggiaTreno ${why(vtErr)} e monitor RFI ${why(rfiErr)}`, { cause: rfiErr })
    }
    if (!detail) throw new NotFound(`Treno ${numero} non presente nel tabellone di Parma`)
    return { fetchedAt: now, source: 'rfi', notice: `ViaggiaTreno ${why(vtErr)}: dettaglio parziale dal monitor RFI`, train: detail }
  }
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

    if (path === '/api/trains/departures') return cached('departures', () => board('departures'))
    if (path === '/api/trains/arrivals') return cached('arrivals', () => board('arrivals'))
    const one = path.match(/^\/api\/trains\/train\/(\d{1,6})$/)
    if (one) return cached(`train:${one[1]}`, () => train(one[1]!))
    if (path.startsWith('/api/trains/train/')) return withCors(Response.json({ error: 'numero di treno non valido' }, { status: 400 }))

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
