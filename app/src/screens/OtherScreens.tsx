// Preferiti e Info.
import { useEffect, useState } from 'react'
import { subscribeUpdates, useRealtime } from '../data/realtime'
import { useStatic, useStopTimes } from '../data/static'
import { buildBoard } from '../lib/board'
import { useNow } from '../lib/hooks'
import { planTrip } from '../planner/client'
import type { Journey } from '../planner/plan'
import { useUi, type FavPlace, type Theme } from '../store'
import { Countdown, fmtTime, LineBadge, Skeleton, StarButton } from '../ui/bits'
import { DepartureRow } from '../ui/DepartureRow'
import { BackIcon, ClockIcon, GearIcon, LiveIcon, StarIcon } from '../ui/icons'
import { resolvePlace, rides } from './Search'

const TICK = 15_000 // countdown a passi di 15 s

/** Rimozione con "Annulla" (UX-AUDIT.md §5): la stella sulle schede è vicina all'area che le apre. */
function removeWithUndo(title: string, name: string, remove: () => void) {
  const { favorites, setFavorites, showToast } = useUi.getState()
  remove()
  showToast(title, name, { action: { label: 'Annulla', run: () => setFavorites(favorites) } })
}

/* ---------- Preferiti ---------- */
export function FavoritesScreen({ className = '' }: { className?: string }) {
  const { stops, trips } = useUi((s) => s.favorites)
  const any = stops.length + trips.length > 0
  useEffect(() => (any ? subscribeUpdates() : undefined), [any])
  const now = useNow(TICK)
  return (
    <div className={`screen ${className}`} style={{ gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="large-title" style={{ margin: 0 }}>Preferiti</h1>
        <button data-component="IconButton" className="icon-btn" aria-label="Impostazioni e fonti dei dati" onClick={() => useUi.setState({ info: true })}>
          <GearIcon />
        </button>
      </div>
      {!any && (
        <div data-component="EmptyState" className="card" style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div className="empty-icon" style={{ color: 'var(--pl-star)' }}><StarIcon size={20} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: 'var(--pl-type-headline)' }}>Nessuna fermata salvata</div>
              <div className="subtle" style={{ fontSize: 15, lineHeight: '20px', marginTop: 2 }}>
                Apri una fermata e tocca la stella: qui vedrai i prossimi passaggi appena apri l'app. Anche i tragitti si salvano dai risultati.
              </div>
            </div>
          </div>
          <button className="btn-primary" onClick={() => useUi.setState({ tab: 'map', searching: 'map', stack: [], sheet: null })}>
            Cerca una fermata
          </button>
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
  // Risultati sopra i Preferiti: ← torna qui (UX-AUDIT.md §4).
  const open = () => A && B && useUi.getState().startPlan(A, B)
  const name = `${A?.name ?? '?'} → ${B?.name ?? '?'}`
  return (
    <div data-component="FavoriteTripCard" className="card tap-card" style={{ padding: '10px 8px 14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Il pulsante copre tutta la scheda (.card-link::after); la stella sta sopra, non dentro. */}
        <button className="card-link" onClick={open} aria-label={`Tragitto ${name}: apri le soluzioni`} style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </button>
        {firstRides.map((r) => <LineBadge key={r.routeId} route={data?.routes.get(r.routeId)} size={26} />)}
        <StarButton active fill={false} onToggle={() => removeWithUndo('Tragitto rimosso dai preferiti', name, () => useUi.getState().toggleFavTrip(from, to))} />
      </div>
      {!journeys && <Skeleton rows={1} height={44} avatar={40} label="Calcolo il prossimo bus del tragitto" slow="Il calcolo non arriva: gli orari dei bus non sono ancora scaricati." />}
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
  const { times, retry } = useStopTimes(id)
  const board = times && times !== 'error' ? buildBoard(id, times, updates, now, 3) : null
  const name = data?.stops.get(id)?.name ?? id
  return (
    <div
      data-component="FavoriteStopCard"
      className="card tap-card"
      style={{ padding: '2px 8px 4px 16px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        {/* Tabellone sopra i Preferiti: ✕ torna qui. */}
        <button className="card-link" onClick={() => useUi.getState().openSheet({ kind: 'stop', id })} aria-label={`${name}: apri il tabellone`} style={{ fontSize: 17, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </button>
        <StarButton active fill={false} onToggle={() => removeWithUndo('Fermata rimossa dai preferiti', name, () => useUi.getState().toggleFavStop(id))} />
      </div>
      {times === 'error' && (
        <div className="fav-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', color: 'var(--pl-text-2)', fontSize: 15 }}>
          Orari non scaricati: sei offline.
          <button
            className="text-btn"
            onClick={retry}
          >
            Riprova
          </button>
        </div>
      )}
      {times === null && <Skeleton rows={3} height={46} avatar={30} label={`Carico i passaggi di ${name}`} slow="Gli orari della fermata non arrivano: la connessione è lenta o assente." />}
      {board && !board.night && !board.rows.length && (
        <div className="fav-row" style={{ gridTemplateColumns: '1fr', color: 'var(--pl-text-2)', fontSize: 15 }}>Nessun passaggio nelle prossime ore</div>
      )}
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
const THEMES: { id: Theme; label: string }[] = [
  { id: 'auto', label: 'Automatico' },
  { id: 'light', label: 'Chiaro' },
  { id: 'dark', label: 'Scuro' },
]

function ThemeSwitch() {
  const theme = useUi((s) => s.theme)
  const i = THEMES.findIndex((t) => t.id === theme)
  return (
    <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Tema</div>
        <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>{theme === 'auto' ? 'Segue la modalità chiara o scura del telefono' : `Sempre ${theme === 'light' ? 'chiaro' : 'scuro'}, anche se il telefono è impostato diversamente`}</div>
      </div>
      <div data-component="SegmentedControl" className="segmented three" role="radiogroup" aria-label="Tema">
        <div className="thumb" style={{ transform: `translateX(${i * 100}%)` }} />
        {THEMES.map((t) => (
          <button key={t.id} role="radio" aria-checked={theme === t.id} className={theme === t.id ? 'on' : ''} onClick={() => useUi.getState().setTheme(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Attribuzioni obbligatorie: BusOne la richiede nella forma "BusOne (https://busone.app) e TEP".
const SOURCES = [
  { title: 'Bus: BusOne (https://busone.app) e TEP', sub: 'Posizioni e passaggi in tempo reale, orari GTFS. Uso personale.', href: 'https://busone.app' },
  { title: 'Treni: ViaggiaTreno', sub: 'Partenze, arrivi e andamento dei treni (Trenitalia)', href: 'http://www.viaggiatreno.it' },
  { title: 'Treni, quando ViaggiaTreno non risponde: RFI', sub: 'Monitor arrivi e partenze della stazione di Parma', href: 'https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Home' },
  { title: '© OpenStreetMap contributors', sub: 'Dati cartografici, licenza ODbL', href: 'https://www.openstreetmap.org/copyright' },
  { title: 'Mappa base: OpenFreeMap', sub: 'Tile vettoriali', href: 'https://openfreemap.org' },
  { title: 'Indirizzi: Photon (komoot)', sub: 'Ricerca indirizzi su dati OpenStreetMap', href: 'https://photon.komoot.io' },
]

export function InfoScreen() {
  return (
    <div data-component="InfoScreen" className="screen" style={{ zIndex: 9, paddingBottom: 48 }}>
      <button data-component="BackButton" className="back-btn" onClick={() => useUi.setState({ info: false })}>
        <BackIcon />
        Indietro
      </button>
      <h1 className="large-title" style={{ margin: 0 }}>Impostazioni e info</h1>
      <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 'none', width: 56, height: 56, borderRadius: 16, background: 'var(--pl-accent)', color: 'var(--pl-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          <a key={s.title} data-component="AttributionRow" className="attribution-row" href={s.href} target="_blank" rel="noreferrer" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: 'var(--pl-text-2)', marginTop: 2 }}>{s.sub}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
