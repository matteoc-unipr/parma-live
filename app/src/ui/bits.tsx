import { useEffect, useState, type CSSProperties } from 'react'
import { lineColor, lineLabel, lineTextColor, type Route } from '../data/static'
import { useUi } from '../store'
import { AlertIcon, BackIcon, CloseIcon, LocateIcon, StarIcon } from './icons'

// LineBadge: taglie 26/30/32/40/54 → font 12/13/13/16/24.
const FONT: Record<number, number> = { 26: 12, 28: 13, 30: 13, 32: 13, 36: 15, 40: 16, 54: 24 }
export function LineBadge({ route, size, style }: { route: Route | undefined; size: number; style?: CSSProperties }) {
  const label = lineLabel(route)
  const fs = (FONT[size] ?? 13) - (label.length > 2 ? 3 : 0)
  return (
    <div
      data-component="LineBadge"
      className="line-badge"
      style={{ width: size, height: size, background: lineColor(route), color: lineTextColor(route), fontSize: fs, fontWeight: size >= 54 ? 800 : 700, ...style }}
    >
      {label}
    </div>
  )
}

/** Minuti al passaggio; sotto 60 s "in arrivo". La key = valore rianima l'ingresso a ogni cambio.
 *  Il verde di "in arrivo" è riservato al dato live: un orario programmato resta neutro. */
export function Countdown({ seconds, size = 24, color, live = true }: { seconds: number; size?: number; color?: string; live?: boolean }) {
  const min = Math.floor(seconds / 60)
  const arriving = min < 1
  const text = arriving ? 'in arrivo' : String(min)
  return (
    <span key={text} data-component="Countdown" className="countdown" style={{ color: arriving && live ? 'var(--pl-ok)' : color }}>
      <b style={{ fontSize: arriving ? Math.round(size * 0.7) : size }}>{text}</b>
      {!arriving && <span style={{ fontSize: Math.max(12, Math.round(size * 0.55)) }}>min</span>}
    </span>
  )
}

const SLOW_MS = 10_000 // DESIGN.md §5: dopo 10 s senza dati lo skeleton lascia il posto a un messaggio

/** Righe segnaposto. `label`: cosa si sta caricando (lettori di schermo); `slow`: cosa dire se dopo 10 s non è arrivato. */
export function Skeleton({ rows, height = 62, avatar = 40, label, slow }: { rows: number; height?: number; avatar?: number; label: string; slow: string }) {
  const [late, setLate] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLate(true), SLOW_MS)
    return () => clearTimeout(t)
  }, [])
  if (late)
    return (
      <div data-component="SlowState" role="status" className="subtle" style={{ fontSize: 15, lineHeight: '20px', padding: '12px 0' }}>
        {slow}
      </div>
    )
  return (
    <div data-component="Skeleton" className="skeleton" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row" style={{ height, gridTemplateColumns: `${avatar}px minmax(0,1fr) 48px` }}>
          <div className="bar" style={{ width: avatar, height: avatar, borderRadius: avatar > 30 ? '50%' : 10 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div className="bar" style={{ width: `${58 + ((i * 23) % 30)}%`, height: 13 }} />
            <div className="bar" style={{ width: `${32 + ((i * 17) % 25)}%`, height: 10 }} />
          </div>
          <div className="bar" style={{ width: 48, height: 18 }} />
        </div>
      ))}
    </div>
  )
}

export function StarButton({ active, onToggle, fill = true }: { active: boolean; onToggle: () => void; fill?: boolean }) {
  const [pop, setPop] = useState(0)
  return (
    <button
      data-component="StarButton"
      className={`icon-btn star-btn ${fill ? 'fill' : ''} ${pop ? 'pop' : ''}`}
      key={pop}
      style={{ color: active ? 'var(--pl-star)' : 'var(--pl-text)' }}
      aria-label={active ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation()
        setPop((n) => n + 1)
        onToggle()
      }}
    >
      <StarIcon size={20} filled={active} />
    </button>
  )
}

export const CloseButton = ({ onClick, label = 'Chiudi' }: { onClick: () => void; label?: string }) => (
  <button data-component="CloseButton" className="icon-btn fill" aria-label={label} onClick={onClick}>
    <CloseIcon />
  </button>
)

export const BackButton = ({ onClick }: { onClick: () => void }) => (
  <button data-component="BackButton" className="icon-btn fill" aria-label="Indietro" onClick={onClick}>
    <BackIcon />
  </button>
)

/** Errore con cosa è successo, cosa fare e (se serve) l'azione primaria "Riprova". */
export function ErrorState({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div data-component="ErrorState" role="alert" className="error-state">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span className="cancel" style={{ flex: 'none', marginTop: 1 }}><AlertIcon /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: 'var(--pl-type-headline)' }}>{title}</div>
          <div className="subtle" style={{ fontSize: 15, lineHeight: '20px', marginTop: 2 }}>{body}</div>
        </div>
      </div>
      {onRetry && (
        <button className="btn-primary" onClick={onRetry}>
          Riprova
        </button>
      )}
    </div>
  )
}

export function Toast() {
  const toast = useUi((s) => s.toast)
  if (!toast) return null
  return (
    <div data-component="Toast" className="toast glass" role="status">
      {toast.icon === 'location' && (
        <div className="empty-icon" style={{ background: 'var(--pl-late-soft)', color: 'var(--pl-late)' }}>
          <LocateIcon size={18} denied cutColor="var(--pl-late-soft)" />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{toast.title}</div>
        <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--pl-text-2)' }}>{toast.body}</div>
      </div>
      {toast.action && (
        <button
          className="text-btn"
          onClick={() => {
            toast.action!.run()
            useUi.setState({ toast: null })
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="icon-btn" aria-label="Chiudi" style={{ color: 'var(--pl-text-2)' }} onClick={() => useUi.setState({ toast: null })}>
        <CloseIcon size={14} />
      </button>
    </div>
  )
}

export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
