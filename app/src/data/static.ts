// Dati statici generati da scripts/build-gtfs.ts in /data (formato in docs/data.md).
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import tokens from '../../../design/tokens.json'
import type { StopTimes } from '../lib/board'
import { decodePolyline } from '../lib/geo'

export type Route = { id: string; short: string; long: string; color: string | null; text: string | null }
export type Stop = { id: string; name: string; lat: number; lon: number }
export type Pattern = { id: string; route: string; dir: number; headsign: string; shape: string; stops: string[] }

type StaticData = {
  routes: Map<string, Route>
  stops: Map<string, Stop>
  patterns: Map<string, Pattern>
  /** polyline per shape_id; arrivano dopo il primo disegno (vedi loadShapes): usare shapeOf() */
  shapes: Record<string, string | [number, number][]>
  tripPattern: Map<string, string>
  /** Fermate con lo stesso nome (di solito una per direzione): la "località" scelta in Cerca e nei tragitti. */
  places: Map<string, string[]>
}

const get = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`/data/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

export const useStatic = create<{ data: StaticData | null; error: string | null }>(() => ({ data: null, error: null }))

export async function loadStatic() {
  try {
    const [routes, stops, patterns, trips] = await Promise.all([
      get<Route[]>('routes.json'),
      get<Stop[]>('stops.json'),
      get<Pattern[]>('patterns.json'),
      get<Record<string, [string, string, number][]>>('trips.json'),
    ])
    useStatic.setState({
      data: {
        routes: new Map(routes.map((r) => [r.id, r])),
        stops: new Map(stops.map((s) => [s.id, s])),
        patterns: new Map(patterns.map((p) => [p.id, p])),
        shapes: {},
        tripPattern: new Map(Object.values(trips).flatMap((day) => day.map(([trip, pattern]) => [trip, pattern] as const))),
        // shortcut: raggruppa per nome esatto; due fermate omonime lontane (altri comuni) finirebbero insieme. Se capita, aggiungere la distanza.
        places: stops.reduce((m, s) => m.set(s.name, [...(m.get(s.name) ?? []), s.id]), new Map<string, string[]>()),
      },
    })
    loadShapes()
  } catch (e) {
    useStatic.setState({ error: String(e) })
  }
}

// Le shape servono solo al percorso di un bus scelto e ad agganciare il movimento alla strada (senza: linea retta).
// Si scaricano dopo il primo disegno, per non contendere la banda ai dati che servono subito.
function loadShapes() {
  const run = () =>
    void get<StaticData['shapes']>('shapes.json')
      .then((shapes) => {
        const data = useStatic.getState().data
        if (data) useStatic.setState({ data: { ...data, shapes } })
      })
      .catch(() => {}) // senza shape l'app funziona: si riprova al prossimo avvio
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1500)
}

const decoded = new Map<string, [number, number][]>()
/** Punti [lon, lat] della shape, decodificati una volta sola; undefined finché le shape non sono arrivate. */
export function shapeOf(data: StaticData, shapeId: string): [number, number][] | undefined {
  const raw = data.shapes[shapeId]
  if (raw === undefined) return undefined
  if (Array.isArray(raw)) return raw // formato precedente, ancora in qualche cache del service worker
  if (!decoded.has(shapeId)) decoded.set(shapeId, decodePolyline(raw))
  return decoded.get(shapeId)
}

const stopTimesCache = new Map<string, Promise<StopTimes>>()
/** Orari di una fermata. Un errore (offline e mai aperta) non resta in cache: "Riprova" scarica di nuovo. */
export const loadStopTimes = (stopId: string) => {
  if (!stopTimesCache.has(stopId))
    stopTimesCache.set(stopId, get<StopTimes>(`stop-times/${stopId}.json`).catch((e: unknown) => {
      stopTimesCache.delete(stopId)
      throw e
    }))
  return stopTimesCache.get(stopId)!
}

/** Orari di una fermata per un componente: null finché arrivano, 'error' se non si possono scaricare. */
export function useStopTimes(stopId: string) {
  const [state, setState] = useState<{ id: string; times: StopTimes | null | 'error' }>({ id: stopId, times: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    loadStopTimes(stopId).then(
      (times) => alive && setState({ id: stopId, times }),
      () => alive && setState({ id: stopId, times: 'error' }),
    )
    return () => void (alive = false)
  }, [stopId, attempt])
  const retry = () => {
    setState({ id: stopId, times: null })
    setAttempt((n) => n + 1)
  }
  return { times: state.id === stopId ? state.times : null, retry }
}

// Colori: ufficiali dal GTFS; poi i segnaposto del design; poi uno "casuale" stabile per linea.
const designLines: Record<string, string> = tokens.color.line
export const lineColor = (route: Route | undefined) =>
  route?.color ?? designLines[route?.short ?? ''] ?? fallbackColor(route?.short ?? route?.id ?? '')

const hex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0')
const hsl = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0), f(8), f(4)] as const
}
const luminance = (rgb: readonly number[]) => {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
/** Contrasto WCAG del bianco su questo colore. */
export const contrastWithWhite = (rgb: readonly number[]) => 1.05 / (luminance(rgb) + 0.05)
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const ratio = (a: readonly number[], b: readonly number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}
const INK = '#0B0B0F' // --pl-text chiaro

/** Colore del numero sul badge: quello ufficiale se leggibile (≥ 4.5:1), altrimenti bianco o nero, il più leggibile. */
export function lineTextColor(route: Route | undefined) {
  const bg = rgbOf(lineColor(route))
  if (route?.text && /^#[0-9A-Fa-f]{6}$/.test(route.text) && ratio(rgbOf(route.text), bg) >= 4.5) return route.text
  return contrastWithWhite(bg) >= ratio(rgbOf(INK), bg) ? '#FFFFFF' : INK
}

/** Colore stabile ricavato dal nome della linea (stessa linea, stesso colore), scurito finché il numero bianco resta leggibile (≥ 3:1). */
export function fallbackColor(key: string) {
  let h = 0x811c9dc5
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193)
  let hue = ((h >>> 0) % 360 + 360) % 360
  if (hue >= 300 && hue <= 345) hue = (hue + 60) % 360 // il fucsia è il colore dell'app (DESIGN.md): una linea non deve sembrare un pulsante
  let l = 0.46
  let rgb = hsl(hue, 0.68, l)
  while (contrastWithWhite(rgb) < 3 && l > 0.2) rgb = hsl(hue, 0.68, (l -= 0.02))
  return `#${rgb.map(hex).join('').toUpperCase()}`
}
export const lineLabel = (route: Route | undefined) => (route?.short === 'Campus Express' ? 'CE' : (route?.short ?? '?'))
