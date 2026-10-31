// Ricerca (overlay dalla barra della mappa, o per scegliere Da / A) e sheet dei risultati A→B.
import { useEffect, useMemo, useState } from 'react'
import { searchAddresses } from '../data/photon'
import { subscribeUpdates, useRealtime } from '../data/realtime'
import { useStatic, useStopTimes } from '../data/static'
import { buildBoard } from '../lib/board'
import { fuzzySearch } from '../lib/fuzzy'
import { useNow } from '../lib/hooks'
import { warmPlanner } from '../planner/client'
import type { Journey, RideLeg } from '../planner/plan'
import { runPlan, usePlan } from '../planner/state'
import { hereOf, sameTrip, useUi, type FavPlace, type Place } from '../store'
import { BottomSheet } from '../ui/BottomSheet'
import { Countdown, ErrorState, fmtTime, LineBadge, Skeleton } from '../ui/bits'
import { DepartureRow } from '../ui/DepartureRow'
import { BackIcon, ChevronIcon, ClockIcon, LiveIcon, LocateIcon, PinIcon, SearchIcon } from '../ui/icons'

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

const short = (data: Data, routeId: string) => data.routes.get(routeId)?.short ?? routeId
const byNumber = (data: Data) => (a: string, b: string) => (parseInt(short(data, a)) || 999) - (parseInt(short(data, b)) || 999)

/** Una fermata (una direzione) nei risultati della barra: linee e capolinea, per distinguere i due lati della strada. */
function stopDetail(data: Data, stopId: string) {
  const routes = new Set<string>()
  const heads = new Set<string>()
  for (const p of data.patterns.values())
    if (p.stops.includes(stopId) && p.stops.at(-1) !== stopId) {
      routes.add(p.route)
      heads.add(p.headsign)
    }
  if (!routes.size) return 'Capolinea'
  const lines = [...routes].sort(byNumber(data)).map((r) => short(data, r))
  return `verso ${[...heads].slice(0, 2).join(', ')} · ${lines.length > 1 ? 'linee' : 'linea'} ${lines.join(', ')}`
}

/* ---------- Overlay di ricerca ---------- */
type Hit = { key: string; title: string; detail?: string; icon: React.ReactNode; pick: () => void; accent?: boolean }

