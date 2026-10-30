// Contenuto degli sheet sulla mappa: dettaglio bus e tabellone fermata.
import { useEffect, useState } from 'react'
import { subscribeUpdates, useRealtime } from '../data/realtime'
import { lineColor, loadStopTimes, useStatic } from '../data/static'
import { buildBoard, type StopTimes } from '../lib/board'
import { useNow } from '../lib/hooks'
import { useUi } from '../store'
import { BottomSheet } from '../ui/BottomSheet'
import { CloseButton, fmtTime, LineBadge, Skeleton, StarButton } from '../ui/bits'
import { DepartureRow } from '../ui/DepartureRow'
import { ClockIcon, LiveIcon, MoonIcon } from '../ui/icons'

export function MapSheet() {
  const sheet = useUi((s) => s.sheet)
  useEffect(() => (sheet ? subscribeUpdates() : undefined), [sheet])
  if (!sheet) return null
  // key: cambiando bus o fermata lo sheet riparte da fuori schermo.
  return sheet.kind === 'bus' ? <BusSheet key={sheet.id} id={sheet.id} /> : <StopSheet key={sheet.id} id={sheet.id} />
}

const close = () => useUi.getState().openSheet(null)

/* ---------- Dettaglio bus ---------- */
function BusSheet({ id }: { id: string }) {
  const now = useNow(1000)
  const bus = useRealtime((s) => s.buses.find((b) => b.id === id))
  const update = useRealtime((s) => (bus ? s.updates.get(bus.tripId) : undefined))
  const data = useStatic((s) => s.data)
  const pattern = bus && data?.patterns.get(data.tripPattern.get(bus.tripId) ?? '')
  const route = data?.routes.get(pattern?.route ?? bus?.routeId ?? '')
  const color = lineColor(route)

  if (!bus) {
    return (
      <BottomSheet header={<SheetTitleRow title="Bus non più nel feed" />}>
        <p className="subtle">La corsa è terminata o il segnale si è perso.</p>
      </BottomSheet>
    )
  }

  // Ritardo: il primo passaggio stimato davanti al bus.
  const upcoming = (update?.stops ?? []).filter((s) => s.time && s.time * 1000 >= now - 30_000)
  const delay = upcoming[0]?.delay ?? null
  const late = delay !== null && delay >= 60
  const first = pattern && data?.stops.get(pattern.stops[0]!)
  const stops = upcoming.length
    ? upcoming.map((s) => ({ id: s.stopId, eta: s.time! * 1000, plan: s.time! * 1000 - (s.delay ?? 0) * 1000 }))
    : (pattern?.stops.slice(Math.max(0, pattern.stops.indexOf(bus.stopId ?? ''))) ?? []).map((sid) => ({ id: sid, eta: null, plan: null }))

  const header = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <LineBadge route={route} size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--pl-text-2)' }}>Direzione</div>
          <div className="sheet-title">{pattern?.headsign ?? '—'}</div>
        </div>
        <CloseButton onClick={close} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {delay !== null && (
          <div className="pill-chip" style={{ fontWeight: 700, background: late ? 'var(--pl-late-soft)' : 'var(--pl-ok-soft)', color: late ? 'var(--pl-late)' : 'var(--pl-ok)' }}>
            <ClockIcon size={14} />
            {late ? `+${Math.round(delay / 60)} min` : 'In orario'}
          </div>
        )}
        <div className="pill-chip">Vettura {bus.label}</div>
        {first && <div className="pill-chip">da {first.name}</div>}
      </div>
      <div className="section-header" style={{ padding: '20px 0 4px' }}>PROSSIME FERMATE</div>
    </>
  )

  return (
    <BottomSheet header={header}>
      {stops.map((s, i) => {
        const last = i === stops.length - 1
        const terminus = last && s.id === pattern?.stops.at(-1)
        return (
          <button key={`${s.id}-${i}`} data-component="NextStopRow" className="next-stop" onClick={() => useUi.getState().openSheet({ kind: 'stop', id: s.id })}>
            <div className="rail">
              <i style={{ background: color, bottom: last ? 25 : 0 }} />
              <b style={{ borderColor: color, background: terminus ? color : 'var(--pl-surface)' }} />
            </div>
            <div className="name" style={{ fontWeight: terminus ? 700 : 400 }}>{data?.stops.get(s.id)?.name ?? s.id}</div>
            <div className="times">
              {late && s.plan && <span className="strike" style={{ fontSize: 13, color: 'var(--pl-text-3)' }}>{fmtTime(s.plan)}</span>}
              <span className={`eta ${late ? 'late' : ''}`}>{s.eta ? fmtTime(s.eta) : ''}</span>
            </div>
          </button>
        )
      })}
    </BottomSheet>
  )
}

