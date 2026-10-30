import type { Feature, FeatureCollection } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef } from 'react'
import { feedStatus, useRealtime, type Bus } from '../data/realtime'
import { lineColor, lineLabel, useStatic } from '../data/static'
import { nearestIndex } from '../lib/geo'
import { useDarkMode, useNow } from '../lib/hooks'
import { useUi } from '../store'
import { fmtTime, LineBadge } from '../ui/bits'
import { InfoIcon, LocateIcon, MoonIcon } from '../ui/icons'

// MapLibre 6 calcola il nome del worker a runtime: Vite non lo vedrebbe e non lo emetterebbe nel build.
maplibregl.setWorkerUrl(workerUrl)

const DEFAULT_CAMERA = { center: [10.324, 44.7975] as [number, number], zoom: 14 }
const STYLE = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export function MapScreen() {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const dark = useDarkMode()
  const data = useStatic((s) => s.data)

  // Mappa creata una volta sola: resta montata sotto le altre schermate.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: STYLE(dark),
      ...DEFAULT_CAMERA,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })
    m.touchZoomRotate.disableRotation()
    m.on('style.load', () => addLayers(m))
    map.current = m
    return () => m.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- il tema si cambia con setStyle sotto
  }, [])

  useEffect(() => {
    map.current?.setStyle(STYLE(dark))
  }, [dark])

  useStopsLayer(map, data)
  useBusMarkers(map)
  useSelectedRoute(map)
  useUserLocation(map)
  useCameraRules(map)

  const tab = useUi((s) => s.tab)
  return (
    <>
      <div ref={container} className="map" data-component="LiveMap" />
      {tab === 'map' && <MapOverlays />}
    </>
  )
}

/* ---------- Fermate e percorso (layer GL) ---------- */
// Ultimi dati dei layer: riapplicati quando setStyle (cambio tema) azzera sorgenti e layer.
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }
const layerData = { stops: EMPTY, route: EMPTY }

function addLayers(m: maplibregl.Map) {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  m.addSource('stops', { type: 'geojson', data: layerData.stops })
  m.addSource('route', { type: 'geojson', data: layerData.route })
  // Percorso del bus selezionato: passato tratteggiato, restante col bordo.
  m.addLayer({ id: 'route-past', type: 'line', source: 'route', filter: ['==', ['get', 'part'], 'past'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': css('--pl-route-past'), 'line-width': 5, 'line-dasharray': [0.2, 1.8] } })
  m.addLayer({ id: 'route-casing', type: 'line', source: 'route', filter: ['==', ['get', 'part'], 'next'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': dark ? '#000' : '#fff', 'line-width': 10, 'line-opacity': dark ? 0.55 : 1 } })
  m.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['==', ['get', 'part'], 'next'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 6 } })
  // Fermate visibili da zoom 13.6: cerchio bianco 12, bordo 3 grigio; selezionata 24, bordo 5 accento.
  m.addLayer({ id: 'stops', type: 'circle', source: 'stops', minzoom: 13.6,
    paint: { 'circle-radius': 3, 'circle-color': '#fff', 'circle-stroke-width': 3, 'circle-stroke-color': '#8E8E96' } })
  m.addLayer({ id: 'stop-selected', type: 'circle', source: 'stops', filter: ['==', ['get', 'id'], selectedStopId()],
    paint: { 'circle-radius': 7, 'circle-color': '#fff', 'circle-stroke-width': 5, 'circle-stroke-color': css('--pl-accent') } })
}

const selectedStopId = () => {
  const { sheet } = useUi.getState()
  return sheet?.kind === 'stop' ? sheet.id : ''
}

function setLayerData(m: maplibregl.Map, source: 'stops' | 'route', data: FeatureCollection) {
  layerData[source] = data
  ;(m.getSource(source) as GeoJSONSource | undefined)?.setData(data)
}

function useStopsLayer(map: React.RefObject<maplibregl.Map | null>, data: ReturnType<typeof useStatic.getState>['data']) {
  const sheet = useUi((s) => s.sheet)
  const selectedStop = sheet?.kind === 'stop' ? sheet.id : ''
  useEffect(() => {
    const m = map.current
    if (!m || !data) return
    setLayerData(m, 'stops', {
      type: 'FeatureCollection',
      features: [...data.stops.values()].map((s) => ({
        type: 'Feature',
        properties: { id: s.id, name: s.name },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      })),
    })
  }, [map, data])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const onStop = (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined
      if (id) useUi.getState().openSheet({ kind: 'stop', id })
    }
    const pointer = () => (m.getCanvas().style.cursor = 'pointer')
    const unpointer = () => (m.getCanvas().style.cursor = '')
    m.on('click', 'stops', onStop)
    m.on('mouseenter', 'stops', pointer)
    m.on('mouseleave', 'stops', unpointer)
    return () => {
      m.off('click', 'stops', onStop)
      m.off('mouseenter', 'stops', pointer)
      m.off('mouseleave', 'stops', unpointer)
    }
  }, [map])

  useEffect(() => {
    const m = map.current
    if (m?.getLayer('stop-selected')) m.setFilter('stop-selected', ['==', ['get', 'id'], selectedStop])
  }, [map, selectedStop])
}

/* ---------- Bus (marker DOM: cono ruotato verso la direzione di marcia) ---------- */
type MarkerEntry = { marker: maplibregl.Marker; el: HTMLDivElement; lngLat: [number, number]; anim?: number }

function busElement(bus: Bus, onTap: () => void) {
  const el = document.createElement('div')
  el.className = 'bus-marker'
  el.dataset.component = 'BusMarker'
  el.innerHTML = '<div class="hit"></div><svg width="80" height="80" viewBox="-40 -40 80 80"><path stroke-width="1.5" stroke-linejoin="round"></path></svg><div class="badge"></div>'
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    onTap()
  })
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', `Bus ${bus.label}`)
  return el
}

