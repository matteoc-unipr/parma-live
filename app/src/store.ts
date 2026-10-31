import { create } from 'zustand'
import { runPlan } from './planner/state'

export type Tab = 'fav' | 'map' | 'train'
/** Sheet sulla mappa: tabellone fermata, bus, risultati A→B (search.from/to). */
export type Layer = { kind: 'bus'; id: string } | { kind: 'stop'; id: string } | { kind: 'plan' }
export type Sheet = Layer | null
/** Come entra lo sheet in cima: dal basso (aperto), da destra (push), già fermo (scoperto da un ←). */
export type Enter = 'up' | 'right' | 'none'
/** Overlay di ricerca: dalla barra della mappa, oppure per scegliere Da / A di un tragitto. */
export type Searching = 'map' | 'from' | 'to' | null
export type Detent = 'full' | 'half' | 'peek'
/** Un punto scelto in Cerca: la posizione attuale, una fermata (località) o un indirizzo (Photon). */
export type Place = { name: string; lat: number; lon: number; kind: 'here' | 'stop' | 'address'; detail?: string }
/** Tragitti: Place; le stringhe sono il formato precedente (nome di località), ancora letto. */
export type FavPlace = Place | string
export type Favorites = { stops: string[]; trips: { from: FavPlace; to: FavPlace }[] }
const placeKey = (p: FavPlace) => (typeof p === 'string' ? p : `${p.name}@${p.lat.toFixed(4)},${p.lon.toFixed(4)}`)
export const sameTrip = (t: { from: FavPlace; to: FavPlace }, from: FavPlace, to: FavPlace) =>
  placeKey(t.from) === placeKey(from) && placeKey(t.to) === placeKey(to)
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
  /** pila degli sheet sopra la tab corrente: fermata → bus → ← torna alla fermata */
  stack: Layer[]
  /** cima della pila (null = nessuno sheet) */
  sheet: Sheet
  enter: Enter
  /** sheet in uscita: verso il basso (✕) o verso destra (←), poi si toglie dalla pila */
  leaving: 'down' | 'right' | null
  searching: Searching
  detent: Detent
  filter: string[]
  favorites: Favorites
  info: boolean
  toast: Toast | null
  geo: GeoState
  /** Tragitto A→B mostrato dallo sheet 'plan'; selected = soluzione scelta */
  search: { from: Place | null; to: Place | null; selected: number }
  /** tema chiaro anche quando il sistema è scuro */
  lightAlways: boolean
  /** incrementato per chiedere alla mappa di centrarsi sull'utente */
  locateTick: number
  /** mappa sotto lo zoom delle fermate */
  zoomedOut: boolean
  setTab: (tab: Tab) => void
  /** apre uno sheet al posto della pila attuale; null chiude tutto */
  openSheet: (sheet: Sheet) => void
  /** apre uno sheet sopra quello attuale (← ci torna) */
  pushSheet: (sheet: Layer) => void
  back: () => void
  /** tragitto A→B: senza partenza (né posizione) chiede prima Da */
  startPlan: (from: Place | null, to: Place, push?: boolean) => void
  toggleLine: (routeId: string) => void
  clearFilter: () => void
  toggleFavStop: (stopId: string) => void
  toggleFavTrip: (from: FavPlace, to: FavPlace) => void
  setSearch: (search: Partial<Ui['search']>) => void
  setLightAlways: (on: boolean) => void
  showToast: (title: string, body: string, opts?: Pick<Toast, 'action' | 'icon'>) => void
  setFavorites: (favorites: Favorites) => void
}
export type Toast = { title: string; body: string; action?: { label: string; run: () => void }; icon?: 'location' }

export const hereOf = (geo: GeoState): Place | null =>
  geo.status === 'ok' ? { kind: 'here', name: 'Posizione attuale', lat: geo.lat!, lon: geo.lon! } : null
const SHEET_OUT_MS = 250 // DESIGN.md §5: l'uscita (✕) è più veloce dell'entrata
const SHEET_POP_MS = 300 // ←: lo sheet esce verso destra
let leaveTimer: ReturnType<typeof setTimeout> | undefined

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

const initialFavs = readFavs()

export const useUi = create<Ui>((set, get) => ({
  // Avvio sui Preferiti se ce n'è almeno uno (UX-AUDIT.md §4).
  tab: initialFavs.stops.length + initialFavs.trips.length ? 'fav' : 'map',
  stack: [],
  sheet: null,
  enter: 'up',
  leaving: null,
  searching: null,
  detent: 'half',
  filter: [],
  favorites: initialFavs,
  info: false,
  toast: null,
  geo: { status: 'unknown' },
  search: { from: null, to: null, selected: 0 },
  lightAlways: readLightAlways(),
  locateTick: 0,
  zoomedOut: false,
  setTab: (tab) => {
    clearTimeout(leaveTimer)
    set({ tab, stack: [], sheet: null, leaving: null, searching: null })
  },
  openSheet: (sheet) => {
    clearTimeout(leaveTimer)
    if (sheet) return set({ stack: [sheet], sheet, enter: 'up', leaving: null, detent: 'half' })
    if (!get().sheet) return
    set({ leaving: 'down' })
    leaveTimer = setTimeout(() => set({ stack: [], sheet: null, leaving: null }), SHEET_OUT_MS)
  },
  pushSheet: (sheet) => {
    clearTimeout(leaveTimer)
    const stack = [...get().stack, sheet]
    set({ stack, sheet, enter: 'right', leaving: null })
  },
  back: () => {
    const { stack } = get()
    if (stack.length <= 1) return get().openSheet(null)
    clearTimeout(leaveTimer)
    set({ leaving: 'right' })
    leaveTimer = setTimeout(() => {
      const rest = get().stack.slice(0, -1)
      set({ stack: rest, sheet: rest.at(-1) ?? null, enter: 'none', leaving: null })
    }, SHEET_POP_MS)
  },
  startPlan: (from, to, push = false) => {
    const f = from ?? hereOf(get().geo)
    if (!f) return set((s) => ({ search: { ...s.search, from: null, to, selected: 0 }, searching: 'from' }))
    set({ search: { from: f, to, selected: 0 }, searching: null })
    if (get().sheet?.kind !== 'plan') (push ? get().pushSheet : get().openSheet)({ kind: 'plan' })
    void runPlan(f, to)
  },
  toggleLine: (id) => set(({ filter }) => ({ filter: filter.includes(id) ? filter.filter((x) => x !== id) : [...filter, id] })),
  clearFilter: () => set({ filter: [] }),
  toggleFavStop: (id) => {
    const { favorites } = get()
    const stops = favorites.stops.includes(id) ? favorites.stops.filter((x) => x !== id) : [...favorites.stops, id]
    saveFavs(set, { ...favorites, stops })
  },
  toggleFavTrip: (from, to) => {
    const { favorites } = get()
    const has = favorites.trips.some((t) => sameTrip(t, from, to))
    const trips = has ? favorites.trips.filter((t) => !sameTrip(t, from, to)) : [...favorites.trips, { from, to }]
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
  showToast: (title, body, opts) => {
    clearTimeout(toastTimer)
    set({ toast: { title, body, ...opts } })
    toastTimer = setTimeout(() => set({ toast: null }), 5000)
  },
  setFavorites: (favorites) => saveFavs(set, favorites),
}))

applyTheme(useUi.getState().lightAlways) // prima del primo render: niente lampo di tema sbagliato
if (import.meta.env.DEV) Object.assign(window, { __ui: useUi }) // per gli script di prova
