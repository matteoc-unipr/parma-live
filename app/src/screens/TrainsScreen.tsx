// Treni: Partenze/Arrivi di Parma (ViaggiaTreno, ripiego RFI), dettaglio fermata per fermata, bus per la stazione.
import { useEffect, useState } from 'react'
import { useStatic } from '../data/static'
import { titleCase, useTrainDetail, useTrains, type Loaded, type Train, type TrainDetail, type TrainMode } from '../data/trains'
import { useNow } from '../lib/hooks'
import { planTrip } from '../planner/client'
import type { Journey } from '../planner/plan'
import { hereOf, useUi, type Place } from '../store'
import { Countdown, ErrorState, fmtTime, LineBadge, Skeleton } from '../ui/bits'
import { BackIcon, CancelIcon, ChevronIcon, LiveIcon } from '../ui/icons'
import { rides } from './Search'

const STATION: Place = { kind: 'stop', name: 'Stazione FS', lat: 44.8102, lon: 10.3284 }

const status = (t: { cancelled: boolean; delayMin: number | null }) =>
  t.cancelled ? { text: 'Cancellato', cls: 'cancel' } : t.delayMin ? { text: `+${t.delayMin} min`, cls: 'late' } : { text: 'In orario', cls: 'ok' }

const plus = (time: string, min: number) => {
  const m = (+time.slice(0, 2) * 60 + +time.slice(3) + min + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function TrainsScreen({ className = '' }: { className?: string }) {
  const [mode, setMode] = useState<TrainMode>('departures')
  const [detail, setDetail] = useState<Train | null>(null)
  const board = useTrains(mode)
  if (detail) {
    // Alternativa a un treno cancellato: il prossimo non cancellato verso la stessa destinazione.
    const list = board.data?.trains ?? []
    const alt = list.slice(list.indexOf(detail) + 1).find((t) => !t.cancelled && t.station === detail.station) ?? null
    return <TrainDetailView className={className} train={detail} mode={mode} alternative={alt} onBack={() => setDetail(null)} onPick={setDetail} />
  }
  const trains = board.data?.trains
  return (
    <div className={`screen ${className}`}>
      <div style={{ padding: '0 4px' }}>
        <h1 className="large-title" style={{ padding: 0, margin: 0 }}>Treni da Parma</h1>
        <div style={{ fontSize: 15, color: 'var(--pl-text-2)' }}>
          Stazione FS · {board.data ? `aggiornato alle ${fmtTime(new Date(board.data.fetchedAt).getTime())}` : board.error ? 'tabellone non disponibile' : 'scarico il tabellone…'}
        </div>
      </div>
      <div data-component="SegmentedControl" className="segmented" role="tablist">
        <div className="thumb" style={{ transform: mode === 'arrivals' ? 'translateX(100%)' : 'none' }} />
        <button role="tab" aria-selected={mode === 'departures'} className={mode === 'departures' ? 'on' : ''} onClick={() => setMode('departures')}>Partenze</button>
        <button role="tab" aria-selected={mode === 'arrivals'} className={mode === 'arrivals' ? 'on' : ''} onClick={() => setMode('arrivals')}>Arrivi</button>
      </div>
      <SourceBanner state={board} />
      <div className="card" style={{ padding: '0 16px' }}>
        {!trains && !board.error && <Skeleton rows={7} height={64} avatar={44} label={mode === 'departures' ? 'Carico le partenze' : 'Carico gli arrivi'} slow="Il tabellone non arriva: ViaggiaTreno e RFI sono lenti o la connessione è assente." />}
        {!trains && board.error && (
          <ErrorState
            title="Treni non disponibili"
            body={`${board.error}. Riprovo da solo ogni 30 secondi; intanto gli orari sono su trenitalia.com.`}
          />
        )}
        {trains?.length === 0 && <div style={{ padding: '20px 0', color: 'var(--pl-text-2)' }}>{mode === 'departures' ? 'Nessuna partenza' : 'Nessun arrivo'} nelle prossime ore.</div>}
        {trains?.map((t) => <TrainRow key={`${t.number}-${t.time}`} train={t} onClick={() => setDetail(t)} />)}
      </div>
      {board.data && (
        <div style={{ fontSize: 12, color: 'var(--pl-text-3)', padding: '0 4px' }}>
          Fonte: {board.data.source === 'rfi' ? 'RFI · monitor arrivi e partenze' : 'ViaggiaTreno'}
        </div>
      )}
      {!trains && board.error && (
        <a className="text-btn" href="https://www.trenitalia.com" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', alignSelf: 'flex-start' }}>
          Apri trenitalia.com
        </a>
      )}
      {/* Secondario rispetto al tabellone (UX-AUDIT.md §5): in fondo. */}
      <BusToStationCard />
    </div>
  )
}

/** Stato della fonte: ripiego RFI, dato vecchio, oppure tutto giù con l'ultimo dato salvato. */
function SourceBanner({ state }: { state: Loaded<unknown> }) {
  const { data, error, fromDevice } = state
  const at = data ? fmtTime(new Date(data.fetchedAt).getTime()) : null
  let tone: 'late' | 'cancel' = 'late'
  let text: string | null = null
  if (error && !data) return null // lo dice l'ErrorState al posto della lista
  else if (error || fromDevice || data?.stale) {
    tone = 'cancel'
    text = `${error ?? 'ViaggiaTreno e RFI non rispondono'}. Mostro i dati delle ${at}.`
  } else if (data?.notice) text = `${data.notice}.`
  if (!text) return null
  return (
    <div data-component="StatusBanner" role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 18, background: `var(--pl-${tone}-soft)`, fontSize: 14, lineHeight: '19px' }}>
      <span style={{ flex: 'none', width: 8, height: 8, borderRadius: 4, marginTop: 6, background: `var(--pl-${tone})` }} />
      <span>{text}</span>
    </div>
  )
}