export function SearchOverlay() {
  const target = useUi((s) => s.searching)!
  const data = useStatic((s) => s.data)
  const geo = useUi((s) => s.geo)
  const search = useUi((s) => s.search)
  const buses = useRealtime((s) => s.buses)
  const here = hereOf(geo)
  const [q, setQ] = useState('')
  const [addresses, setAddresses] = useState<{ q: string; list: Place[]; failed: boolean }>({ q: '', list: [], failed: false })
  useEffect(() => warmPlanner(), []) // carica orari e indice mentre si scrive
  const query = q.trim()

  // Indirizzi: dopo 250 ms senza battiture; la richiesta precedente si annulla. Offline lo si dice (UX-AUDIT.md §5).
  useEffect(() => {
    if (query.length < 3) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      if (!navigator.onLine) return setAddresses({ q: query, list: [], failed: true })
      searchAddresses(query, ctrl.signal)
        .then((list) => setAddresses({ q: query, list, failed: false }))
        .catch(() => !ctrl.signal.aborted && setAddresses({ q: query, list: [], failed: true }))
    }, 250)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query])
  const addr = addresses.q === query && query.length >= 3 ? addresses : null

  const close = () => useUi.setState({ searching: null })
  const ui = useUi.getState
  // Scelta di un luogo come partenza o arrivo; con entrambi, risultati.
  const place = (p: Place) => {
    setQ('')
    // Dalla barra della mappa: sempre da dove sei (UX-AUDIT.md §5), non dall'ultimo tragitto.
    const from = target === 'from' ? p : target === 'map' ? here : (search.from ?? here)
    const to = target === 'to' || target === 'map' ? p : search.to
    if (target === 'from') ui().setSearch({ from: p })
    if (to && from) return ui().startPlan(from, to)
    if (to) return ui().startPlan(null, to) // senza partenza: chiede Da
    ui().setSearch({ from: p })
    useUi.setState({ searching: 'to' })
  }

  const hits = useMemo((): { title: string; rows: Hit[] }[] => {
    if (!data) return []
    const sections: { title: string; rows: Hit[] }[] = []
    if (target === 'map' && query) {
      const lines = [...data.routes.values()].filter((r) => r.short.toLowerCase().startsWith(query.toLowerCase())).sort((a, b) => byNumber(data)(a.id, b.id)).slice(0, 4)
      if (lines.length)
        sections.push({
          title: 'LINEE',
          rows: lines.map((r) => ({
            key: `line-${r.id}`,
            title: `Linea ${r.short}`,
            detail: buses.some((b) => b.routeId === r.id) ? 'Mostra solo questa linea sulla mappa' : 'Nessun bus di questa linea in servizio ora',
            icon: <LineBadge route={r} size={32} />,
            pick: () => {
              useUi.setState({ filter: [r.id], searching: null })
            },
          })),
        })
    }
    if (query.length >= 2) {
      const names = fuzzySearch([...data.places.keys()], (n) => n, query, 6)
      const rows: Hit[] =
        target === 'map'
          ? names.flatMap((n) =>
              (data.places.get(n) ?? []).map((id) => ({
                key: `stop-${id}`,
                title: n,
                detail: stopDetail(data, id),
                icon: <StopDot />,
                pick: () => {
                  close()
                  ui().openSheet({ kind: 'stop', id })
                },
              })),
            )
          : names.map((n) => {
              const p = stopPlace(data, n)!
              return { key: `place-${n}`, title: n, icon: <StopDot />, pick: () => place(p) }
            })
      if (rows.length) sections.push({ title: 'FERMATE', rows: rows.slice(0, 8) })
    }
    if (addr?.list.length)
      sections.push({ title: 'INDIRIZZI', rows: addr.list.map((p) => ({ key: `addr-${p.name}-${p.detail}`, title: p.name, detail: p.detail, icon: <PinIcon />, pick: () => place(p) })) })
    return sections
    // eslint-disable-next-line react-hooks/exhaustive-deps -- place dipende da target/search/here
  }, [data, query, addr, target, buses, search, here?.lat, here?.lon])

  const nothing = query.length >= 3 && addr && !addr.failed && !hits.length
  const title = target === 'map' ? 'Cerca' : target === 'from' ? 'Da dove parti?' : 'Dove vuoi andare?'
  const placeholder = target === 'map' ? 'Fermata, linea o indirizzo' : 'Fermata o indirizzo'
  const row = (h: Hit) => (
    <button key={h.key} data-component="PlaceRow" className="place-row" onClick={h.pick}>
      <div className="place-icon">{h.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: h.accent ? 'var(--pl-accent)' : undefined }}>{h.title}</div>
        {h.detail && <div style={{ fontSize: 13, color: 'var(--pl-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.detail}</div>}
      </div>
      <span style={{ color: 'var(--pl-text-3)' }}><ChevronIcon /></span>
    </button>
  )
  const other = target === 'from' ? search.to : target === 'to' ? (search.from ?? here) : null
  return (
    <div data-component="SearchOverlay" className="screen" style={{ zIndex: 8, paddingBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <h1 className="large-title" style={{ margin: 0, fontSize: target === 'map' ? undefined : 28 }}>{title}</h1>
        <button className="text-btn" onClick={close}>
          Annulla
        </button>
      </div>
      {other && (
        <div className="subtle" style={{ fontSize: 15, padding: '0 4px' }}>
          {target === 'from' ? 'Verso' : 'Da'} <b style={{ color: 'var(--pl-text)' }}>{other.name}</b>
        </div>
      )}
      <label data-component="SearchField" className="search-field card" style={{ cursor: 'text' }}>
        <span className="subtle"><SearchIcon size={20} /></span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          style={{ font: 'var(--pl-type-body)' }}
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="search"
        />
      </label>
      {target === 'from' && geo.status === 'denied' && (
        <div data-component="StatusBanner" style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 18, background: 'var(--pl-late-soft)', fontSize: 14, lineHeight: '19px' }}>
          <span className="late"><LocateIcon size={18} denied cutColor="var(--pl-late-soft)" /></span>
          <span>Posizione non disponibile: scegli da dove parti, oppure attiva la posizione in Impostazioni › Privacy › Localizzazione.</span>
        </div>
      )}
      {target !== 'map' && here && !query && (
        <div className="card" style={{ padding: '0 16px' }}>
          {row({ key: 'here', title: 'Posizione attuale', icon: <LocateIcon size={16} />, accent: true, pick: () => place(here) })}
        </div>
      )}
      {!query && target === 'map' && (
        <div className="subtle" style={{ fontSize: 15, lineHeight: '20px', padding: '0 4px' }}>
          Una fermata apre il suo tabellone, una linea filtra la mappa, un indirizzo ti mostra come arrivarci da dove sei.
        </div>
      )}
      {hits.map((s) => (
        <div key={s.title} style={{ display: 'contents' }}>
          <div className="section-header">{s.title}</div>
          <div className="card" style={{ padding: '0 16px' }}>{s.rows.map(row)}</div>
        </div>
      ))}
      {addr?.failed && <div role="status" className="subtle" style={{ padding: '0 4px', fontSize: 15 }}>Indirizzi non disponibili offline: cerca una fermata.</div>}
      {nothing && (
        <div role="status" className="subtle" style={{ padding: '0 4px', fontSize: 15 }}>
          Nessuna {target === 'map' ? 'fermata, linea' : 'fermata'} o indirizzo per «{query}» in provincia di Parma.
        </div>
      )}
    </div>
  )
}

/** Icona fermata: come il marker sulla mappa. */
const StopDot = () => <span style={{ width: 14, height: 14, borderRadius: 7, border: '3px solid #8E8E96', background: '#fff' }} />

/* ---------- Risultati A→B ---------- */
export function PlanSheet() {
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
  const edit = (which: 'from' | 'to') => useUi.setState({ searching: which })
  // Suggerimento a piedi (design): linea d'aria × 1,25, alla stessa velocità del planner (80 m/min).
  const kx = 111_320 * Math.cos((from.lat * Math.PI) / 180)
  const walkM = Math.hypot((to.lon - from.lon) * kx, (to.lat - from.lat) * 110_540) * 1.25
  const walkMin = Math.round(walkM / 80)
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 10px' }}>
      <div>
        <div style={{ font: 'var(--pl-type-title-3)' }}>
          {plan.status === 'loading' ? 'Cerco soluzioni…' : plan.status === 'error' ? 'Percorso non calcolato' : journeys.length ? `${journeys.length} ${journeys.length === 1 ? 'soluzione' : 'soluzioni'}` : 'Nessuna soluzione'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Partenza ora · {fmtTime(now)}</div>
      </div>
      <button
        data-component="StarButton"
        aria-pressed={saved}
        aria-label={saved ? 'Tragitto salvato nei preferiti: rimuovi' : 'Salva il tragitto nei preferiti'}
        onClick={() => useUi.getState().toggleFavTrip(from, to)}
        style={{ height: 44, padding: '0 14px 0 12px', borderRadius: 22, background: 'var(--pl-fill)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: saved ? 'var(--pl-star)' : 'var(--pl-text)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" /></svg>
        <span style={{ color: 'var(--pl-text)' }}>{saved ? 'Salvato' : 'Salva'}</span>
      </button>
    </div>
  )
  const swap = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" /></svg>
  )
  return (
    <>
      <div data-component="RouteSummaryBar" className="glass" style={{ position: 'absolute', left: 16, right: 16, top: 'calc(var(--safe-top) + 2px)', minHeight: 60, borderRadius: 30, display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', zIndex: 4 }}>
        <button data-component="BackButton" className="icon-btn" aria-label="Indietro" onClick={() => useUi.getState().back()}><BackIcon /></button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <button aria-label={`Partenza: ${from.name}. Cambia`} onClick={() => edit('from')} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textAlign: 'left', color: from.kind === 'here' ? 'var(--pl-accent)' : undefined }}>
            <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: 'var(--pl-accent)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{from.name}</span>
          </button>
          <button aria-label={`Arrivo: ${to.name}. Cambia`} onClick={() => edit('to')} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textAlign: 'left' }}>
            <span style={{ flex: 'none', width: 8, height: 8, borderRadius: 2, background: 'var(--pl-text)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{to.name}</span>
          </button>
        </div>
        <button className="icon-btn" aria-label="Inverti partenza e arrivo" onClick={() => useUi.getState().startPlan(to, from)}>{swap}</button>
      </div>
      <BottomSheet header={header}>
        {plan.status === 'loading' && <Skeleton rows={3} height={62} avatar={32} label="Cerco soluzioni" slow="Il calcolo sta impiegando più del solito: gli orari dei bus si stanno ancora scaricando." />}
        {plan.status === 'error' && (
          <ErrorState title="Percorso non calcolato" body="Gli orari dei bus non sono stati scaricati. Controlla la connessione e riprova." onRetry={() => void runPlan(from, to)} />
        )}
        {journeys.map((j, i) => (
          <div key={j.signature} style={{ display: 'contents' }}>
            <RouteOption journey={j} now={now} selected={i === selected} onClick={() => useUi.getState().setSearch({ selected: i })} />
            {i === selected && data && <BoardingBoard journey={j} journeys={journeys} now={now} />}
          </div>
        ))}
        {plan.status === 'done' && !journeys.length && (
          <>
            <div data-component="EmptyState" style={{ padding: '4px 0 12px' }}>
              <div style={{ fontSize: 17, fontWeight: 600 }}>Nessun bus nelle prossime 3 ore</div>
              <div style={{ fontSize: 15, lineHeight: '20px', color: 'var(--pl-text-2)', marginTop: 2 }}>Nessuna linea passa entro 600 m da partenza e arrivo, diretta o con un cambio.</div>
            </div>
            <div data-component="WalkSuggestion" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: '1px solid var(--pl-hair)' }}>
              <div className="empty-icon" style={{ width: 44, height: 44, background: 'var(--pl-accent-soft)', color: 'var(--pl-accent)' }}><WalkIcon /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
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
      </BottomSheet>
    </>
  )
}

const WalkIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4.5" r="2" fill="currentColor" /><path d="M9.5 21l2.5-7-3-3 1.5-4 3.5 3 3 1M12 14l3 3 1 4M9 11l-2.5 3" /></svg>
)

/** Passi della soluzione: a piedi N › linea › (a piedi N ›) linea › a piedi N. */
function JourneySteps({ journey }: { journey: Journey }) {
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

/** Una soluzione: riga dello sheet, evidenziata se scelta (DESIGN.md §6: niente card dentro lo sheet). */
function RouteOption({ journey: j, now, selected, onClick }: { journey: Journey; now: number; selected: boolean; onClick: () => void }) {
  const data = useStatic((s) => s.data)
  const [first, second] = rides(j)
  const late = (first!.delaySec ?? 0) >= 60
  const stopName = (id: string) => data?.stops.get(id)?.name ?? id
  const minutes = Math.round((j.arrive - j.leave) / 60_000)
  return (
    <button data-component="RouteOption" className="route-option" onClick={onClick} aria-pressed={selected} aria-label={`${minutes} minuti, arrivo ${fmtTime(j.arrive)}, ${second ? `cambio a ${stopName(second.fromStop)}` : 'diretto'}, da ${stopName(first!.fromStop)}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}><JourneySteps journey={j} /></div>
        <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{minutes}</span>
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
        {first!.live ? 'tempo reale' : 'programmato'} · arrivo {fmtTime(j.arrive)} · {second ? `cambio a ${stopName(second.fromStop)}` : 'diretto'}
        {late ? ` · +${Math.round(first!.delaySec! / 60)} min` : ''}
      </div>
    </button>
  )
}

/** Tabellone della fermata di salita, solo con le linee trovate dalla ricerca: sezione dello sheet. */
function BoardingBoard({ journey, journeys, now }: { journey: Journey; journeys: Journey[]; now: number }) {
  const data = useStatic((s) => s.data)!
  const updates = useRealtime((s) => s.updates)
  const stopId = rides(journey)[0]!.fromStop
  const { times, retry } = useStopTimes(stopId)
  const lines = new Set(journeys.map((j) => rides(j)[0]!.routeId))
  const rows =
    times && times !== 'error'
      ? buildBoard(stopId, times, updates, now, 40).rows.filter((r) => lines.has(data.patterns.get(r.patternId)?.route ?? '')).slice(0, 4)
      : null
  return (
    <div className="boarding" style={{ padding: '6px 12px 10px' }}>
      <div className="section-header" style={{ padding: '4px 0 2px' }}>PROSSIMI PASSAGGI DA {data.stops.get(stopId)?.name.toUpperCase()}</div>
      {times === 'error' && <ErrorState title="Orari della fermata non scaricati" body="Sei offline e questa fermata non è ancora stata aperta." onRetry={retry} />}
      {times === null && <Skeleton rows={2} height={46} avatar={30} label="Carico i passaggi della fermata di salita" slow="Gli orari della fermata non arrivano: la connessione è lenta o assente." />}
      {rows?.length === 0 && <div className="subtle" style={{ fontSize: 14, padding: '6px 0' }}>Nessun altro passaggio di queste linee a breve.</div>}
      {rows?.map((row) => {
        const pattern = data.patterns.get(row.patternId)
        return <DepartureRow key={`${row.tripId}-${row.scheduled}`} compact row={row} route={data.routes.get(pattern?.route ?? '')} destination={pattern?.headsign ?? '—'} now={now} />
      })}
    </div>
  )
}
