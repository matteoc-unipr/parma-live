// Preferiti, Cerca, Info.
import { useEffect, useMemo, useState } from 'react'
import { subscribeUpdates, useRealtime } from '../data/realtime'
import { loadStopTimes, useStatic } from '../data/static'
import { buildBoard, directJourneys, type Journey, type StopTimes } from '../lib/board'
import { useNow } from '../lib/hooks'
import { useUi } from '../store'
import { Countdown, fmtTime, LineBadge, Skeleton, StarButton } from '../ui/bits'
import { DepartureRow } from '../ui/DepartureRow'
import { BackIcon, ChevronIcon, ClockIcon, InfoIcon, LiveIcon, PinIcon } from '../ui/icons'

const TICK = 15_000 // countdown a passi di 15 s

/** Orari di più fermate (on-demand, in cache). null finché non sono arrivati tutti. */
function useStopTimes(ids: string[]) {
  const key = ids.join('|')
  const [state, setState] = useState<{ key: string; times: Map<string, StopTimes> } | null>(null)
  useEffect(() => {
    let alive = true
    const list = key ? key.split('|') : []
    void Promise.all(list.map(loadStopTimes)).then((all) => {
      if (alive) setState({ key, times: new Map(list.map((id, i) => [id, all[i]!])) })
    })
    return () => void (alive = false)
  }, [key])
  return state?.key === key ? state.times : null
}

/** Prossime corse dirette tra due località (nomi in data.places). */
function useJourneys(from: string, to: string, limit: number, now: number) {
  const data = useStatic((s) => s.data)
  const updates = useRealtime((s) => s.updates)
  const fromIds = data?.places.get(from) ?? []
  const toIds = data?.places.get(to) ?? []
  const fromTimes = useStopTimes(fromIds)
  const toTimes = useStopTimes(toIds)
  if (!fromTimes || !toTimes) return null
  return directJourneys(fromTimes, toTimes, updates, now, limit)
}

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
      {trips.map((t) => <FavoriteTripCard key={`${t.from}→${t.to}`} from={t.from} to={t.to} now={now} />)}
      {stops.length > 0 && <div className="section-header" style={{ paddingTop: 10 }}>FERMATE</div>}
      {stops.map((id) => <FavoriteStopCard key={id} id={id} now={now} />)}
    </div>
  )
}

function FavoriteTripCard({ from, to, now }: { from: string; to: string; now: number }) {
  const data = useStatic((s) => s.data)
  const journeys = useJourneys(from, to, 3, now)
  const [first, second] = journeys ?? []
  const route = (j: Journey) => data?.routes.get(data.patterns.get(j.patternId)?.route ?? '')
  const lines = [...new Map((journeys ?? []).map((j) => [route(j)?.id, route(j)])).values()]
  const open = () => {
    useUi.getState().setSearch({ from, to })
    useUi.getState().setTab('search')
  }
  return (
    <div data-component="FavoriteTripCard" className="card" style={{ padding: '10px 8px 14px 16px', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }} onClick={open}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {from} → {to}
        </div>
        {lines.map((r) => <LineBadge key={r?.id} route={r} size={26} />)}
        <StarButton active fill={false} onToggle={() => useUi.getState().toggleFavTrip(from, to)} />
      </div>
      {!journeys && <Skeleton rows={1} height={44} avatar={40} />}
      {journeys && !first && <div className="subtle" style={{ fontSize: 15 }}>Nessuna corsa diretta nelle prossime ore</div>}
      {first && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, paddingRight: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3, height: 40, overflow: 'hidden', color: first.live ? 'var(--pl-text)' : 'var(--pl-text-2)' }}>
            <Countdown seconds={Math.max(0, (first.depart - now) / 1000)} size={40} live={first.live} />
            {first.live ? <LiveIcon size={12} /> : <ClockIcon size={14} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Linea {route(first)?.short} da {data?.stops.get(first.fromStop)?.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>
              arrivo {fmtTime(first.arrive)}
              {second ? ` · poi tra ${Math.max(0, Math.floor((second.depart - now) / 60_000))} min` : ''}
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

/* ---------- Cerca: tragitti diretti tra due località ---------- */
// shortcut: solo corse dirette (stessa linea), niente cambi né tratti a piedi del planner del design.
export function SearchScreen() {
  const data = useStatic((s) => s.data)
  const { search, setSearch } = useUi()
  const [focus, setFocus] = useState<'from' | 'to' | null>(search.from && search.to ? null : search.from ? 'to' : 'from')
  const [q, setQ] = useState('')
  const suggestions = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!data || needle.length < 2) return []
    return [...data.places.keys()].filter((n) => n.toLowerCase().includes(needle)).slice(0, 30)
  }, [q, data])
  const pick = (name: string) => {
    if (!focus) return
    setSearch({ [focus]: name })
    setQ('')
    setFocus(focus === 'from' && !search.to ? 'to' : null)
  }
  const field = (which: 'from' | 'to', label: string, placeholder: string) => (
    <div className="search-field" onClick={() => setFocus(which)} style={{ cursor: 'text', padding: 0 }}>
      <div className="place-icon" style={{ width: 32, height: 32, ...(which === 'from' ? { background: 'var(--pl-accent-soft)', color: 'var(--pl-accent)' } : {}) }}>
        <PinIcon />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingRight: 52 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--pl-text-2)' }}>{label}</div>
        {focus === which ? (
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={label} style={{ fontSize: 17, fontWeight: 600, height: 22 }} autoComplete="off" enterKeyHint="search" />
        ) : (
          <div style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: search[which] ? undefined : 'var(--pl-text-3)' }}>
            {search[which] ?? placeholder}
          </div>
        )}
      </div>
    </div>
  )
  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <div className="large-title">Cerca</div>
        {focus && (search.from || search.to) && (
          <button style={{ fontSize: 17, color: 'var(--pl-accent)', height: 44, padding: '0 4px' }} onClick={() => (setFocus(null), setQ(''))}>
            Annulla
          </button>
        )}
      </div>
      <div data-component="SearchFieldGroup" className="card" style={{ position: 'relative', padding: '0 16px' }}>
        {field('from', 'Da', 'Scegli partenza')}
        <div style={{ height: 1, background: 'var(--pl-hair)', marginLeft: 46, marginRight: 56 }} />
        {field('to', 'A', 'Dove vuoi andare?')}
        <button
          className="icon-btn"
          aria-label="Inverti partenza e arrivo"
          style={{ position: 'absolute', right: 12, top: 40, background: 'var(--pl-fill)' }}
          onClick={() => setSearch({ from: search.to, to: search.from })}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" /></svg>
        </button>
      </div>
      {focus && suggestions.length > 0 && (
        <div className="card" style={{ padding: '0 16px' }}>
          {suggestions.map((name) => (
            <button key={name} data-component="PlaceRow" className="place-row" onClick={() => pick(name)}>
              <div className="place-icon"><PinIcon /></div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              <span style={{ color: 'var(--pl-text-3)' }}><ChevronIcon /></span>
            </button>
          ))}
        </div>
      )}
      {focus && q.trim().length >= 2 && !suggestions.length && <div className="subtle" style={{ padding: '0 4px' }}>Nessuna fermata trovata.</div>}
      {!focus && search.from && search.to && <Results from={search.from} to={search.to} />}
    </div>
  )
}

