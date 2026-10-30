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
  /** incrementato per chiedere alla mappa di centrarsi sull'utente */
  locateTick: number
  setTab: (tab: Tab) => void
  openSheet: (sheet: Sheet) => void
  toggleLine: (routeId: string) => void
  clearFilter: () => void
  toggleFavStop: (stopId: string) => void
  showToast: (title: string, body: string) => void
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
  locateTick: 0,
  setTab: (tab) => set({ tab, sheet: null }),
  openSheet: (sheet) => set(sheet ? { sheet, tab: 'map', detent: 'half' } : { sheet }),
  toggleLine: (id) => set(({ filter }) => ({ filter: filter.includes(id) ? filter.filter((x) => x !== id) : [...filter, id] })),
  clearFilter: () => set({ filter: [] }),
  toggleFavStop: (id) => {
    const { favorites } = get()
    const stops = favorites.stops.includes(id) ? favorites.stops.filter((x) => x !== id) : [...favorites.stops, id]
    const next = { ...favorites, stops }
    try {
      localStorage.setItem(FAVS_KEY, JSON.stringify(next))
    } catch {
      /* storage pieno o bloccato: il preferito resta per la sessione */
    }
    set({ favorites: next })
  },
  showToast: (title, body) => {
    clearTimeout(toastTimer)
    set({ toast: { title, body } })
    toastTimer = setTimeout(() => set({ toast: null }), 5000)
  },
}))
