// Bus come layer MapLibre: una sorgente GeoJSON aggiornata a ogni frame dal loop rAF,
// tre layer (cono di direzione, badge, numero di linea). Nessun nodo DOM per bus.
import type { Feature, FeatureCollection, Point } from 'geojson'
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, PointLike } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { feedStatus, useRealtime } from '../data/realtime'
import { lineColor, lineLabel, useStatic } from '../data/static'
import { useUi } from '../store'
import { BusMotion, makePath, type Path } from './motion'

const SOURCE = 'buses'
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function addBusLayers(m: MlMap) {
  const ring = css('--pl-marker-ring')
  m.addSource(SOURCE, { type: 'geojson', data: EMPTY })
  const sel: ExpressionSpecification = ['==', ['get', 'sel'], 1]
  // Cono: triangolo davanti al badge, ruotato verso la direzione di marcia (design: h=14, punta a h+10).
  m.addLayer({
    id: 'bus-cone', type: 'symbol', source: SOURCE, filter: ['has', 'bearing'],
    layout: {
      'icon-image': ['concat', 'cone-', ['get', 'color']],
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-size': ['case', sel, 40 / 28, 1],
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'z'],
    },
    paint: { 'icon-opacity': ['get', 'op'] },
  })
  // Badge: cerchio 28 (selezionato 40) col colore della linea e bordo 2 px.
  m.addLayer({
    id: 'bus-badge', type: 'circle', source: SOURCE,
    layout: { 'circle-sort-key': ['get', 'z'] },
    paint: {
      'circle-radius': ['case', sel, 18, 12],
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2, 'circle-stroke-color': ring,
      'circle-opacity': ['get', 'op'], 'circle-stroke-opacity': ['get', 'op'],
    },
  })
  m.addLayer({
    id: 'bus-label', type: 'symbol', source: SOURCE,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['case', sel, 17, ['>', ['length', ['get', 'label']], 2], 9, ['>', ['length', ['get', 'label']], 1], 11, 13],
      'text-allow-overlap': true, 'text-ignore-placement': true,
      'symbol-sort-key': ['get', 'z'],
    },
    paint: { 'text-color': ['get', 'text'], 'text-opacity': ['get', 'op'] },
  })
}

/** Immagini dei coni generate al volo, una per colore di linea (cone-#RRGGBB). */
export function onMissingImage(m: MlMap, id: string) {
  if (!id.startsWith('cone-')) return
  const ratio = 2
  const size = 80
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size * ratio
  const ctx = canvas.getContext('2d')!
  ctx.scale(ratio, ratio)
  ctx.translate(size / 2, size / 2)
  const h = 14
  ctx.beginPath()
  ctx.moveTo(-h * 0.62, -h * 0.62)
  ctx.lineTo(0, -(h + 10))
  ctx.lineTo(h * 0.62, -h * 0.62)
  ctx.closePath()
  ctx.fillStyle = id.slice(5)
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.strokeStyle = css('--pl-marker-ring')
  ctx.stroke()
  m.addImage(id, ctx.getImageData(0, 0, size * ratio, size * ratio), { pixelRatio: ratio })
}

/** Bus sotto il tocco, con area di 44×44 pt come da design. */
export function busAt(m: MlMap, x: number, y: number): string | undefined {
  if (!m.getLayer('bus-badge')) return
  const box: [PointLike, PointLike] = [[x - 22, y - 22], [x + 22, y + 22]]
  const hits = m.queryRenderedFeatures(box, { layers: ['bus-badge'] })
  // Più bus nell'area: il più vicino al dito.
  let best: { id: string; d: number } | undefined
  for (const f of hits) {
    const p = m.project((f.geometry as Point).coordinates as [number, number])
    const d = Math.hypot(p.x - x, p.y - y)
    if (!best || d < best.d) best = { id: String(f.properties.id), d }
  }
  return best?.id
}

export const busMotion = new BusMotion()

// `?fps`: tempo JS del frame dei bus (costruzione feature + setData), letto da FpsMeter.
const MEASURE = new URLSearchParams(location.search).has('fps')
export const busFrameMs: number[] = []
/** aggiornamenti della sorgente bus effettivamente caricati dal worker (non accorpati) */
export const busSourceUpdates = { n: 0 }