function paintBus(el: HTMLDivElement, color: string, label: string, size: number, bearing: number | null, opacity: number, z: number) {
  const h = size / 2
  const tip = h + 10
  const path = el.querySelector('path')!
  path.setAttribute('d', `M${-h * 0.62},${-h * 0.62} L0,${-tip} L${h * 0.62},${-h * 0.62} Z`)
  path.setAttribute('fill', color)
  path.style.stroke = 'var(--pl-marker-ring)' // le var CSS non valgono negli attributi SVG
  const svg = el.querySelector('svg')!
  svg.style.transform = `rotate(${bearing ?? 0}deg)`
  svg.style.visibility = bearing === null ? 'hidden' : 'visible'
  const badge = el.querySelector<HTMLDivElement>('.badge')!
  Object.assign(badge.style, {
    width: `${size}px`, height: `${size}px`, left: `${-h}px`, top: `${-h}px`, background: color,
    fontSize: `${size > 34 ? 17 : label.length > 1 ? 11 : 13}px`,
  })
  badge.textContent = label
  el.style.zIndex = String(z)
  return opacity
}

function useBusMarkers(map: React.RefObject<maplibregl.Map | null>) {
  const buses = useRealtime((s) => s.buses)
  const status = useRealtime((s) => feedStatus(s, Date.now()))
  const data = useStatic((s) => s.data)
  const filter = useUi((s) => s.filter)
  const sheet = useUi((s) => s.sheet)
  const markers = useRef(new Map<string, MarkerEntry>())

  useEffect(() => {
    const m = map.current
    if (!m) return
    const selected = sheet?.kind === 'bus' ? sheet.id : null
    const visible = buses.filter((b) => !filter.length || filter.includes(b.routeId) || b.id === selected)
    const seen = new Set<string>()
    const baseOpacity = status === 'offline' ? 0.5 : status === 'stale' ? 0.75 : 1
    for (const bus of visible) {
      seen.add(bus.id)
      const route = data?.routes.get(bus.routeId)
      let entry = markers.current.get(bus.id)
      const to: [number, number] = [bus.lon, bus.lat]
      if (!entry) {
        const el = busElement(bus, () => useUi.getState().openSheet({ kind: 'bus', id: bus.id }))
        entry = { el, lngLat: to, marker: new maplibregl.Marker({ element: el }).setLngLat(to).addTo(m) }
        markers.current.set(bus.id, entry)
      } else if (status !== 'offline') {
        animateTo(entry, to)
      }
      const isSel = bus.id === selected
      // MapLibre gestisce da sé style.opacity del marker: va passata da setOpacity.
      const opacity = paintBus(entry.el, lineColor(route), lineLabel(route), isSel ? 40 : 28, bus.bearing, selected && !isSel ? 0.22 : baseOpacity, isSel ? 2 : 1)
      entry.marker.setOpacity(String(opacity))
    }
    for (const [id, entry] of markers.current) {
      if (seen.has(id)) continue
      entry.marker.remove()
      markers.current.delete(id)
    }
  }, [map, buses, data, filter, sheet, status])
}

