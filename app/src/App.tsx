import { useEffect } from 'react'
import { feedStatus, startRealtime, useRealtime } from './data/realtime'
import { loadStatic, useStatic } from './data/static'
import { useNow } from './lib/hooks'
import { useUi, type Tab } from './store'
import { MapScreen } from './screens/MapScreen'
import { FavoritesScreen, InfoScreen, SearchScreen } from './screens/OtherScreens'
import { MapSheet } from './screens/Sheets'
import { TrainsScreen } from './screens/TrainsScreen'
import { fmtTime, Toast } from './ui/bits'
import { MapIcon, SearchIcon, StarIcon, TrainIcon } from './ui/icons'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'map', label: 'Mappa', icon: <MapIcon /> },
  { id: 'search', label: 'Cerca', icon: <SearchIcon /> },
  { id: 'train', label: 'Treni', icon: <TrainIcon /> },
  { id: 'fav', label: 'Preferiti', icon: <StarIcon /> },
]

export function App() {
  const { tab, sheet, info, setTab } = useUi()
  const staticError = useStatic((s) => s.error)

  useEffect(() => {
    void loadStatic()
    return startRealtime()
  }, [])

  return (
    <>
      {/* La mappa resta montata: le altre schermate hanno uno sfondo pieno e la coprono. */}
      <MapScreen />
      {tab === 'map' && <MapSheet />}
      {tab === 'search' && <SearchScreen />}
      {tab === 'train' && <TrainsScreen />}
      {tab === 'fav' && <FavoritesScreen />}
      {info && <InfoScreen />}
      {tab !== 'map' && <FeedBanner />}
      {staticError && (
        <div data-component="StatusBanner" className="status-pill glass cancel" style={{ bottom: 'auto', top: 'calc(var(--safe-top) + 120px)' }}>
          <i />
          Orari non disponibili
        </div>
      )}
      <Toast />
      {!sheet && !info && (
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
      <div data-component="StatusBanner" className="status-pill glass subtle">
        <i />
        Offline · dati delle {rt.syncAt ? fmtTime(rt.syncAt) : '–'}
      </div>
    )
  if (status === 'stale')
    return (
      <div data-component="StatusBanner" className="status-pill glass late">
        <i />
        Dati non aggiornati · {Math.round((now - (rt.feedAt ?? now)) / 1000)} s fa
      </div>
    )
  return null
}
