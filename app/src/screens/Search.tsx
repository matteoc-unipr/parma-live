// Tab Cerca: modulo Da/A con autocompletamento (fermate locali, poi indirizzi Photon) e risultati A→B.
import { useEffect, useMemo, useState } from 'react'
import { searchAddresses } from '../data/photon'
import { subscribeUpdates, useRealtime } from '../data/realtime'
import { loadStopTimes, useStatic } from '../data/static'
import { buildBoard, type StopTimes } from '../lib/board'
import { fuzzySearch } from '../lib/fuzzy'
import { useNow } from '../lib/hooks'
import { warmPlanner } from '../planner/client'
import type { Journey, RideLeg } from '../planner/plan'
import { runPlan, usePlan } from '../planner/state'
import { sameTrip, useUi, type FavPlace, type Place } from '../store'
import { BottomSheet } from '../ui/BottomSheet'
import { Countdown, fmtTime, LineBadge, Skeleton } from '../ui/bits'
import { DepartureRow } from '../ui/DepartureRow'
import { BackIcon, ChevronIcon, ClockIcon, LiveIcon, LocateIcon, PinIcon } from '../ui/icons'

type Data = NonNullable<ReturnType<typeof useStatic.getState>['data']>

/** Fermata come luogo: il punto medio delle fermate con quel nome (di solito una per direzione). */
export function stopPlace(data: Data, name: string): Place | null {
  const stops = (data.places.get(name) ?? []).map((id) => data.stops.get(id)!).filter(Boolean)
  if (!stops.length) return null
  const lat = stops.reduce((a, s) => a + s.lat, 0) / stops.length
  const lon = stops.reduce((a, s) => a + s.lon, 0) / stops.length
  return { kind: 'stop', name, lat, lon }
}
/** Tragitti salvati nel formato precedente: il nome di una località. */
export const resolvePlace = (data: Data | null, p: FavPlace) => (typeof p === 'string' ? (data && stopPlace(data, p)) : p)

export const rides = (j: Journey) => j.legs.filter((l): l is RideLeg => l.kind === 'ride')

const useHere = (): Place | null => {
  const geo = useUi((s) => s.geo)
  return geo.status === 'ok' ? { kind: 'here', name: 'Posizione attuale', lat: geo.lat!, lon: geo.lon! } : null
}

function goResults(from: Place, to: Place) {
  useUi.setState((s) => ({ search: { ...s.search, from, to, view: 'results', selected: 0 }, detent: 'half' }))
  void runPlan(from, to)
}

