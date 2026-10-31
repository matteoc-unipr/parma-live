// Preferiti e Info.
import { useEffect, useState } from 'react'
import { subscribeUpdates, useRealtime } from '../data/realtime'
import { loadStopTimes, useStatic } from '../data/static'
import { buildBoard, type StopTimes } from '../lib/board'
import { useNow } from '../lib/hooks'
import { planTrip } from '../planner/client'
import { runPlan } from '../planner/state'
import type { Journey } from '../planner/plan'
import { useUi, type FavPlace } from '../store'
import { Countdown, fmtTime, LineBadge, Skeleton, StarButton } from '../ui/bits'
import { DepartureRow } from '../ui/DepartureRow'
import { BackIcon, ClockIcon, InfoIcon, LiveIcon } from '../ui/icons'
import { resolvePlace, rides } from './Search'

const TICK = 15_000 // countdown a passi di 15 s

/* ---------- Preferiti ---------- */
export function FavoritesScreen() {
  const { stops, trips } = useUi((s) => s.favorites)
  const any = stops.length + trips.length > 0
  useEffect(() => (any ? subscribeUpdates() : undefined), [any])
  const now = useNow(TICK)
  return (
    <div className="screen" style={{ gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="large-title">Preferiti</div>
        <button data-component="IconButton" className="icon-btn card" aria-label="Info" onClick={() => useUi.setState({ info: true })}>
          <InfoIcon />
        </button>
      </div>
      {!any && (
        <div className="card" style={{ padding: '24px 20px', fontSize: 15, color: 'var(--pl-text-2)' }}>
          Nessun preferito. Tocca la stella su una fermata o su un tragitto per salvarlo qui.
        </div>
      )}
      {trips.length > 0 && <div className="section-header">TRAGITTI</div>}
      {trips.map((t) => (
        <FavoriteTripCard key={`${JSON.stringify(t.from)}→${JSON.stringify(t.to)}`} from={t.from} to={t.to} now={now} />
      ))}
      {stops.length > 0 && <div className="section-header" style={{ paddingTop: 10 }}>FERMATE</div>}
      {stops.map((id) => <FavoriteStopCard key={id} id={id} now={now} />)}
    </div>
  )
}

function FavoriteTripCard({ from, to, now }: { from: FavPlace; to: FavPlace; now: number }) {
  const data = useStatic((s) => s.data)
  const A = resolvePlace(data, from)
  const B = resolvePlace(data, to)
  const updatesAt = useRealtime((s) => s.updatesAt)
  const [journeys, setJourneys] = useState<Journey[] | null>(null)
  // Stesso planner della tab Cerca (Web Worker), ricalcolato a ogni passo del countdown e a ogni nuova stima.
  useEffect(() => {
    if (!A || !B) return
    let alive = true
    planTrip(A, B, 2)
      .then((r) => alive && setJourneys(r.journeys))
      .catch(() => alive && setJourneys([]))
    return () => void (alive = false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- A/B derivano da from/to
  }, [JSON.stringify(A), JSON.stringify(B), now, updatesAt])
  const [first, second] = journeys ?? []
  const firstRides = first ? rides(first) : []
  const open = () => {
    if (!A || !B) return
    useUi.setState((s) => ({ search: { ...s.search, from: A, to: B, view: 'results', selected: 0 }, detent: 'half', tab: 'search' }))
    void runPlan(A, B)
  }
  return (
    <div data-component="FavoriteTripCard" className="card" style={{ padding: '10px 8px 14px 16px', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }} onClick={open}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {A?.name ?? '?'} → {B?.name ?? '?'}
        </div>
        {firstRides.map((r) => <LineBadge key={r.routeId} route={data?.routes.get(r.routeId)} size={26} />)}
        <StarButton active fill={false} onToggle={() => useUi.getState().toggleFavTrip(from, to)} />
      </div>
      {!journeys && <Skeleton rows={1} height={44} avatar={40} />}
      {journeys && !first && <div className="subtle" style={{ fontSize: 15 }}>Nessuna soluzione nelle prossime ore</div>}
      {first && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, paddingRight: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3, height: 40, overflow: 'hidden', color: firstRides[0]!.live ? 'var(--pl-text)' : 'var(--pl-text-2)' }}>
            <Countdown seconds={Math.max(0, (firstRides[0]!.depart - now) / 1000)} size={40} live={firstRides[0]!.live} />
            {firstRides[0]!.live ? <LiveIcon size={12} /> : <ClockIcon size={14} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {firstRides.length > 1 ? 'Linee' : 'Linea'} {firstRides.map((r) => data?.routes.get(r.routeId)?.short).join(' › ')} da {data?.stops.get(firstRides[0]!.fromStop)?.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>
              arrivo {fmtTime(first.arrive)}
              {second ? ` · poi tra ${Math.max(0, Math.floor((rides(second)[0]!.depart - now) / 60_000))} min` : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FavoriteStopCard({ id, now }: { id: string; now: number }) {
  const data = useStatic((s) => s.data)
  const updates = useRealtime((s) => s.updates)
  const [times, setTimes] = useState<StopTimes | null>(null)
  useEffect(() => void loadStopTimes(id).then(setTimes), [id])
  const board = times ? buildBoard(id, times, updates, now, 3) : null
  return (
    <div data-component="FavoriteStopCard" className="card" style={{ padding: '2px 8px 4px 16px', cursor: 'pointer' }} onClick={() => useUi.getState().openSheet({ kind: 'stop', id })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{data?.stops.get(id)?.name ?? id}</div>
        <StarButton active fill={false} onToggle={() => useUi.getState().toggleFavStop(id)} />
      </div>
      {!board && <Skeleton rows={3} height={46} avatar={30} />}
      {board?.night && board.rows[0] && (
        <div className="fav-row" style={{ gridTemplateColumns: '1fr', color: 'var(--pl-text-2)', fontSize: 15 }}>
          Nessun passaggio fino alle {fmtTime(board.rows[0].scheduled)}
        </div>
      )}
      {!board?.night &&
        board?.rows.map((row) => {
          const pattern = data?.patterns.get(row.patternId)
          return <DepartureRow key={`${row.tripId}-${row.scheduled}`} compact row={row} route={data?.routes.get(pattern?.route ?? '')} destination={pattern?.headsign ?? '—'} now={now} />
        })}
    </div>
  )
}

/* ---------- Info ---------- */
function ThemeSwitch() {
  const on = useUi((s) => s.lightAlways)
  return (
    <div className="card" style={{ padding: '0 16px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Tema chiaro anche di notte</div>
          <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Ignora la modalità scura del telefono</div>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label="Tema chiaro anche di notte"
          className={`switch ${on ? 'on' : ''}`}
          onClick={() => useUi.getState().setLightAlways(!on)}
        />
      </label>
    </div>
  )
}

const SOURCES = [
  { title: 'Dati: BusOne (busone.app) e TEP', sub: 'Posizioni e passaggi dei bus in tempo reale, orari GTFS' },
  { title: 'Treni: RFI', sub: 'Monitor arrivi e partenze della stazione di Parma' },
  { title: '© OpenStreetMap contributors', sub: 'Dati cartografici' },
  { title: 'Mappa base: OpenFreeMap', sub: 'Tile vettoriali openfreemap.org' },
]

export function InfoScreen() {
  return (
    <div data-component="InfoScreen" className="screen" style={{ zIndex: 9, paddingBottom: 48 }}>
      <button data-component="BackButton" className="back-btn" onClick={() => useUi.setState({ info: false })}>
        <BackIcon />
        Indietro
      </button>
      <div className="large-title">Info</div>
      <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 'none', width: 56, height: 56, borderRadius: 16, background: 'var(--pl-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4ZM9 4v14M15 6v14" /></svg>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Parma Live</div>
          <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Versione 0.1 · uso personale</div>
        </div>
      </div>
      <div className="section-header" style={{ paddingTop: 10 }}>ASPETTO</div>
      <ThemeSwitch />
      <div className="section-header" style={{ paddingTop: 10 }}>FONTI DATI</div>
      <div className="card" style={{ padding: '0 16px' }}>
        {SOURCES.map((s) => (
          <div key={s.title} data-component="AttributionRow" className="attribution-row">
            <div style={{ fontSize: 16, fontWeight: 600 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: 'var(--pl-text-2)', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
