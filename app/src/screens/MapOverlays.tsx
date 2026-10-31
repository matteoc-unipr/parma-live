// Overlay della tab Mappa (chip, indicatore LIVE, posizione, attribuzione). Separati dalla mappa:
// stanno nel bundle principale e compaiono subito, mentre MapLibre (~300 KB gzip) arriva in un pezzo a parte.
import { useMemo } from 'react'
import { feedStatus, useRealtime } from '../data/realtime'
import { useStatic } from '../data/static'
import { useNow } from '../lib/hooks'
import { useUi } from '../store'
import { fmtTime, LineBadge } from '../ui/bits'
import { InfoIcon, LocateIcon, MoonIcon } from '../ui/icons'

export function MapOverlays() {
  const now = useNow(1000)
  const rt = useRealtime()
  const status = feedStatus(rt, now)
  const data = useStatic((s) => s.data)
  const { filter, toggleLine, clearFilter, geo, sheet } = useUi()

  const lines = useMemo(() => {
    const ids = [...new Set(rt.buses.map((b) => b.routeId))]
    const short = (id: string) => data?.routes.get(id)?.short ?? id
    return ids.sort((a, b) => (parseInt(short(a)) || 999) - (parseInt(short(b)) || 999) || short(a).localeCompare(short(b)))
  }, [rt.buses, data])

  const age = rt.feedAt ? Math.max(0, Math.round((now - rt.feedAt) / 1000)) : 0
  const indicator = {
    loading: { tag: 'CARICAMENTO', color: 'var(--pl-text-2)', dot: 'var(--pl-text-3)', label: '· posizioni dei bus…' },
    night: { tag: 'NOTTE', color: 'var(--pl-text-2)', dot: 'var(--pl-text-3)', label: '· nessun bus in servizio' },
    offline: { tag: 'OFFLINE', color: 'var(--pl-text-2)', dot: 'var(--pl-text-3)', label: `· ultimo dato alle ${rt.syncAt ? fmtTime(rt.syncAt) : '–'}` },
    stale: { tag: 'DATO VECCHIO', color: 'var(--pl-late)', dot: 'var(--pl-late)', label: `· aggiornato ${age} s fa` },
    live: { tag: 'LIVE', color: 'var(--pl-ok)', dot: 'var(--pl-ok)', label: `· aggiornato ${age} s fa · ${rt.buses.length} bus` },
  }[status]

  const denied = geo.status === 'denied'
  return (
    <>
      <div className="map-top">
        {status === 'loading' ? (
          <div data-component="Skeleton" className="chips" style={{ animation: 'plSkel 1.3s ease-in-out infinite' }}>
            {[80, 44, 44, 44, 44, 44, 44].map((w, i) => (
              <div key={i} className="chip glass" style={{ width: w }} />
            ))}
          </div>
        ) : (
          <div className="chips" role="toolbar" aria-label="Filtra linee">
            <button data-component="LineFilterChip" className={`chip all glass ${filter.length ? '' : 'on'}`} onClick={clearFilter}>
              Tutte
            </button>
            {lines.map((id) => {
              const route = data?.routes.get(id)
              const on = filter.includes(id)
              return (
                <button key={id} data-component="LineFilterChip" className="chip line glass" aria-pressed={on} aria-label={`Linea ${route?.short ?? id}`} onClick={() => toggleLine(id)}>
                  <LineBadge route={route} size={32} style={{ opacity: filter.length && !on ? 0.45 : 1 }} />
                </button>
              )
            })}
          </div>
        )}
        <div data-component="LiveIndicator" className="live-indicator glass" role="status">
          <span className={`dot ${status === 'live' ? 'pulse' : ''}`} style={{ background: indicator.dot }} />
          <span className="tag" style={{ color: indicator.color }}>{indicator.tag}</span>
          <span className="label">{indicator.label}</span>
        </div>
      </div>
      <button data-component="IconButton" className="icon-btn glass map-info" aria-label="Info" onClick={() => useUi.setState({ info: true })}>
        <InfoIcon />
      </button>
      {!sheet && (
        <>
          <button data-component="MapAttribution" className="map-attribution" onClick={() => useUi.setState({ info: true })}>
            © OpenFreeMap © OpenStreetMap contributors
          </button>
          <button
            data-component="LocateButton"
            className={`locate-btn glass ${denied ? 'denied' : ''}`}
            aria-label="Centra su di me"
            onClick={() =>
              denied
                ? useUi.getState().showToast('Posizione non disponibile', 'Attiva la posizione in Impostazioni › Privacy › Localizzazione per vedere dove sei.')
                : useUi.setState((s) => ({ locateTick: s.locateTick + 1 }))
            }
          >
            <LocateIcon denied={denied} cutColor="var(--pl-glass-strong)" />
          </button>
        </>
      )}
      {status === 'night' && !sheet && (
        <div data-component="EmptyState" className="night-card glass">
          <div className="empty-icon" style={{ width: 48, height: 48 }}><MoonIcon size={22} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Nessun bus in servizio</div>
            <div style={{ fontSize: 14, lineHeight: '19px', color: 'var(--pl-text-2)', marginTop: 2 }}>
              Il servizio urbano riprende al mattino. Tocca una fermata per le prime corse.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