function PlatformBox({ platform, cancelled }: { platform: Train['platform']; cancelled: boolean }) {
  const shown = platform.actual ?? platform.planned
  const changed = !!platform.actual && !!platform.planned && platform.actual !== platform.planned
  return (
    <div
      className={`bin ${cancelled || !shown ? 'none' : ''}`}
      style={changed && !cancelled ? { background: 'var(--pl-late)', color: 'var(--pl-surface)' } : undefined}
      aria-label={cancelled ? 'Binario: nessuno, treno cancellato' : changed ? `Binario cambiato: ${shown}, previsto ${platform.planned}` : `Binario ${shown ?? 'non indicato'}`}
    >
      <small>BIN</small>
      <b>{cancelled ? '–' : (shown ?? '–')}</b>
    </div>
  )
}

function TrainRow({ train: t, onClick }: { train: Train; onClick: () => void }) {
  const st = status(t)
  return (
    <button data-component="TrainRow" className="train-row" onClick={onClick}>
      <div className={`time ${t.cancelled ? 'strike subtle' : ''}`}>{t.time}</div>
      <div style={{ minWidth: 0 }}>
        <div className="dest" style={{ color: t.cancelled ? 'var(--pl-text-2)' : undefined }}>{titleCase(t.station)}</div>
        <div className="meta">
          <span className="subtle">{t.label}</span>
          <span style={{ color: 'var(--pl-text-3)' }}>·</span>
          <span className={st.cls} style={{ fontWeight: 700 }}>{st.text}</span>
          {t.inStation && !t.cancelled && <span className="ok" style={{ fontWeight: 600 }}>· in stazione</span>}
        </div>
      </div>
      <PlatformBox platform={t.platform} cancelled={t.cancelled} />
    </button>
  )
}