function Results({ from, to }: { from: string; to: string }) {
  const now = useNow(TICK)
  const data = useStatic((s) => s.data)
  useEffect(() => subscribeUpdates(), [])
  const journeys = useJourneys(from, to, 3, now)
  const saved = useUi((s) => s.favorites.trips.some((t) => t.from === from && t.to === to))
  // Suggerimento a piedi (design): linea d'aria × 1,25 a 75 m/min.
  const a = data?.stops.get(data.places.get(from)?.[0] ?? '')
  const b = data?.stops.get(data.places.get(to)?.[0] ?? '')
  const walkM = a && b ? Math.hypot((b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180), (b.lat - a.lat) * 110_540) * 1.25 : 0
  const walkMin = Math.round(walkM / 75)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 0 4px' }}>
        <div>
          <div style={{ font: 'var(--pl-type-title-3)' }}>
            {journeys ? (journeys.length ? `${journeys.length} ${journeys.length === 1 ? 'corsa diretta' : 'corse dirette'}` : 'Nessuna corsa diretta') : 'Cerco…'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Partenza ora · {fmtTime(now)}</div>
        </div>
        <button
          data-component="StarButton"
          className="card"
          aria-pressed={saved}
          onClick={() => useUi.getState().toggleFavTrip(from, to)}
          style={{ height: 44, padding: '0 14px 0 12px', borderRadius: 22, display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: saved ? 'var(--pl-star)' : 'var(--pl-text)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" /></svg>
          <span style={{ color: 'var(--pl-text)' }}>{saved ? 'Salvato' : 'Salva'}</span>
        </button>
      </div>
      {!journeys && <div className="card" style={{ padding: '0 16px' }}><Skeleton rows={3} height={62} avatar={32} /></div>}
      {journeys?.map((j) => {
        const pattern = data?.patterns.get(j.patternId)
        const route = data?.routes.get(pattern?.route ?? '')
        const late = (j.delaySec ?? 0) >= 60
        const bus = j.live ? useRealtime.getState().buses.find((x) => x.tripId === j.tripId) : undefined
        return (
          <button
            key={`${j.tripId}-${j.depart}`}
            data-component="RouteResultCard"
            className="card"
            style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}
            onClick={() => useUi.getState().openSheet(bus ? { kind: 'bus', id: bus.id } : { kind: 'stop', id: j.fromStop })}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <LineBadge route={route} size={32} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pattern?.headsign}</div>
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{Math.round((j.arrive - j.depart) / 60_000)}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--pl-text-2)' }}>min</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: 'var(--pl-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', height: 24 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: j.live ? (late ? 'var(--pl-late)' : 'var(--pl-ok)') : 'var(--pl-text-2)' }}>
                <span>tra</span>
                <Countdown seconds={Math.max(0, (j.depart - now) / 1000)} size={15} live={j.live} />
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>da {data?.stops.get(j.fromStop)?.name}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--pl-text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {j.live ? <LiveIcon size={10} /> : <ClockIcon size={12} />}
              arrivo {fmtTime(j.arrive)} · {j.live ? (late ? `+${Math.round(j.delaySec! / 60)} min` : 'in orario') : 'orario programmato'}
            </div>
          </button>
        )
      })}
      {journeys && !journeys.length && walkMin > 0 && (
        <div data-component="WalkSuggestionCard" className="card" style={{ padding: '14px 14px 14px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 0 0 2px var(--pl-accent)' }}>
          <div className="empty-icon" style={{ width: 44, height: 44, background: 'var(--pl-accent-soft)', color: 'var(--pl-accent)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4.5" r="2" fill="currentColor" /><path d="M9.5 21l2.5-7-3-3 1.5-4 3.5 3 3 1M12 14l3 3 1 4M9 11l-2.5 3" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Suggerimento</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>A piedi · {walkMin} min</div>
            <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>
              {(walkM / 1000).toFixed(1).replace('.', ',')} km · arrivo alle {fmtTime(now + walkMin * 60_000)}
            </div>
          </div>
        </div>
      )}
    </>
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
