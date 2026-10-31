// Realtime BusOne via Worker: il WebSocket segnala una nuova emissione, poi si scarica il feed JSON.
import { create } from 'zustand'
import type { TripUpdate } from '../lib/board'
import { startBench } from '../dev/bench'

export const WORKER = import.meta.env.VITE_WORKER_URL as string

export type Bus = {
  id: string
  label: string
  tripId: string
  routeId: string
  lat: number
  lon: number
  bearing: number | null
  stopId: string | null
}

type Realtime = {
  buses: Bus[]
  /** timestamp dell'header del feed (ms) */
  feedAt: number | null
  /** ms tra le ultime due emissioni: durata dell'interpolazione dei bus */
  feedInterval: number
  /** ultimo fetch riuscito (ms) */
  syncAt: number | null
  failed: boolean
  online: boolean
  updates: Map<string, TripUpdate>
  updatesAt: number | null
}

export const useRealtime = create<Realtime>(() => ({
  buses: [],
  feedAt: null,
  feedInterval: 0,
  syncAt: null,
  failed: false,
  online: navigator.onLine,
  updates: new Map(),
  updatesAt: null,
}))

export type FeedStatus = 'loading' | 'live' | 'stale' | 'offline' | 'night'
export function feedStatus(s: Realtime, now: number): FeedStatus {
  if (!s.online || s.failed) return 'offline' // design: navigator.onLine false o fetch fallito
  if (!s.syncAt) return 'loading'
  if (!s.buses.length) return 'night'
  if (s.feedAt && now - s.feedAt > 60_000) return 'stale'
  return 'live'
}

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON GTFS-RT di BusOne (snake_case), letto solo qui */
const parseBuses = (json: any): Bus[] =>
  (json.entity ?? [])
    .filter((e: any) => e.vehicle?.position && e.vehicle.trip)
    .map((e: any) => ({
      id: e.id,
      label: e.vehicle.vehicle?.label ?? e.id,
      tripId: e.vehicle.trip.trip_id,
      routeId: e.vehicle.trip.route_id,
      lat: e.vehicle.position.latitude,
      lon: e.vehicle.position.longitude,
      bearing: e.vehicle.position.bearing ?? null,
      stopId: e.vehicle.stop_id ?? null,
    }))

const parseUpdates = (json: any) =>
  new Map<string, TripUpdate>(
    (json.entity ?? [])
      .filter((e: any) => e.trip_update?.trip?.trip_id)
      .map((e: any) => {
        const tu = e.trip_update
        return [
          tu.trip.trip_id,
          {
            tripId: tu.trip.trip_id,
            startDate: tu.trip.start_date,
            canceled: tu.trip.schedule_relationship === 'CANCELED',
            // NO_DATA e SKIPPED restano: servono a capire se la fermata è già passata o verrà saltata (lib/board.ts).
            stops: (tu.stop_time_update ?? []).map((s: any) => {
              const ev = s.arrival ?? s.departure
              const rel = s.schedule_relationship === 'SKIPPED' || s.schedule_relationship === 'NO_DATA' ? s.schedule_relationship : 'SCHEDULED'
              return { stopId: s.stop_id, seq: s.stop_sequence, time: rel === 'SCHEDULED' ? (ev?.time ?? null) : null, delay: ev?.delay ?? null, rel }
            }),
          },
        ]
      }),
  )
/* eslint-enable @typescript-eslint/no-explicit-any */

// Al massimo una richiesta ogni 5 s per feed e una sola in volo (regola BusOne, vedi CLAUDE.md).
const MIN_GAP_MS = 5000
function throttled(path: string, apply: (json: unknown) => void) {
  let last = 0
  let inFlight = false
  return async (force = false) => {
    if (inFlight || (!force && Date.now() - last < MIN_GAP_MS)) return
    inFlight = true
    last = Date.now()
    try {
      const res = await fetch(`${WORKER}/busone/gtfs-rt/${path}`)
      if (!res.ok) throw new Error(String(res.status))
      apply(await res.json())
    } catch {
      useRealtime.setState({ failed: true })
    } finally {
      inFlight = false
    }
  }
}