function TrainDetailView({ className, train, mode, alternative, onBack, onPick }: { className: string; train: Train; mode: TrainMode; alternative: Train | null; onBack: () => void; onPick: (t: Train) => void }) {
  const { data, error, fromDevice } = useTrainDetail(train.number)
  const d: TrainDetail | null = data?.train ?? null
  const st = status(d ?? train)
  const cancelled = d?.cancelled ?? train.cancelled
  const parmaIdx = d ? d.stops.findIndex((s) => /^PARMA$/i.test(s.name)) : -1
  const parma = d?.stops[parmaIdx]
  const platform = parma?.platform ?? train.platform
  const nextIdx = d ? d.stops.findIndex((s) => !s.passed) : -1
  return (
    <div className={`screen ${className}`}>
      <button data-component="BackButton" className="back-btn" onClick={onBack}>
        <BackIcon />
        {mode === 'departures' ? 'Partenze' : 'Arrivi'}
      </button>
      <div style={{ padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="cat-pill">{train.category}</span>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>{train.number}</span>
        </div>
        <div style={{ fontSize: 17, color: 'var(--pl-text-2)', marginTop: 2 }}>
          {d ? `${titleCase(d.origin)} → ${titleCase(d.destination)}` : mode === 'departures' ? `Parma → ${titleCase(train.station)}` : `${titleCase(train.station)} → Parma`}
        </div>
      </div>
      {cancelled && (
        <div data-component="StatusBanner" style={{ background: 'var(--pl-cancel-soft)', borderRadius: 24, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="cancel" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><CancelIcon /><span style={{ fontSize: 17, fontWeight: 700 }}>Treno cancellato</span></div>
          <div style={{ fontSize: 15, lineHeight: '20px' }}>Il treno {train.label} delle {train.time} non circola.</div>
          {alternative && (
            // Riga del banner, non una card dentro il banner (DESIGN.md §6).
            <button onClick={() => onPick(alternative)} style={{ minHeight: 48, borderTop: '1px solid var(--pl-hair)', display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, textAlign: 'left' }}>
              <span style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Alternativa</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{alternative.label} delle {alternative.time}</span>
              <span style={{ color: 'var(--pl-text-3)' }}><ChevronIcon /></span>
            </button>
          )}
        </div>
      )}
      <div data-component="TrainStatusCard" className="card status-card">
        <div>
          <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Stato</div>
          <div className={`big ${st.cls}`}>{st.text}</div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: 'var(--pl-text-2)' }}>Parma · binario</div>
          <div className="big">
            {cancelled ? '–' : (platform.actual ?? platform.planned ?? '–')}{' '}
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--pl-text-2)' }}>{parma?.actual ?? plus(train.time, train.delayMin ?? 0)}</span>
          </div>
        </div>
        <div className="foot">
          <span className={cancelled ? 'cancel' : d?.lastSeen ? 'ok' : 'subtle'}><LiveIcon size={12} /></span>
          <span className="subtle">Ultimo rilevamento</span>
          <span style={{ fontWeight: 600 }}>
            {d?.lastSeen ? `${titleCase(d.lastSeen.station)}${d.lastSeen.time ? ` alle ${d.lastSeen.time}` : ''}` : d?.partial ? 'non disponibile (fonte RFI)' : '—'}
          </span>
        </div>
      </div>
      <SourceBanner state={{ data, error, fromDevice }} />
      {!d && !error && <div className="card" style={{ padding: '0 16px' }}><Skeleton rows={6} height={52} avatar={22} label="Carico le fermate del treno" slow="Il dettaglio del treno non arriva: ViaggiaTreno e RFI sono lenti o la connessione è assente." /></div>}
      {!d && error && <div className="card" style={{ padding: '0 16px' }}><ErrorState title="Fermate del treno non disponibili" body={`${error}. Riprovo da solo tra 30 secondi.`} /></div>}
      {d && (
        <div className="card" style={{ padding: '6px 16px' }}>
          {d.partial && <div style={{ fontSize: 13, color: 'var(--pl-text-2)', padding: '8px 0' }}>Dettaglio parziale: solo Parma e le fermate successive.</div>}
          {d.stops.map((s, i) => {
            const first = i === 0
            const last = i === d.stops.length - 1
            const isParma = i === parmaIdx
            const done = s.passed
            const late = !s.cancelled && s.actual && s.planned && s.actual !== s.planned
            return (
              <div key={`${s.name}-${i}`} data-component="TrainTimelineRow" className="timeline-row">
                <div className="plan" style={{ color: s.cancelled ? 'var(--pl-text-3)' : undefined, textDecoration: s.cancelled ? 'line-through' : undefined }}>{s.planned}</div>
                <div className="rail">
                  {!first && <i style={{ top: 0, height: 26, background: done || i === nextIdx ? 'var(--pl-accent)' : 'var(--pl-hair)', opacity: i === nextIdx ? 0.5 : 1 }} />}
                  {!last && <i style={{ top: 26, height: 26, background: done && d.stops[i + 1]?.passed ? 'var(--pl-accent)' : 'var(--pl-hair)' }} />}
                  <b
                    style={
                      isParma
                        ? { left: 0, top: 15, width: 22, height: 22, background: 'var(--pl-accent)', borderColor: 'var(--pl-surface)' }
                        : { left: 4, top: 19, width: 14, height: 14, background: done ? 'var(--pl-accent)' : 'var(--pl-surface)', borderColor: s.cancelled ? 'var(--pl-cancel)' : done ? 'var(--pl-accent)' : last ? 'var(--pl-text)' : 'var(--pl-text-3)' }
                    }
                  />
                  {/* Treno tra l'ultima fermata rilevata e la successiva. */}
                  {i === nextIdx && i > 0 && !cancelled && !d.partial && (
                    <div aria-label="Posizione del treno" style={{ position: 'absolute', left: -4, top: -15, width: 30, height: 30, borderRadius: '50%', background: 'var(--pl-accent)', border: '3px solid var(--pl-surface)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pl-on-accent)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="14" rx="4" /><path d="M5 11h14M8.5 21l2-4M15.5 21l-2-4" /></svg>
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="name" style={{ fontWeight: isParma || last ? 700 : 400, color: s.cancelled ? 'var(--pl-text-2)' : undefined }}>{titleCase(s.name)}</div>
                  {isParma && (s.platform.actual ?? s.platform.planned) && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--pl-accent)' }}>Parma · binario {s.platform.actual ?? s.platform.planned}</div>}
                  {s.cancelled && <div className="cancel" style={{ fontSize: 12, fontWeight: 600 }}>Fermata soppressa</div>}
                </div>
                <div className={`est ${late ? 'late' : ''}`} style={{ color: done ? 'var(--pl-text-2)' : undefined }}>{s.cancelled ? '' : s.actual}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Prossimi bus TEP (live) dalla posizione attuale alla stazione, con lo stesso planner di Cerca. */
function BusToStationCard() {
  const geo = useUi((s) => s.geo)
  const data = useStatic((s) => s.data)
  const now = useNow(15_000)
  const [journeys, setJourneys] = useState<Journey[] | null>(null)
  const here = hereOf(geo)
  const hereKey = here ? `${here.lat.toFixed(3)},${here.lon.toFixed(3)}` : null // si ricalcola spostandosi di ~100 m
  useEffect(() => {
    if (!here) return
    let alive = true
    planTrip(here, STATION, 2)
      .then((r) => alive && setJourneys(r.journeys))
      .catch(() => alive && setJourneys([]))
    return () => void (alive = false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hereKey riassume here
  }, [hereKey, now])
  const kx = 111_320 * Math.cos((STATION.lat * Math.PI) / 180)
  const nearStation = here && Math.hypot((here.lon - STATION.lon) * kx, (here.lat - STATION.lat) * 110_540) < 400
  // Risultati sopra i Treni: ← torna qui (UX-AUDIT.md §4).
  const canOpen = !!here && !nearStation
  const open = () => here && useUi.getState().startPlan(here, STATION)
  return (
    <div
      data-component="BusToStationCard"
      className={`card ${canOpen ? 'pressable' : ''}`}
      style={{ padding: '12px 8px 12px 16px' }}
      {...(canOpen && {
        role: 'button',
        tabIndex: 0,
        onClick: open,
        onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()),
      })}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Bus per la Stazione FS</div>
        {canOpen && <span style={{ color: 'var(--pl-text-3)', paddingRight: 8 }}><ChevronIcon /></span>}
      </div>
      {!here && <div className="subtle" style={{ fontSize: 14, marginTop: 4 }}>Attiva la posizione per vedere i bus da dove sei.</div>}
      {nearStation && <div className="subtle" style={{ fontSize: 14, marginTop: 4 }}>Sei già vicino alla stazione.</div>}
      {here && !nearStation && !journeys && <Skeleton rows={1} height={46} avatar={30} label="Calcolo i bus per la stazione" slow="Il calcolo non arriva: gli orari dei bus non sono ancora scaricati." />}
      {here && !nearStation && journeys?.length === 0 && <div className="subtle" style={{ fontSize: 14, marginTop: 4 }}>Nessun bus utile nelle prossime ore: meglio a piedi.</div>}
      {!nearStation &&
        journeys?.map((j) => {
          const [first] = rides(j)
          return (
            <div key={j.signature} className="fav-row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
              <div style={{ display: 'flex', gap: 4 }}>{rides(j).map((r, i) => <LineBadge key={i} route={data?.routes.get(r.routeId)} size={30} />)}</div>
              <div style={{ minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                da {data?.stops.get(first!.fromStop)?.name} · arrivo {fmtTime(j.arrive)}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3, height: 24, overflow: 'hidden', color: first!.live ? 'var(--pl-text)' : 'var(--pl-text-2)' }}>
                <Countdown seconds={Math.max(0, (first!.depart - now) / 1000)} size={20} live={first!.live} />
                {first!.live && <LiveIcon size={10} />}
              </div>
            </div>
          )
        })}
    </div>
  )
}
