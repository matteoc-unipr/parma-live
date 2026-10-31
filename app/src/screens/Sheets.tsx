// Sheet sulla mappa, in pila sopra la tab corrente: tabellone fermata, dettaglio bus, risultati A→B.
import { useEffect, useState } from 'react'
import { subscribeUpdates, useRealtime } from '../data/realtime'
import { lineColor, useStatic, useStopTimes } from '../data/static'
import { buildBoard } from '../lib/board'
import { useNow } from '../lib/hooks'
import { useUi } from '../store'
import { BottomSheet } from '../ui/BottomSheet'
import { BackButton, CloseButton, ErrorState, fmtTime, LineBadge, Skeleton, StarButton } from '../ui/bits'
import { DepartureRow } from '../ui/DepartureRow'
import { ClockIcon, MoonIcon, PinIcon } from '../ui/icons'
import { PlanSheet } from './Search'

export function MapSheet() {
  const sheet = useUi((s) => s.sheet)
  const depth = useUi((s) => s.stack.length)
  useEffect(() => (sheet ? subscribeUpdates() : undefined), [sheet])
  if (!sheet) return null
  // key: ogni sheet della pila è un componente nuovo, con la sua animazione d'ingresso.
  if (sheet.kind === 'plan') return <PlanSheet key={`plan-${depth}`} />
  return sheet.kind === 'bus' ? <BusSheet key={`${depth}-${sheet.id}`} id={sheet.id} /> : <StopSheet key={`${depth}-${sheet.id}`} id={sheet.id} />
}

/** ← se sotto c'è un altro sheet; ✕ chiude tutta la pila (UX-AUDIT.md §4). */
export function SheetNav({ extra }: { extra?: React.ReactNode }) {
  const deep = useUi((s) => s.stack.length > 1)
  return (
    <div className="sheet-nav">
      {extra}
      {deep && <BackButton onClick={() => useUi.getState().back()} />}
      <CloseButton onClick={() => useUi.getState().openSheet(null)} label={deep ? 'Chiudi tutto' : 'Chiudi'} />
    </div>
  )
}

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
        <p className="subtle">La corsa è terminata o il bus non trasmette più la posizione.</p>
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
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--pl-text-2)' }}>Linea {route?.short ?? '?'} · direzione</div>
          <div className="sheet-title">{pattern?.headsign ?? '—'}</div>
        </div>
        <SheetNav />
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
      {!stops.length && <p className="subtle">Il percorso di questa corsa non è negli orari scaricati.</p>}
      {stops.map((s, i) => {
        const last = i === stops.length - 1
        const terminus = last && s.id === pattern?.stops.at(-1)
        const name = data?.stops.get(s.id)?.name ?? s.id
        return (
          <button
            key={`${s.id}-${i}`}
            data-component="NextStopRow"
            className="next-stop"
            aria-label={`${name}${s.eta ? `, alle ${fmtTime(s.eta)}` : ''}. Apri il tabellone`}
            onClick={() => useUi.getState().pushSheet({ kind: 'stop', id: s.id })}
          >
            <div className="rail">
              <i style={{ background: color, bottom: last ? 25 : 0 }} />
              <b style={{ borderColor: color, background: terminus ? color : 'var(--pl-surface)' }} />
            </div>
            <div className="name" style={{ fontWeight: terminus ? 700 : 400 }}>{name}</div>
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
    <SheetNav />
  </div>
)

const RT_WAIT_MS = 10_000 // senza stime dopo 10 s: tabellone con i soli orari programmati

/* ---------- Tabellone fermata ---------- */
function StopSheet({ id }: { id: string }) {
  const now = useNow(15_000) // countdown a passi di 15 s
  const data = useStatic((s) => s.data)
  const updates = useRealtime((s) => s.updates)
  const updatesAt = useRealtime((s) => s.updatesAt)
  const buses = useRealtime((s) => s.buses)
  const offline = useRealtime((s) => !s.online || s.failed)
  const fav = useUi((s) => s.favorites.stops.includes(id))
  const { times, retry } = useStopTimes(id)
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), RT_WAIT_MS)
    return () => clearTimeout(t)
  }, [])

  const stop = data?.stops.get(id)
  const ready = times && times !== 'error'
  // Offline o stime in ritardo: solo orari programmati (countdown "stimato" con orologio).
  const scheduledOnly = offline || (!updatesAt && waited)
  const board = ready && (updatesAt || scheduledOnly) ? buildBoard(id, times, scheduledOnly ? new Map() : updates, now) : null
  const lines = [...new Set(Object.values(ready ? times : {}).flat().map(([, , p]) => data?.patterns.get(p)?.route ?? ''))]
    .filter(Boolean)
    .sort((a, b) => (parseInt(data?.routes.get(a)?.short ?? '') || 999) - (parseInt(data?.routes.get(b)?.short ?? '') || 999))
  const takeMeThere = () => stop && useUi.getState().startPlan(null, { kind: 'stop', name: stop.name, lat: stop.lat, lon: stop.lon }, true)

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
        <SheetNav extra={<StarButton active={fav} onToggle={() => useUi.getState().toggleFavStop(id)} />} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingBottom: 4 }}>
        <span className="section-header" style={{ padding: 0 }}>PROSSIMI PASSAGGI</span>
        {stop && (
          <button className="text-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 0 }} onClick={takeMeThere}>
            <PinIcon />
            Portami qui
          </button>
        )}
      </div>
      {ready && scheduledOnly && !offline && (
        <div className="subtle" style={{ fontSize: 13, paddingBottom: 6 }}>Stime in tempo reale non ancora arrivate: orari programmati.</div>
      )}
    </>
  )

  return (
    <BottomSheet header={header}>
      {times === 'error' && (
        <ErrorState title="Orari della fermata non scaricati" body="Sei offline e questa fermata non è ancora stata aperta su questo telefono." onRetry={retry} />
      )}
      {times !== 'error' && !board && <Skeleton rows={6} label="Carico i passaggi della fermata" slow="Gli orari della fermata non arrivano: la connessione è lenta o assente." />}
      {board?.night && (
        <div data-component="EmptyState" className="empty-state">
          <div className="empty-icon"><MoonIcon /></div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Nessun bus in servizio</div>
            <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Primi passaggi del mattino, orario programmato</div>
          </div>
        </div>
      )}
      {board && !board.rows.length && (
        <div data-component="EmptyState" className="empty-state">
          <div className="empty-icon"><ClockIcon size={18} /></div>
          <div style={{ fontSize: 15, color: 'var(--pl-text-2)' }}>Nessun passaggio da questa fermata nelle prossime ore.</div>
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
            // Tocco su un arrivo live: dettaglio di quel bus, sopra il tabellone (← ci torna).
            onClick={bus ? () => useUi.getState().pushSheet({ kind: 'bus', id: bus.id }) : undefined}
          />
        )
      })}
    </BottomSheet>
  )
}