const fetchVehicles = throttled('vehicle-positions.json', (json) => {
  const header = (json as { header?: { timestamp?: number } }).header
  const feedAt = header?.timestamp ? header.timestamp * 1000 : Date.now()
  const prev = useRealtime.getState().feedAt
  // Stessa emissione già vista (poll senza novità): non toccare i bus, l'animazione in corso resta valida.
  if (prev === feedAt) return useRealtime.setState({ syncAt: Date.now(), failed: false })
  useRealtime.setState({
    buses: parseBuses(json),
    feedAt,
    // Dopo una pausa lunga (background, offline) niente animazione: i bus si riposizionano.
    feedInterval: prev && feedAt - prev <= 60_000 ? feedAt - prev : 0,
    syncAt: Date.now(),
    failed: false,
  })
})
const fetchUpdates = throttled('trip-updates.json', (json) =>
  useRealtime.setState({ updates: parseUpdates(json), updatesAt: Date.now() }),
)

// Le trip updates (~65 KB) si scaricano solo mentre qualcuno le mostra, al massimo ogni 20 s.
let updateSubscribers = 0
const UPDATES_EVERY_MS = 20_000
export function subscribeUpdates() {
  updateSubscribers++
  const { updatesAt } = useRealtime.getState()
  if (!updatesAt || Date.now() - updatesAt > UPDATES_EVERY_MS) void fetchUpdates(true)
  return () => void updateSubscribers--
}

const updatesStale = () => {
  const { updatesAt } = useRealtime.getState()
  return updateSubscribers > 0 && (!updatesAt || Date.now() - updatesAt > UPDATES_EVERY_MS)
}

/**
 * WebSocket → a ogni tick "vehicle_positions" si scarica il feed. WebSocket giù → polling ogni 10 s.
 * Pagina in background → tutto fermo (niente socket, niente timer); al ritorno si riparte con un fetch immediato.
 */
export function startRealtime() {
  const bench = new URLSearchParams(location.search).get('bench')
  if (bench) return startBench(Number(bench) || 100)

  let ws: WebSocket | null = null
  let retry = 1000
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let paused = true

  const startPolling = () => {
    poll ??= setInterval(() => {
      void fetchVehicles()
      if (updatesStale()) void fetchUpdates()
    }, 10_000)
  }
  const stopPolling = () => {
    clearInterval(poll)
    poll = undefined
  }
  const connect = () => {
    if (paused) return
    ws = new WebSocket(`${WORKER.replace(/^http/, 'ws')}/busone/ws`)
    ws.onopen = () => {
      retry = 1000
      stopPolling()
    }
    ws.onmessage = (ev) => {
      const { type } = JSON.parse(String(ev.data)) as { type: string }
      if (type === 'vehicle_positions') void fetchVehicles()
      if (type === 'trip_updates' && updatesStale()) void fetchUpdates()
    }
    ws.onclose = () => {
      ws = null
      if (paused) return
      startPolling()
      retryTimer = setTimeout(connect, retry)
      retry = Math.min(retry * 2, 60_000)
    }
  }
  const pause = () => {
    paused = true
    clearTimeout(retryTimer)
    stopPolling()
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }
  }
  const resume = () => {
    if (!paused) return
    paused = false
    retry = 1000
    void fetchVehicles(true)
    if (updatesStale()) void fetchUpdates(true)
    startPolling() // finché il WebSocket non è aperto
    connect()
  }
  const onVisibility = () => (document.hidden ? pause() : resume())
  const setOnline = () => {
    useRealtime.setState({ online: navigator.onLine })
    if (navigator.onLine && !paused) void fetchVehicles(true)
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
  if (!document.hidden) resume()
  return () => {
    pause()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', setOnline)
    window.removeEventListener('offline', setOnline)
  }
}

if (import.meta.env.DEV) Object.assign(window, { __rt: useRealtime }) // per gli script di prova