// Spostamento lineare in 1000 ms (= --pl-dur-bus-step) tra due fix.
function animateTo(entry: MarkerEntry, to: [number, number]) {
  if (entry.anim) cancelAnimationFrame(entry.anim)
  const from = entry.lngLat
  if (from[0] === to[0] && from[1] === to[1]) return
  const t0 = performance.now()
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / 1000)
    entry.lngLat = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]
    entry.marker.setLngLat(entry.lngLat)
    if (k < 1) entry.anim = requestAnimationFrame(step)
  }
  entry.anim = requestAnimationFrame(step)
}

/* ---------- Percorso del bus selezionato ---------- */
function useSelectedRoute(map: React.RefObject<maplibregl.Map | null>) {
  const sheet = useUi((s) => s.sheet)
  const busId = sheet?.kind === 'bus' ? sheet.id : null
  const bus = useRealtime((s) => s.buses.find((b) => b.id === busId))
  const data = useStatic((s) => s.data)
  useEffect(() => {
    const m = map.current
    if (!m) return
    const features: Feature[] = []
    const pattern = bus && data?.patterns.get(data.tripPattern.get(bus.tripId) ?? '')
    const line = pattern && data?.shapes[pattern.shape]
    if (bus && pattern && line) {
      const i = nearestIndex(line, bus.lon, bus.lat)
      const color = lineColor(data.routes.get(pattern.route))
      features.push(
        { type: 'Feature', properties: { part: 'past' }, geometry: { type: 'LineString', coordinates: line.slice(0, i + 1) } },
        { type: 'Feature', properties: { part: 'next', color }, geometry: { type: 'LineString', coordinates: [[bus.lon, bus.lat], ...line.slice(i + 1)] } },
      )
    }
    setLayerData(m, 'route', { type: 'FeatureCollection', features })
  }, [map, bus, data])
}

/* ---------- Posizione utente ---------- */
function useUserLocation(map: React.RefObject<maplibregl.Map | null>) {
  const geo = useUi((s) => s.geo)
  const locateTick = useUi((s) => s.locateTick)
  const dot = useRef<maplibregl.Marker | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) return useUi.setState({ geo: { status: 'denied' } })
    const id = navigator.geolocation.watchPosition(
      (p) => useUi.setState({ geo: { status: 'ok', lat: p.coords.latitude, lon: p.coords.longitude } }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) useUi.setState({ geo: { status: 'denied' } })
      },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || geo.status !== 'ok') {
      dot.current?.remove()
      dot.current = null
      return
    }
    if (!dot.current) {
      const el = document.createElement('div')
      el.className = 'user-dot'
      el.dataset.component = 'UserLocationDot'
      dot.current = new maplibregl.Marker({ element: el }).setLngLat([geo.lon!, geo.lat!]).addTo(m)
    } else dot.current.setLngLat([geo.lon!, geo.lat!])
  }, [map, geo])

  useEffect(() => {
    const { geo } = useUi.getState()
    if (locateTick && geo.status === 'ok') map.current?.easeTo({ center: [geo.lon!, geo.lat!], zoom: 15.5 })
  }, [map, locateTick])
}

/* ---------- Camera: bus/fermata selezionati a y=220, tocco sulla mappa → peek ---------- */
function useCameraRules(map: React.RefObject<maplibregl.Map | null>) {
  const sheet = useUi((s) => s.sheet)
  const tab = useUi((s) => s.tab)
  const data = useStatic((s) => s.data)

  useEffect(() => {
    const m = map.current
    if (!m || !sheet) return
    const { buses } = useRealtime.getState()
    const point =
      sheet.kind === 'bus'
        ? buses.find((b) => b.id === sheet.id)
        : data?.stops.get(sheet.id)
    if (!point) return
    m.easeTo({ center: [point.lon, point.lat], zoom: Math.max(m.getZoom(), 15), offset: [0, 220 - m.getContainer().clientHeight / 2], duration: 600 })
  }, [map, sheet, data])

  useEffect(() => {
    if (tab === 'map' && !useUi.getState().sheet) map.current?.easeTo({ ...DEFAULT_CAMERA, duration: 0 })
  }, [map, tab])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (m.queryRenderedFeatures(e.point, { layers: m.getLayer('stops') ? ['stops'] : [] }).length) return
      const { sheet, detent } = useUi.getState()
      if (sheet && detent !== 'peek') useUi.setState({ detent: 'peek' })
    }
    m.on('click', onClick)
    return () => void m.off('click', onClick)
  }, [map])
}

