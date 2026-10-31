// Overlay della tab Mappa (barra di ricerca, LIVE, filtro linee, posizione, attribuzione). Separati dalla mappa:
// stanno nel bundle principale e compaiono subito, mentre MapLibre (~300 KB gzip) arriva in un pezzo a parte.
import { useMemo, useState } from 'react'
import { feedStatus, useRealtime } from '../data/realtime'
import { useStatic } from '../data/static'
import { useNow } from '../lib/hooks'
import { useUi } from '../store'
import { fmtTime, LineBadge } from '../ui/bits'
import { InfoIcon, LocateIcon, MoonIcon, SearchIcon } from '../ui/icons'

export function MapOverlays() {
  const now = useNow(1000)
  const rt = useRealtime()
  const status = feedStatus(rt, now)
  const data = useStatic((s) => s.data)
  const { filter, toggleLine, clearFilter, geo, sheet, zoomedOut } = useUi()
  const [linesOpen, setLinesOpen] = useState(false)

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
    live: { tag: 'LIVE', color: 'var(--pl-ok)', dot: 'var(--pl-ok)', label: `· ${age} s fa · ${rt.buses.length} bus` },
  }[status]

  const denied = geo.status === 'denied'
  const lineName = (id: string) => data?.routes.get(id)?.short ?? id
  return (
    <>
      <div className="map-top">
        <button data-component="MapSearchBar" className="search-bar glass" onClick={() => useUi.setState({ searching: 'map' })}>
          <SearchIcon size={20} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Fermata, linea o indirizzo</span>
        </button>
        <div className="map-row">
          <div data-component="LiveIndicator" className="live-indicator glass" role="status">
            <span className={`dot ${status === 'live' ? 'pulse' : ''}`} style={{ background: indicator.dot }} />
            <span className="tag" style={{ color: indicator.color }}>{indicator.tag}</span>
            <span className="label">{indicator.label}</span>
          </div>
          {lines.length > 0 && (
            <button
              data-component="LineFilterButton"
              className={`lines-btn glass ${filter.length ? 'on' : ''}`}
              aria-expanded={linesOpen}
              aria-label={filter.length ? `Linee: ${filter.map(lineName).join(', ')}` : 'Filtra le linee'}
              onClick={() => setLinesOpen((o) => !o)}
            >
              {filter.length ? `Linee · ${filter.length}` : 'Linee'}
            </button>
          )}
        </div>
        {linesOpen && lines.length > 0 && (
          <div data-component="LineFilterPanel" className="lines-panel glass" role="group" aria-label="Linee da mostrare">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="subtle" style={{ fontSize: 15 }}>{filter.length ? `${filter.length} di ${lines.length} linee` : `Tutte le ${lines.length} linee in servizio`}</span>
              {filter.length > 0 && (
                <button className="text-btn" onClick={clearFilter}>
                  Mostra tutte
                </button>
              )}
            </div>
            <div className="lines-grid">
              {lines.map((id) => {
                const route = data?.routes.get(id)
                const on = filter.includes(id)
                return (
                  <button key={id} data-component="LineFilterChip" aria-pressed={on} aria-label={`Linea ${route?.short ?? id}`} onClick={() => toggleLine(id)}>
                    <LineBadge route={route} size={32} style={{ opacity: filter.length && !on ? 0.45 : 1 }} />
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {!sheet && (
        <>
          {/* Attribuzioni (OSM/ODbL, BusOne) compatte: l'icona apre Info, dove sono per esteso. */}
          <button data-component="MapAttribution" className="map-attribution icon-btn glass" aria-label="Fonti dei dati: BusOne e TEP, OpenFreeMap, OpenStreetMap" onClick={() => useUi.setState({ info: true })}>
            <InfoIcon />
          </button>
          <button
            data-component="LocateButton"
            className={`locate-btn glass ${denied ? 'denied' : ''}`}
            aria-label="Centra su di me"
            onClick={() =>
              denied
                ? useUi.getState().showToast('Posizione non disponibile', 'Attiva la posizione in Impostazioni › Privacy › Localizzazione per vedere dove sei.', { icon: 'location' })
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
              Il servizio urbano riprende al mattino. Cerca una fermata per le prime corse.
            </div>
          </div>
        </div>
      )}
      {zoomedOut && status !== 'night' && !sheet && (
        <div data-component="ZoomHint" className="zoom-hint" role="status">
          Avvicina per vedere le fermate
        </div>
      )}
    </>
  )
}
