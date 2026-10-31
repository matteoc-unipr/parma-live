// Tabellone di una fermata e tragitti diretti: orari programmati (GTFS) uniti alle stime (GTFS-RT).

/** Inizio del giorno di servizio GTFS ("mezzogiorno − 12 h"), in ms epoch, nel fuso del dispositivo.
 *  shortcut: assume il dispositivo in Europe/Rome; se serve altrove, calcolare con Intl e timeZone. */
export function serviceDayStart(date: string): number {
  return new Date(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), 12).getTime() - 12 * 3600_000
}

/** [secondi dall'inizio del giorno di servizio, trip_id, pattern_id, 1 se si può solo scendere] */
export type Departure = [number, string, string] | [number, string, string, 1]
export type StopTimes = Record<string, Departure[]>

export type StopRel = 'SCHEDULED' | 'SKIPPED' | 'NO_DATA'
export type StopUpdate = { stopId: string; seq: number; time: number | null; delay: number | null; rel: StopRel }
/** startDate: giorno di servizio della corsa (YYYYMMDD); lo stesso trip_id si ripete in più giorni. */
export type TripUpdate = { tripId: string; startDate: string; canceled: boolean; stops: StopUpdate[] }

export type StopStatus =
  | { kind: 'live'; eta: number; delaySec: number | null }
  | { kind: 'scheduled' | 'cancelled' | 'skipped' | 'passed' }

/** Cosa dice il realtime di una corsa (di un dato giorno di servizio) a una fermata. */
export function stopStatus(tu: TripUpdate | undefined, date: string, stopId: string): StopStatus {
  if (!tu || tu.startDate !== date) return { kind: 'scheduled' }
  if (tu.canceled) return { kind: 'cancelled' }
  const stu = tu.stops.find((s) => s.stopId === stopId)
  if (stu?.rel === 'SKIPPED') return { kind: 'skipped' }
  if (stu?.time) return { kind: 'live', eta: stu.time * 1000, delaySec: stu.delay }
  // NO_DATA o fermata assente: prima della prima stima = già passata, dopo = nessuna stima (vale l'orario).
  const firstLive = Math.min(...tu.stops.filter((s) => s.time).map((s) => s.seq))
  if (!Number.isFinite(firstLive)) return { kind: 'scheduled' }
  // BusOne elenca tutte le fermate; il feed TEP solo le future: in entrambi i casi un'assenza è un passaggio già avvenuto.
  if (!stu || stu.seq < firstLive) return { kind: 'passed' }
  return { kind: 'scheduled' }
}

export type BoardRow = {
  tripId: string
  patternId: string
  /** ms epoch programmati */
  scheduled: number
  /** ms epoch stimati (solo live) */
  eta: number | null
  delaySec: number | null
  source: 'live' | 'scheduled' | 'cancelled' | 'skipped'
}

const WINDOW_MS = 90 * 60_000

export function buildBoard(stopId: string, times: StopTimes, updates: Map<string, TripUpdate>, now: number, limit = 12) {
  const live: BoardRow[] = []
  const others: BoardRow[] = []
  const upcoming: BoardRow[] = []
  for (const [date, deps] of Object.entries(times)) {
    const base = serviceDayStart(date)
    for (const [sec, tripId, patternId, alightOnly] of deps) {
      if (alightOnly) continue // qui si scende soltanto: non è una partenza
      const at = base + sec * 1000
      const st = stopStatus(updates.get(tripId), date, stopId)
      if (st.kind === 'passed') continue
      if (st.kind === 'live') {
        if (st.eta >= now - 30_000 && st.eta <= now + WINDOW_MS)
          live.push({ tripId, patternId, scheduled: at, eta: st.eta, delaySec: st.delaySec, source: 'live' })
        continue
      }
      const row: BoardRow = { tripId, patternId, scheduled: at, eta: null, delaySec: null, source: st.kind }
      if (at >= now - 60_000 && at <= now + WINDOW_MS) others.push(row)
      else if (at > now && st.kind === 'scheduled') upcoming.push(row)
    }
  }
  live.sort((a, b) => a.eta! - b.eta!)
  others.sort((a, b) => a.scheduled - b.scheduled)
  const rows = [...live, ...others].slice(0, limit)
  // Di notte: solo le prime corse del mattino, programmate.
  if (!rows.length) return { rows: upcoming.sort((a, b) => a.scheduled - b.scheduled).slice(0, 6), night: true }
  return { rows, night: false }
}