export function useBusLayer(map: React.RefObject<MlMap | null>) {
  const data = useStatic((s) => s.data)
  const paths = useRef(new Map<string, Path | null>())
  const raf = useRef(0)

  useEffect(() => {
    const m = map.current
    if (!m || !data) return
    const pathOf = (tripId: string) => {
      const pattern = data.patterns.get(data.tripPattern.get(tripId) ?? '')
      const shape = pattern && data.shapes[pattern.shape]
      if (!shape) return undefined
      // Le shape sono condivise tra molte corse: path calcolato una volta per shape.
      if (!paths.current.has(pattern.shape)) paths.current.set(pattern.shape, makePath(shape))
      return paths.current.get(pattern.shape) ?? undefined
    }

    // Ultime posizioni pubblicate: si ripubblica solo quando un bus si è mosso di almeno ½ pixel.
    // A zoom 14 un bus a 6 m/s fa ~1 px/s: 60 setData al secondo sarebbero lavoro invisibile per MapLibre.
    const published = new Map<string, [number, number]>()
    let force = true
    const frame = () => {
      raf.current = 0
      const now = performance.now()
      const rt = useRealtime.getState()
      const { filter, sheet } = useUi.getState()
      const selected = sheet?.kind === 'bus' ? sheet.id : null
      const status = feedStatus(rt, Date.now())
      const base = status === 'offline' ? 0.5 : status === 'stale' ? 0.75 : 1
      const features: Feature[] = []
      const center = m.getCenter()
      const kx = Math.cos((center.lat * Math.PI) / 180)
      const halfPxDeg = (0.5 * 360) / (512 * 2 ** m.getZoom()) // ½ px in gradi di longitudine (tile da 512)
      let moved = force
      for (const bus of rt.buses) {
        if (filter.length && !filter.includes(bus.routeId) && bus.id !== selected) continue
        const pose = busMotion.poseAt(bus.id, now)
        if (!pose) continue
        const last = published.get(bus.id)
        if (!moved && (!last || Math.hypot((pose.lon - last[0]) * kx, pose.lat - last[1]) >= halfPxDeg * kx)) moved = true
        const route = data.routes.get(bus.routeId)
        const isSel = bus.id === selected
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [pose.lon, pose.lat] },
          properties: {
            id: bus.id,
            color: lineColor(route),
            text: route?.text ?? '#FFFFFF',
            label: lineLabel(route),
            ...(pose.bearing === null ? {} : { bearing: pose.bearing }),
            sel: isSel ? 1 : 0,
            z: isSel ? 2 : 1,
            op: selected && !isSel ? 0.22 : base,
          },
        })
      }
      if (moved) {
        ;(m.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features })
        published.clear()
        for (const f of features) published.set(String(f.properties!.id), (f.geometry as Point).coordinates as [number, number])
        force = false
      }
      if (MEASURE) busFrameMs.push(performance.now() - now)
      // Loop attivo solo mentre qualcosa si muove (e mai in background: rAF lì è sospeso).
      if (busMotion.moving(now)) raf.current = requestAnimationFrame(frame)
    }
    const kick = () => {
      force = true // feed, filtro, selezione o stile cambiati: pubblica subito
      if (!raf.current) raf.current = requestAnimationFrame(frame)
    }

    const applyFeed = (s: ReturnType<typeof useRealtime.getState>) => {
      busMotion.update(
        s.buses.map((b) => ({ id: b.id, tripId: b.tripId, lon: b.lon, lat: b.lat, bearing: b.bearing })),
        performance.now(),
        feedStatus(s, Date.now()) === 'offline' ? 0 : s.feedInterval, // offline: marker fermi
        pathOf,
      )
      kick()
    }
    applyFeed(useRealtime.getState())
    const unsubRt = useRealtime.subscribe((s, prev) => {
      if (s.buses !== prev.buses) applyFeed(s)
      else if (s.online !== prev.online || s.failed !== prev.failed) kick()
    })
    const unsubUi = useUi.subscribe((s, prev) => {
      if (s.filter !== prev.filter || s.sheet !== prev.sheet) kick()
    })
    // Dopo un cambio di stile la sorgente è nuova e vuota: ridisegna.
    m.on('style.load', kick)
    const countUpdate = (e: { sourceId?: string; sourceDataType?: string }) => {
      if (e.sourceId === SOURCE && e.sourceDataType === 'content') busSourceUpdates.n++
    }
    if (MEASURE) m.on('sourcedata', countUpdate)
    return () => {
      unsubRt()
      unsubUi()
      m.off('style.load', kick)
      m.off('sourcedata', countUpdate)
      cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }, [map, data])
}