/* ---------- Modulo ---------- */
export function SearchScreen() {
  const data = useStatic((s) => s.data)
  const geo = useUi((s) => s.geo)
  const search = useUi((s) => s.search)
  const here = useHere()
  const from = search.from ?? here // design: Da = "Posizione attuale" di default
  const [focus, setFocus] = useState<'from' | 'to' | null>(search.to ? null : 'to')
  const [q, setQ] = useState('')
  const [addresses, setAddresses] = useState<{ q: string; list: Place[] }>({ q: '', list: [] })
  useEffect(() => warmPlanner(), []) // carica orari e indice mentre si scrive

  const stops = useMemo(
    () => (data && q.trim().length >= 2 ? fuzzySearch([...data.places.keys()], (n) => n, q, 6).map((n) => stopPlace(data, n)!) : []),
    [q, data],
  )
  // Indirizzi: dopo 250 ms senza battiture; la richiesta precedente si annulla.
  useEffect(() => {
    const query = q.trim()
    if (query.length < 3) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      searchAddresses(query, ctrl.signal)
        .then((list) => setAddresses({ q: query, list }))
        .catch(() => {}) // offline o annullata: restano solo le fermate
    }, 250)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q])
  const shownAddresses = addresses.q === q.trim() && q.trim().length >= 3 ? addresses.list : []

  const pick = (place: Place) => {
    const next = { from, to: search.to, [focus!]: place }
    useUi.getState().setSearch({ [focus!]: place })
    setQ('')
    if (next.from && next.to) {
      setFocus(null)
      goResults(next.from, next.to)
    } else setFocus(next.from ? 'to' : 'from')
  }

  const field = (which: 'from' | 'to', label: string, placeholder: string) => {
    const value = which === 'from' ? from : search.to
    return (
      <div className="search-field" onClick={() => setFocus(which)} style={{ cursor: 'text', padding: 0 }}>
        <div className="place-icon" style={{ width: 32, height: 32, ...(which === 'from' ? { background: 'var(--pl-accent-soft)', color: 'var(--pl-accent)' } : {}) }}>
          {which === 'from' ? <LocateIcon size={15} /> : <PinIcon />}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 52 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--pl-text-2)' }}>{label}</div>
          {focus === which ? (
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca una fermata o un indirizzo" aria-label={label} style={{ fontSize: 17, fontWeight: 600, height: 22 }} autoComplete="off" enterKeyHint="search" />
          ) : (
            <div style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: value ? (value.kind === 'here' ? 'var(--pl-accent)' : undefined) : 'var(--pl-text-3)' }}>
              {value?.name ?? placeholder}
            </div>
          )}
        </div>
      </div>
    )
  }

  const row = (p: Place, icon: React.ReactNode) => (
    <button key={`${p.kind}-${p.name}-${p.detail ?? ''}`} data-component="PlaceRow" className="place-row" onClick={() => pick(p)}>
      <div className="place-icon">{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: p.kind === 'here' ? 'var(--pl-accent)' : undefined }}>{p.name}</div>
        {p.detail && <div style={{ fontSize: 13, color: 'var(--pl-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.detail}</div>}
      </div>
      <span style={{ color: 'var(--pl-text-3)' }}><ChevronIcon /></span>
    </button>
  )

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <div className="large-title">Cerca</div>
        {focus && (from || search.to) && (
          <button style={{ fontSize: 17, color: 'var(--pl-accent)', height: 44, padding: '0 4px' }} onClick={() => { setFocus(null); setQ('') }}>
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
          onClick={() => useUi.getState().setSearch({ from: search.to, to: from })}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" /></svg>
        </button>
      </div>
      {geo.status === 'denied' && !search.from && (
        <div data-component="StatusBanner" style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 18, background: 'var(--pl-late-soft)', fontSize: 14, lineHeight: '19px' }}>
          <span className="late"><LocateIcon size={18} denied cutColor="var(--pl-late-soft)" /></span>
          <span>Accesso alla posizione negato. Scegli una partenza, oppure attiva la posizione in Impostazioni › Privacy › Localizzazione.</span>
        </div>
      )}
      {focus && (
        <>
          {here && !q && <div className="card" style={{ padding: '0 16px' }}>{row(here, <LocateIcon size={16} />)}</div>}
          {stops.length > 0 && (
            <>
              <div className="section-header">FERMATE</div>
              <div className="card" style={{ padding: '0 16px' }}>{stops.map((p) => row(p, <StopDot />))}</div>
            </>
          )}
          {shownAddresses.length > 0 && (
            <>
              <div className="section-header">INDIRIZZI</div>
              <div className="card" style={{ padding: '0 16px' }}>{shownAddresses.map((p) => row(p, <PinIcon />))}</div>
            </>
          )}
          {q.trim().length >= 3 && !stops.length && !shownAddresses.length && <div className="subtle" style={{ padding: '0 4px' }}>Nessun risultato.</div>}
        </>
      )}
      {!focus && from && search.to && (
        <button className="card" style={{ height: 52, fontSize: 17, fontWeight: 600, color: 'var(--pl-accent)' }} onClick={() => goResults(from, search.to!)}>
          Cerca soluzioni
        </button>
      )}
    </div>
  )
}

/** Icona fermata: come il marker sulla mappa. */
const StopDot = () => <span style={{ width: 14, height: 14, borderRadius: 7, border: '3px solid #8E8E96', background: '#fff' }} />

