import { lazy, Suspense, useEffect } from 'react'
import { feedStatus, startRealtime, useRealtime } from './data/realtime'
import { loadStatic, useStatic } from './data/static'
import { useNow } from './lib/hooks'
import { useUi, type Tab } from './store'
import { MapOverlays } from './screens/MapOverlays'

// MapLibre è la parte più pesante del JS: in un pezzo a parte, così l'interfaccia compare prima della mappa.
const MapScreen = lazy(() => import('./screens/MapScreen'))
import { FavoritesScreen, InfoScreen } from './screens/OtherScreens'
import { SearchOverlay } from './screens/Search'
import { MapSheet } from './screens/Sheets'
import { TrainsScreen } from './screens/TrainsScreen'
import { FpsMeter } from './dev/FpsMeter'
import { installPlanBench } from './dev/planBench'
import { ErrorState, fmtTime, Toast } from './ui/bits'
import { MapIcon, StarIcon, TrainIcon } from './ui/icons'

const SHOW_FPS = new URLSearchParams(location.search).has('fps')
if (SHOW_FPS) installPlanBench()

// UX-AUDIT.md §4: tre tab; la ricerca è la barra in cima alla mappa.
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'fav', label: 'Preferiti', icon: <StarIcon /> },
  { id: 'map', label: 'Mappa', icon: <MapIcon /> },
  { id: 'train', label: 'Treni', icon: <TrainIcon /> },
]

export function App() {
  const { tab, sheet, info, searching, detent, setTab } = useUi()
  const staticError = useStatic((s) => s.error)

  useEffect(() => {
    void loadStatic()
    return startRealtime()
  }, [])

  // Sheet e risultati si aprono sopra la tab corrente e ci tornano: la schermata resta montata, nascosta.
  const under = sheet ? 'under' : ''
  return (
    <>
      <main>
        {/* La mappa resta montata: le altre schermate hanno uno sfondo pieno e la coprono. */}
        <Suspense fallback={<div className="map" />}>
          <MapScreen />
        </Suspense>
        {tab === 'map' && sheet?.kind !== 'plan' && <MapOverlays />}
        <MapSheet />
        {tab === 'fav' && <FavoritesScreen className={under} />}
        {tab === 'train' && <TrainsScreen className={under} />}
        {searching && <SearchOverlay />}
        {info && <InfoScreen />}
        {tab !== 'map' && !sheet && !searching && <FeedBanner />}
        {staticError && (
          <div className="toast glass" style={{ bottom: 'auto', top: 'calc(var(--safe-top) + 64px)', zIndex: 10, padding: '4px 16px' }}>
            <ErrorState
              title="Orari dei bus non scaricati"
              body="Senza orari non posso mostrare fermate e passaggi. Controlla la connessione."
              onRetry={() => {
                useStatic.setState({ error: null })
                void loadStatic()
              }}
            />
          </div>
        )}
      </main>
      <Toast />
      {SHOW_FPS && <FpsMeter />}
      {!info && !searching && !(sheet && detent === 'full') && (
        <nav data-component="TabBar" className="tab-bar glass">
          {TABS.map((t) => (
            <button key={t.id} data-component="TabBarItem" className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  )
}

/** Fuori dalla mappa: pill sopra la tab bar se i dati sono offline o vecchi. */
function FeedBanner() {
  const now = useNow(1000)
  const rt = useRealtime()
  const status = feedStatus(rt, now)
  if (status === 'offline')
    return (
      <div data-component="StatusBanner" className="status-pill glass subtle" role="status">
        <i />
        Offline · dati delle {rt.syncAt ? fmtTime(rt.syncAt) : '–'}
      </div>
    )
  if (status === 'stale')
    return (
      <div data-component="StatusBanner" className="status-pill glass late" role="status">
        <i />
        Dati non aggiornati · {Math.round((now - (rt.feedAt ?? now)) / 1000)} s fa
      </div>
    )
  return null
}