/* ---------- Overlay ---------- */
function MapOverlays() {
  const now = useNow(1000)
  const rt = useRealtime()
  const status = feedStatus(rt, now)
  const data = useStatic((s) => s.data)
  const { filter, toggleLine, clearFilter, geo, sheet } = useUi()

  const lines = useMemo(() => {
    const ids = [...new Set(rt.buses.map((b) => b.routeId))]
    const short = (id: string) => data?.routes.get(id)?.short ?? id
    return ids.sort((a, b) => (parseInt(short(a)) || 999) - (parseInt(short(b)) || 999) || short(a).localeCompare(short(b)))
  }, [rt.buses, data])

  const age = rt.feedAt ? Math.max(0, Math.round((now - rt.feedAt) / 1000)) : 0
  const indicator = {
    loading: { tag: 'CARICAMENTO', color: 'var(--pl-text-2)', dot: 'var(--pl-text-3)', label: '· posizioni dei bus…' },
    night: { tag: 'NOTTE', color: 'var(--pl-text-2)', dot: 'var(--pl-text-3)', label: '· nessun bus in servizio' },
    offline: { tag: 'OFFLINE', color: 'var(--pl-text-2)', dot: 'var(--pl-text-3)', label: `· ultimo dato alle ${rt.syncAt ? fmtTime(rt.syncAt) : '–'}` },
    stale: { tag: 'DATO VECCHIO', color: 'var(--pl-late)', dot: 'var(--pl-late)', label: `· aggiornato ${age} s fa` },
    live: { tag: 'LIVE', color: 'var(--pl-ok)', dot: 'var(--pl-ok)', label: `· aggiornato ${age} s fa · ${rt.buses.length} bus` },
  }[status]

  const denied = geo.status === 'denied'
  return (
    <>
      <div className="map-top">
        {status === 'loading' ? (
          <div data-component="Skeleton" className="chips" style={{ animation: 'plSkel 1.3s ease-in-out infinite' }}>
            {[80, 44, 44, 44, 44, 44, 44].map((w, i) => (
              <div key={i} className="chip glass" style={{ width: w }} />
            ))}
          </div>
        ) : (
          <div className="chips" role="toolbar" aria-label="Filtra linee">
            <button data-component="LineFilterChip" className={`chip all glass ${filter.length ? '' : 'on'}`} onClick={clearFilter}>
              Tutte
            </button>
            {lines.map((id) => {
              const route = data?.routes.get(id)
              const on = filter.includes(id)
              return (
                <button key={id} data-component="LineFilterChip" className="chip line glass" aria-pressed={on} aria-label={`Linea ${route?.short ?? id}`} onClick={() => toggleLine(id)}>
                  <LineBadge route={route} size={32} style={{ opacity: filter.length && !on ? 0.45 : 1 }} />
                </button>
              )
            })}
          </div>
        )}
        <div data-component="LiveIndicator" className="live-indicator glass" role="status">
          <span className={`dot ${status === 'live' ? 'pulse' : ''}`} style={{ background: indicator.dot }} />
          <span className="tag" style={{ color: indicator.color }}>{indicator.tag}</span>
          <span className="label">{indicator.label}</span>
        </div>
      </div>
      <button data-component="IconButton" className="icon-btn glass map-info" aria-label="Info" onClick={() => useUi.setState({ info: true })}>
        <InfoIcon />
      </button>
      {!sheet && (
        <>
          <button data-component="MapAttribution" className="map-attribution" onClick={() => useUi.setState({ info: true })}>
            © OpenFreeMap © OpenStreetMap contributors
          </button>
          <button
            data-component="LocateButton"
            className={`locate-btn glass ${denied ? 'denied' : ''}`}
            aria-label="Centra su di me"
            onClick={() =>
              denied
                ? useUi.getState().showToast('Posizione non disponibile', 'Attiva la posizione in Impostazioni › Privacy › Localizzazione per vedere dove sei.')
                : useUi.setState((s) => ({ locateTick: s.locateTick + 1 }))
            }
          >
            <LocateIcon denied={denied} cutColor="var(--pl-glass-strong)" />
          </button>
        </>
      )}
      {status === 'night' && !sheet && (
        <div data-component="EmptyState" className="night-card glass">
          <div className="empty-icon" style={{ width: 48, height: 48 }}><MoonIcon size={22} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Nessun bus in servizio</div>
            <div style={{ fontSize: 14, lineHeight: '19px', color: 'var(--pl-text-2)', marginTop: 2 }}>
              Il servizio urbano riprende al mattino. Tocca una fermata per le prime corse.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