const SheetTitleRow = ({ title }: { title: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <div className="sheet-title" style={{ flex: 1 }}>{title}</div>
    <CloseButton onClick={close} />
  </div>
)

/* ---------- Tabellone fermata ---------- */
function StopSheet({ id }: { id: string }) {
  const now = useNow(15_000) // countdown a passi di 15 s
  const data = useStatic((s) => s.data)
  const updates = useRealtime((s) => s.updates)
  const updatesAt = useRealtime((s) => s.updatesAt)
  const buses = useRealtime((s) => s.buses)
  const offline = useRealtime((s) => !s.online || s.failed)
  const fav = useUi((s) => s.favorites.stops.includes(id))
  const [times, setTimes] = useState<StopTimes | null>(null)
  useEffect(() => void loadStopTimes(id).then(setTimes), [id])

  const stop = data?.stops.get(id)
  // Offline: niente stime, solo orari programmati (design: countdown "stimato" con orologio).
  const board = times && (updatesAt || offline) ? buildBoard(id, times, offline ? new Map() : updates, now) : null
  const lines = [...new Set(Object.values(times ?? {}).flat().map(([, , p]) => data?.patterns.get(p)?.route ?? ''))]
    .filter(Boolean)
    .sort((a, b) => (parseInt(data?.routes.get(a)?.short ?? '') || 999) - (parseInt(data?.routes.get(b)?.short ?? '') || 999))

  const header = (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sheet-title" style={{ whiteSpace: 'normal' }}>{stop?.name ?? 'Fermata'}</div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {lines.map((r) => <LineBadge key={r} route={data?.routes.get(r)} size={26} />)}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--pl-text-2)' }}>Fermata {id}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <StarButton active={fav} onToggle={() => useUi.getState().toggleFavStop(id)} />
          <CloseButton onClick={close} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingBottom: 8, fontSize: 13, color: 'var(--pl-text-2)' }}>
        <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>ARRIVI</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="ok" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><LiveIcon size={12} />tempo reale</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ClockIcon size={13} />programmato</span>
        </span>
      </div>
    </>
  )

  return (
    <BottomSheet header={header}>
      {!board && <Skeleton rows={6} />}
      {board?.night && (
        <div data-component="EmptyState" className="empty-state">
          <div className="empty-icon"><MoonIcon /></div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Nessun bus in servizio</div>
            <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Primi passaggi del mattino, orario programmato</div>
          </div>
        </div>
      )}
      {board?.rows.map((row) => {
        const pattern = data?.patterns.get(row.patternId)
        const next = pattern?.stops[pattern.stops.indexOf(id) + 1]
        const bus = row.source === 'live' ? buses.find((b) => b.tripId === row.tripId) : undefined
        return (
          <DepartureRow
            key={`${row.tripId}-${row.scheduled}`}
            row={row}
            route={data?.routes.get(pattern?.route ?? '')}
            destination={pattern?.headsign ?? '—'}
            via={next ? `via ${data?.stops.get(next)?.name ?? next}` : undefined}
            now={now}
            // Tocco su un arrivo live: dettaglio di quel bus.
            onClick={bus ? () => useUi.getState().openSheet({ kind: 'bus', id: bus.id }) : undefined}
          />
        )
      })}
    </BottomSheet>
  )
}
