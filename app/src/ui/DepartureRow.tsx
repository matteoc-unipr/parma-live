// DepartureRow (design): live = countdown + onde; programmato = ora grigia + orologio;
// soppressa / fermata saltata = ora barrata in --pl-cancel, destinazione grigia.
import type { Route } from '../data/static'
import type { BoardRow } from '../lib/board'
import { Countdown, fmtTime, LineBadge } from './bits'
import { ClockIcon, LiveIcon } from './icons'

type Props = {
  row: BoardRow
  route: Route | undefined
  destination: string
  /** "via …" quando non c'è altro da dire */
  via?: string
  now: number
  compact?: boolean
  onClick?: () => void
}

export function DepartureRow({ row, route, destination, via, now, compact, onClick }: Props) {
  const live = row.source === 'live'
  const dead = row.source === 'cancelled' || row.source === 'skipped'
  const late = live && (row.delaySec ?? 0) >= 60
  const sub = dead
    ? row.source === 'cancelled'
      ? 'Corsa soppressa'
      : 'Non ferma a questa fermata'
    : late
      ? `+${Math.round(row.delaySec! / 60)} min`
      : via
  const label = `${route?.short ?? ''} ${destination}, ${
    live ? `tra ${Math.max(0, Math.floor((row.eta! - now) / 60_000))} minuti, tempo reale` : `${sub ?? 'programmato'} alle ${fmtTime(row.scheduled)}`
  }`
  return (
    <button
      data-component="DepartureRow"
      className={`departure-row ${compact ? 'compact' : ''}`}
      onClick={onClick}
      aria-label={label}
      disabled={!onClick}
    >
      <LineBadge route={route} size={compact ? 30 : 40} />
      <div style={{ minWidth: 0 }}>
        <div className="dest" style={{ color: dead ? 'var(--pl-text-2)' : undefined, fontWeight: compact ? 500 : undefined, fontSize: compact ? 16 : undefined }}>
          {destination}
        </div>
        {sub && !compact && <div className={`sub ${late ? 'late' : ''} ${dead ? 'cancel' : ''}`}>{sub}</div>}
      </div>
      <div className="right">
        {live ? (
          <>
            <Countdown seconds={Math.max(0, (row.eta! - now) / 1000)} size={compact ? 20 : 24} />
            <LiveIcon size={compact ? 10 : 11} />
          </>
        ) : (
          <>
            <span className={`time ${dead ? 'strike cancel' : 'subtle'}`} style={{ fontSize: compact ? 17 : 20 }}>
              {fmtTime(row.scheduled)}
            </span>
            <span className={dead ? 'cancel' : 'subtle'}>
              <ClockIcon size={compact ? 12 : 13} />
            </span>
          </>
        )}
      </div>
    </button>
  )
}
