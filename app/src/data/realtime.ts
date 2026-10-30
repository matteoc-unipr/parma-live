// Realtime BusOne via Worker: il WebSocket segnala una nuova emissione, poi si scarica il feed JSON.
import { create } from 'zustand'
import type { TripUpdate } from '../lib/board'

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
  syncAt: null,
  failed: false,
  online: navigator.onLine,
  updates: new Map(),
  updatesAt: null,
}))

export type FeedStatus = 'loading' | 'live' | 'stale' | 'offline' | 'night'
export function feedStatus(s: Realtime, now: number): FeedStatus {
  if (!s.online || (s.failed && s.syncAt)) return 'offline'
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
            stops: (tu.stop_time_update ?? [])
              .filter((s: any) => s.schedule_relationship !== 'NO_DATA')
              .map((s: any) => {
                const ev = s.arrival ?? s.departure
                return { stopId: s.stop_id, seq: s.stop_sequence, time: ev?.time ?? null, delay: ev?.delay ?? null }
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
  useRealtime.setState({
    buses: parseBuses(json),
    feedAt: header?.timestamp ? header.timestamp * 1000 : Date.now(),
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

export function startRealtime() {
  void fetchVehicles(true)
  let ws: WebSocket | null = null
  let retry = 1000
  let stopped = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const connect = () => {
    if (stopped) return
    ws = new WebSocket(`${WORKER.replace(/^http/, 'ws')}/busone/ws`)
    ws.onopen = () => (retry = 1000)
    ws.onmessage = (ev) => {
      const { type } = JSON.parse(String(ev.data)) as { type: string }
      if (type === 'vehicle_positions') void fetchVehicles()
      const { updatesAt } = useRealtime.getState()
      if (type === 'trip_updates' && updateSubscribers > 0 && (!updatesAt || Date.now() - updatesAt > UPDATES_EVERY_MS))
        void fetchUpdates()
    }
    ws.onclose = () => {
      retryTimer = setTimeout(connect, retry)
      retry = Math.min(retry * 2, 60_000)
    }
  }
  connect()
  // Rete di sicurezza se il WebSocket tace: le posizioni escono ogni 30 s.
  const poll = setInterval(() => {
    if (Date.now() - (useRealtime.getState().syncAt ?? 0) > 35_000) void fetchVehicles()
  }, 10_000)
  const setOnline = () => {
    useRealtime.setState({ online: navigator.onLine })
    if (navigator.onLine) void fetchVehicles(true)
  }
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
  return () => {
    stopped = true
    clearTimeout(retryTimer)
    clearInterval(poll)
    window.removeEventListener('online', setOnline)
    window.removeEventListener('offline', setOnline)
    if (ws) {
      ws.onclose = null
      ws.close()
    }
  }
}
