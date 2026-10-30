// Preferiti, Cerca, Info.
import { useEffect, useMemo, useState } from 'react'
import { subscribeUpdates, useRealtime } from '../data/realtime'
import { loadStopTimes, useStatic } from '../data/static'
import { buildBoard, type StopTimes } from '../lib/board'
import { useNow } from '../lib/hooks'
import { useUi } from '../store'
import { Countdown, LineBadge, Skeleton, StarButton } from '../ui/bits'
import { BackIcon, ChevronIcon, InfoIcon, LiveIcon, PinIcon, SearchIcon } from '../ui/icons'

/* ---------- Preferiti ---------- */
export function FavoritesScreen() {
  const stops = useUi((s) => s.favorites.stops)
  useEffect(() => (stops.length ? subscribeUpdates() : undefined), [stops.length])
  return (
    <div className="screen" style={{ gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="large-title">Preferiti</div>
        <button data-component="IconButton" className="icon-btn card" aria-label="Info" onClick={() => useUi.setState({ info: true })}>
          <InfoIcon />
        </button>
      </div>
      {!stops.length && (
        <div className="card" style={{ padding: '24px 20px', fontSize: 15, color: 'var(--pl-text-2)' }}>
          Nessun preferito. Tocca la stella su una fermata per salvarla qui.
        </div>
      )}
      {stops.length > 0 && <div className="section-header" style={{ paddingTop: 10 }}>FERMATE</div>}
      {stops.map((id) => <FavoriteStopCard key={id} id={id} />)}
    </div>
  )
}

function FavoriteStopCard({ id }: { id: string }) {
  const now = useNow(1000)
  const data = useStatic((s) => s.data)
  const updates = useRealtime((s) => s.updates)
  const [times, setTimes] = useState<StopTimes | null>(null)
  useEffect(() => void loadStopTimes(id).then(setTimes), [id])
  const board = times ? buildBoard(id, times, updates, now, 3) : null
  const open = () => useUi.getState().openSheet({ kind: 'stop', id })
  return (
    <div data-component="FavoriteStopCard" className="card" style={{ padding: '2px 8px 4px 16px', cursor: 'pointer' }} onClick={open}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{data?.stops.get(id)?.name ?? id}</div>
        <StarButton active fill={false} onToggle={() => useUi.getState().toggleFavStop(id)} />
      </div>
      {!board && <Skeleton rows={3} height={46} avatar={30} />}
      {board?.night && (
        <div className="fav-row" style={{ gridTemplateColumns: '1fr', color: 'var(--pl-text-2)', fontSize: 15 }}>
          Nessun bus in servizio · prime corse del mattino
        </div>
      )}
      {board?.rows.slice(0, 3).map((row) => {
        const pattern = data?.patterns.get(row.patternId)
        const at = row.eta ?? row.scheduled
        return (
          <div key={`${row.tripId}-${row.scheduled}`} className="fav-row">
            <LineBadge route={data?.routes.get(pattern?.route ?? '')} size={30} />
            <div style={{ fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pattern?.headsign}</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3, height: 24, overflow: 'hidden', color: row.eta ? 'var(--pl-text)' : 'var(--pl-text-2)' }}>
              <Countdown seconds={Math.max(0, (at - now) / 1000)} size={20} />
              {row.eta && <LiveIcon size={10} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Cerca: fermate per nome (shortcut: il planner A→B del design non c'è ancora) ---------- */
export function SearchScreen() {
  const data = useStatic((s) => s.data)
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!data || needle.length < 2) return []
    // Più fermate con lo stesso nome (una per direzione): una riga per nome, con la prima.
    const byName = new Map<string, string>()
    for (const s of data.stops.values()) if (s.name.toLowerCase().includes(needle) && !byName.has(s.name)) byName.set(s.name, s.id)
    return [...byName].slice(0, 30)
  }, [q, data])
  return (
    <div className="screen">
      <div className="large-title">Cerca</div>
      <label data-component="SearchFieldGroup" className="card search-field">
        <div className="place-icon" style={{ width: 32, height: 32 }}><SearchIcon size={16} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--pl-text-2)' }}>Fermata</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca una fermata" style={{ fontSize: 17, fontWeight: 600, height: 22 }} autoComplete="off" enterKeyHint="search" />
        </div>
      </label>
      {results.length > 0 && (
        <div className="card" style={{ padding: '0 16px' }}>
          {results.map(([name, id]) => (
            <button key={id} data-component="PlaceRow" className="place-row" onClick={() => useUi.getState().openSheet({ kind: 'stop', id })}>
              <div className="place-icon"><PinIcon /></div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              <span style={{ color: 'var(--pl-text-3)' }}><ChevronIcon /></span>
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && !results.length && <div className="subtle" style={{ padding: '0 4px' }}>Nessuna fermata trovata.</div>}
    </div>
  )
}

/* ---------- Info ---------- */
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