/* ---------- Risultati ---------- */
export function ResultsView() {
  const { from, to, selected } = useUi((s) => s.search)
  const plan = usePlan()
  const now = useNow(15_000)
  const data = useStatic((s) => s.data)
  const saved = useUi((s) => (from && to ? s.favorites.trips.some((t) => sameTrip(t, from, to)) : false))
  const key = from && to ? `${from.lat},${from.lon}>${to.lat},${to.lon}` : ''
  // Orari live: si ricalcola ogni 15 s finché i risultati sono aperti.
  useEffect(() => {
    if (!from || !to) return
    const unsub = subscribeUpdates()
    const iv = setInterval(() => void runPlan(from, to, { refresh: true }), 15_000)
    return () => {
      unsub()
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key riassume from/to
  }, [key])
  if (!from || !to) return null
  const journeys = plan.result?.journeys ?? []
  const back = () => useUi.getState().setSearch({ view: 'form' })

  // Suggerimento a piedi (design): linea d'aria × 1,25, alla stessa velocità del planner (80 m/min).
  const kx = 111_320 * Math.cos((from.lat * Math.PI) / 180)
  const walkM = Math.hypot((to.lon - from.lon) * kx, (to.lat - from.lat) * 110_540) * 1.25
  const walkMin = Math.round(walkM / 80)

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 10px' }}>
      <div>
        <div style={{ font: 'var(--pl-type-title-3)' }}>
          {plan.status === 'loading' ? 'Cerco…' : journeys.length ? `${journeys.length} ${journeys.length === 1 ? 'soluzione' : 'soluzioni'}` : 'Nessuna soluzione'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Partenza ora · {fmtTime(now)}</div>
      </div>
      <button
        data-component="StarButton"
        aria-pressed={saved}
        onClick={() => useUi.getState().toggleFavTrip(from, to)}
        style={{ height: 44, padding: '0 14px 0 12px', borderRadius: 22, background: 'var(--pl-fill)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: saved ? 'var(--pl-star)' : 'var(--pl-text)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" /></svg>
        <span style={{ color: 'var(--pl-text)' }}>{saved ? 'Salvato' : 'Salva'}</span>
      </button>
    </div>
  )

  return (
    <>
      <div data-component="RouteSummaryBar" className="glass" style={{ position: 'absolute', left: 16, right: 16, top: 'calc(var(--safe-top) + 2px)', height: 60, borderRadius: 30, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', zIndex: 3, background: 'var(--pl-glass-strong)' }}>
        <button data-component="BackButton" className="icon-btn" aria-label="Indietro" onClick={back}><BackIcon /></button>
        <button onClick={back} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', color: from.kind === 'here' ? 'var(--pl-accent)' : undefined }}>
            <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: 'var(--pl-accent)' }} />{from.name}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <span style={{ flex: 'none', width: 8, height: 8, borderRadius: 2, background: 'var(--pl-text)' }} />{to.name}
          </span>
        </button>
        <button className="icon-btn" aria-label="Inverti partenza e arrivo" onClick={() => goResults(to, from)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" /></svg>
        </button>
      </div>
      <BottomSheet header={header} closable={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plan.status === 'loading' && <div className="card" style={{ padding: '0 16px', background: 'var(--pl-card)' }}><Skeleton rows={3} height={62} avatar={32} /></div>}
          {plan.status === 'error' && <div className="subtle">Ricerca non riuscita: {plan.error}</div>}
          {journeys.map((j, i) => (
            <div key={j.signature}>
              <RouteResultCard journey={j} now={now} selected={i === selected} onClick={() => useUi.getState().setSearch({ selected: i })} />
              {i === selected && data && <BoardingBoard journey={j} journeys={journeys} now={now} />}
            </div>
          ))}
          {plan.status === 'done' && !journeys.length && (
            <>
              <div data-component="EmptyState" style={{ padding: '4px 8px 6px' }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>Nessuna soluzione nelle prossime 3 ore</div>
                <div style={{ fontSize: 15, lineHeight: '20px', color: 'var(--pl-text-2)', marginTop: 2 }}>Nessuna linea entro 600 m, diretta o con un cambio.</div>
              </div>
              <div data-component="WalkSuggestionCard" className="card" style={{ background: 'var(--pl-card)', padding: '14px 14px 14px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 0 0 2px var(--pl-accent)' }}>
                <div className="empty-icon" style={{ width: 44, height: 44, background: 'var(--pl-accent-soft)', color: 'var(--pl-accent)' }}><WalkIcon /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Suggerimento</div>
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>A piedi · {walkMin} min</div>
                  <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>{(walkM / 1000).toFixed(1).replace('.', ',')} km · arrivo alle {fmtTime(now + walkMin * 60_000)}</div>
                </div>
              </div>
            </>
          )}
          {import.meta.env.DEV && plan.result && (
            <div style={{ fontSize: 11, color: 'var(--pl-text-3)' }}>
              calcolo {plan.result.computeMs.toFixed(1)} ms · andata/ritorno worker {plan.result.roundTripMs.toFixed(1)} ms
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

const WalkIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4.5" r="2" fill="currentColor" /><path d="M9.5 21l2.5-7-3-3 1.5-4 3.5 3 3 1M12 14l3 3 1 4M9 11l-2.5 3" /></svg>
)

/** Passi della soluzione: a piedi N › linea › (a piedi N ›) linea › a piedi N. */
export function JourneySteps({ journey }: { journey: Journey }) {
  const data = useStatic((s) => s.data)
  const steps = journey.legs.filter((l) => l.kind === 'ride' || l.seconds >= 30)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'nowrap', overflow: 'hidden' }}>
      {steps.map((l, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-3)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          )}
          {l.kind === 'walk' ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 15, fontWeight: 600, color: 'var(--pl-text-2)' }}>
              <WalkIcon size={18} />
              {Math.max(1, Math.round(l.seconds / 60))}
            </span>
          ) : (
            <LineBadge route={data?.routes.get(l.routeId)} size={32} />
          )}
        </span>
      ))}
    </div>
  )
}

