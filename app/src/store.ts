import { create } from 'zustand'

export type Tab = 'map' | 'search' | 'train' | 'fav'
export type Sheet = { kind: 'bus'; id: string } | { kind: 'stop'; id: string } | null
export type Detent = 'full' | 'half' | 'peek'
export type Favorites = { stops: string[]; trips: { from: string; to: string }[] }
export type GeoState = { status: 'unknown' | 'ok' | 'denied'; lat?: number; lon?: number }

const FAVS_KEY = 'parmaLive.favs.v1'
const readFavs = (): Favorites => {
  try {
    const v = JSON.parse(localStorage.getItem(FAVS_KEY) ?? '') as Favorites
    if (Array.isArray(v.stops) && Array.isArray(v.trips)) return v
  } catch {
    /* primo avvio o storage non disponibile */
  }
  return { stops: [], trips: [] }
}

type Ui = {
  tab: Tab
  sheet: Sheet
  detent: Detent
  filter: string[]
  favorites: Favorites
  info: boolean
  toast: { title: string; body: string } | null
  geo: GeoState
  /** Cerca: località di partenza e arrivo (nomi in data.places) */
  search: { from: string | null; to: string | null }
  /** tema chiaro anche quando il sistema è scuro */
  lightAlways: boolean
  /** incrementato per chiedere alla mappa di centrarsi sull'utente */
  locateTick: number
  setTab: (tab: Tab) => void
  openSheet: (sheet: Sheet) => void
  toggleLine: (routeId: string) => void
  clearFilter: () => void
  toggleFavStop: (stopId: string) => void
  toggleFavTrip: (from: string, to: string) => void
  setSearch: (search: Partial<Ui['search']>) => void
  setLightAlways: (on: boolean) => void
  showToast: (title: string, body: string) => void
}

function saveFavs(set: (p: Partial<Ui>) => void, favorites: Favorites) {
  try {
    localStorage.setItem(FAVS_KEY, JSON.stringify(favorites))
  } catch {
    /* storage pieno o bloccato: il preferito resta per la sessione */
  }
  set({ favorites })
}

const THEME_KEY = 'parmaLive.theme.v1'
const readLightAlways = () => {
  try {
    return localStorage.getItem(THEME_KEY) === 'light'
  } catch {
    return false
  }
}
// data-theme="light" fa vincere i token chiari anche con il sistema scuro (tokens.css).
const applyTheme = (lightAlways: boolean) => {
  if (lightAlways) document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUi = create<Ui>((set, get) => ({
  tab: 'map',
  sheet: null,
  detent: 'half',
  filter: [],
  favorites: readFavs(),
  info: false,
  toast: null,
  geo: { status: 'unknown' },
  search: { from: null, to: null },
  lightAlways: readLightAlways(),
  locateTick: 0,
  setTab: (tab) => set({ tab, sheet: null }),
  openSheet: (sheet) => set(sheet ? { sheet, tab: 'map', detent: 'half' } : { sheet }),
  toggleLine: (id) => set(({ filter }) => ({ filter: filter.includes(id) ? filter.filter((x) => x !== id) : [...filter, id] })),
  clearFilter: () => set({ filter: [] }),
  toggleFavStop: (id) => {
    const { favorites } = get()
    const stops = favorites.stops.includes(id) ? favorites.stops.filter((x) => x !== id) : [...favorites.stops, id]
    saveFavs(set, { ...favorites, stops })
  },
  toggleFavTrip: (from, to) => {
    const { favorites } = get()
    const has = favorites.trips.some((t) => t.from === from && t.to === to)
    const trips = has ? favorites.trips.filter((t) => t.from !== from || t.to !== to) : [...favorites.trips, { from, to }]
    saveFavs(set, { ...favorites, trips })
  },
  setSearch: (search) => set((s) => ({ search: { ...s.search, ...search } })),
  setLightAlways: (on) => {
    try {
      localStorage.setItem(THEME_KEY, on ? 'light' : 'auto')
    } catch {
      /* resta per la sessione */
    }
    applyTheme(on)
    set({ lightAlways: on })
  },
  showToast: (title, body) => {
    clearTimeout(toastTimer)
    set({ toast: { title, body } })
    toastTimer = setTimeout(() => set({ toast: null }), 5000)
  },
}))

applyTheme(useUi.getState().lightAlways) // prima del primo render: niente lampo di tema sbagliato
if (import.meta.env.DEV) Object.assign(window, { __ui: useUi }) // per gli script di prova
