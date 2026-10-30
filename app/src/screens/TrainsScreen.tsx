// Treni: tabellone RFI di Parma (partenze/arrivi) e dettaglio con le fermate successive.
import { useState } from 'react'
import { addMinutes, isCancelled, shortCategory, titleCase, useTrains, type Train, type TrainMode } from '../data/trains'
import { fmtTime, Skeleton } from '../ui/bits'
import { BackIcon, CancelIcon, LiveIcon } from '../ui/icons'

const status = (t: Train) =>
  isCancelled(t)
    ? { text: 'Cancellato', cls: 'cancel' }
    : t.delayMin
      ? { text: `+${t.delayMin} min`, cls: 'late' }
      : t.note
        ? { text: t.note, cls: 'late' }
        : { text: 'In orario', cls: 'ok' }

export function TrainsScreen() {
  const [mode, setMode] = useState<TrainMode>('partenze')
  const [detail, setDetail] = useState<Train | null>(null)
  const { trains, at, error } = useTrains(mode)

  if (detail) return <TrainDetail train={detail} mode={mode} onBack={() => setDetail(null)} />
  return (
    <div className="screen">
      <div style={{ padding: '0 4px' }}>
        <div className="large-title" style={{ padding: 0 }}>Parma</div>
        <div style={{ fontSize: 15, color: 'var(--pl-text-2)' }}>
          Stazione FS · {at ? `aggiornato alle ${fmtTime(at.getTime())}` : 'caricamento…'}
        </div>
      </div>
      <div data-component="SegmentedControl" className="segmented" role="tablist">
        <div className="thumb" style={{ transform: mode === 'arrivi' ? 'translateX(100%)' : 'none' }} />
        <button role="tab" aria-selected={mode === 'partenze'} className={mode === 'partenze' ? 'on' : ''} onClick={() => setMode('partenze')}>Partenze</button>
        <button role="tab" aria-selected={mode === 'arrivi'} className={mode === 'arrivi' ? 'on' : ''} onClick={() => setMode('arrivi')}>Arrivi</button>
      </div>
      {error && !trains && (
        <div data-component="StatusBanner" className="card" style={{ padding: '14px 16px', background: 'var(--pl-late-soft)', fontSize: 15 }}>
          Tabellone RFI non raggiungibile. Riprovo tra un minuto.
        </div>
      )}
      <div className="card" style={{ padding: '0 16px' }}>
        {!trains && !error && <Skeleton rows={7} height={64} avatar={44} />}
        {trains?.length === 0 && <div style={{ padding: '20px 0', color: 'var(--pl-text-2)' }}>Nessun treno nelle prossime ore.</div>}
        {trains?.map((t) => {
          const st = status(t)
          const cancelled = isCancelled(t)
          return (
            <button key={`${t.number}-${t.time}`} data-component="TrainRow" className="train-row" onClick={() => setDetail(t)}>
              <div className={`time ${cancelled ? 'strike subtle' : ''}`}>{t.time}</div>
              <div style={{ minWidth: 0 }}>
                <div className="dest" style={{ color: cancelled ? 'var(--pl-text-2)' : undefined }}>{titleCase(t.station)}</div>
                <div className="meta">
                  <span className="subtle">{shortCategory(t)} {t.number}</span>
                  <span style={{ color: 'var(--pl-text-3)' }}>·</span>
                  <span className={st.cls} style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.text}</span>
                </div>
              </div>
              <div className={`bin ${cancelled || !t.platform ? 'none' : ''}`} aria-label={`Binario ${t.platform ?? 'non indicato'}`}>
                <small>BIN</small>
                <b>{cancelled ? '–' : (t.platform ?? '–')}</b>
              </div>
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--pl-text-3)', padding: '0 4px' }}>Fonte: RFI · monitor arrivi e partenze</div>
    </div>
  )
}

function TrainDetail({ train: t, mode, onBack }: { train: Train; mode: TrainMode; onBack: () => void }) {
  const st = status(t)
  const cancelled = isCancelled(t)
  const delay = t.delayMin ?? 0
  const rows = mode === 'partenze' ? [{ name: 'PARMA', time: t.time, parma: true }, ...t.stops.map((s) => ({ ...s, parma: false }))] : []
  return (
    <div className="screen">
      <button data-component="BackButton" className="back-btn" onClick={onBack}>
        <BackIcon />
        {mode === 'partenze' ? 'Partenze' : 'Arrivi'}
      </button>
      <div style={{ padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="cat-pill">{shortCategory(t)}</span>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>{t.number}</span>
        </div>
        <div style={{ fontSize: 17, color: 'var(--pl-text-2)', marginTop: 2 }}>
          {mode === 'partenze' ? `Parma → ${titleCase(t.station)}` : `${titleCase(t.station)} → Parma`} · {titleCase(t.operator)}
        </div>
      </div>
      {cancelled && (
        <div data-component="StatusBanner" style={{ background: 'var(--pl-cancel-soft)', borderRadius: 24, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="cancel"><CancelIcon /></span>
          <span style={{ fontSize: 17, fontWeight: 700 }} className="cancel">Treno cancellato</span>
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
            {cancelled ? '–' : (t.platform ?? '–')}{' '}
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--pl-text-2)' }}>{delay ? addMinutes(t.time, delay) : t.time}</span>
          </div>
        </div>
        <div className="foot">
          <span className={t.atPlatform ? 'ok' : 'subtle'}><LiveIcon size={12} /></span>
          <span className="subtle">{t.atPlatform ? 'In stazione' : 'Orario a Parma'}</span>
          <span style={{ fontWeight: 600 }}>{t.time}{delay ? ` → ${addMinutes(t.time, delay)}` : ''}</span>
        </div>
      </div>
      {t.info && <div className="card" style={{ padding: '12px 16px', fontSize: 15 }}>{t.info}</div>}
      {rows.length > 1 && (
        <div className="card" style={{ padding: '6px 16px' }}>
          {rows.map((s, i) => {
            const first = i === 0
            const last = i === rows.length - 1
            return (
              <div key={`${s.name}-${i}`} data-component="TrainTimelineRow" className="timeline-row">
                <div className="plan" style={{ color: cancelled ? 'var(--pl-text-3)' : undefined, textDecoration: cancelled ? 'line-through' : undefined }}>{s.time}</div>
                <div className="rail">
                  {!first && <i style={{ top: 0, height: 26, background: 'var(--pl-hair)' }} />}
                  {!last && <i style={{ top: 26, height: 26, background: 'var(--pl-hair)' }} />}
                  <b
                    style={
                      s.parma
                        ? { left: 0, top: 15, width: 22, height: 22, background: 'var(--pl-accent)', borderColor: 'var(--pl-surface)' }
                        : { left: 4, top: 19, width: 14, height: 14, background: 'var(--pl-surface)', borderColor: last ? 'var(--pl-text)' : 'var(--pl-text-3)' }
                    }
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="name" style={{ fontWeight: s.parma || last ? 700 : 400 }}>{titleCase(s.name)}</div>
                  {s.parma && t.platform && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--pl-accent)' }}>Parma · binario {t.platform}</div>}
                </div>
                <div className={`est ${delay ? 'late' : ''}`}>{!cancelled && delay ? addMinutes(s.time, delay) : ''}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