function RouteResultCard({ journey: j, now, selected, onClick }: { journey: Journey; now: number; selected: boolean; onClick: () => void }) {
  const data = useStatic((s) => s.data)
  const [first, second] = rides(j)
  const late = (first!.delaySec ?? 0) >= 60
  const stopName = (id: string) => data?.stops.get(id)?.name ?? id
  return (
    <button
      data-component="RouteResultCard"
      onClick={onClick}
      aria-pressed={selected}
      style={{ width: '100%', background: 'var(--pl-card)', borderRadius: 24, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', boxShadow: selected ? '0 0 0 2px var(--pl-accent)' : 'none', transition: 'box-shadow .3s ease' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}><JourneySteps journey={j} /></div>
        <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{Math.round((j.arrive - j.leave) / 60_000)}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--pl-text-2)' }}>min</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: 'var(--pl-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', height: 24, width: '100%' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: first!.live ? (late ? 'var(--pl-late)' : 'var(--pl-ok)') : 'var(--pl-text-2)' }}>
          <span>tra</span>
          <Countdown seconds={Math.max(0, (first!.depart - now) / 1000)} size={15} live={first!.live} />
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>da {stopName(first!.fromStop)}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--pl-text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {first!.live ? <LiveIcon size={10} /> : <ClockIcon size={12} />}
        arrivo {fmtTime(j.arrive)} · {second ? `cambio a ${stopName(second.fromStop)}` : 'diretto'}
        {late ? ` · +${Math.round(first!.delaySec! / 60)} min` : ''}
      </div>
    </button>
  )
}

/** Tabellone della fermata di salita, solo con le linee trovate dalla ricerca. */
function BoardingBoard({ journey, journeys, now }: { journey: Journey; journeys: Journey[]; now: number }) {
  const data = useStatic((s) => s.data)!
  const updates = useRealtime((s) => s.updates)
  const stopId = rides(journey)[0]!.fromStop
  const [times, setTimes] = useState<StopTimes | null>(null)
  useEffect(() => void loadStopTimes(stopId).then(setTimes), [stopId])
  const lines = new Set(journeys.map((j) => rides(j)[0]!.routeId))
  const rows = times ? buildBoard(stopId, times, updates, now, 40).rows.filter((r) => lines.has(data.patterns.get(r.patternId)?.route ?? '')).slice(0, 4) : null
  return (
    <div style={{ padding: '6px 4px 4px' }}>
      <div className="section-header" style={{ padding: '4px 4px 2px' }}>DA {data.stops.get(stopId)?.name.toUpperCase()}</div>
      {!rows && <Skeleton rows={2} height={46} avatar={30} />}
      {rows?.length === 0 && <div className="subtle" style={{ fontSize: 14, padding: '6px 4px' }}>Nessun altro passaggio di queste linee a breve.</div>}
      {rows?.map((row) => {
        const pattern = data.patterns.get(row.patternId)
        return <DepartureRow key={`${row.tripId}-${row.scheduled}`} compact row={row} route={data.routes.get(pattern?.route ?? '')} destination={pattern?.headsign ?? '—'} now={now} />
      })}
    </div>
  )
}
