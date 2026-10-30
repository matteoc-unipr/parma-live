// Tabellone di una fermata: orari programmati (GTFS) uniti ai passaggi stimati (GTFS-RT).

/** Inizio del giorno di servizio GTFS ("mezzogiorno − 12 h"), in ms epoch, nel fuso del dispositivo.
 *  shortcut: assume il dispositivo in Europe/Rome; se serve altrove, calcolare con Intl e timeZone. */
export function serviceDayStart(date: string): number {
  return new Date(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), 12).getTime() - 12 * 3600_000
}

/** [secondi dall'inizio del giorno di servizio, trip_id, pattern_id] */
export type Departure = [number, string, string]
export type StopTimes = Record<string, Departure[]>

export type StopUpdate = { stopId: string; seq: number; time: number | null; delay: number | null }
/** startDate: giorno di servizio della corsa (YYYYMMDD); lo stesso trip_id si ripete in più giorni. */
export type TripUpdate = { tripId: string; startDate: string; stops: StopUpdate[] }

export type BoardRow = {
  tripId: string
  patternId: string
  /** ms epoch programmati */
  scheduled: number
  /** ms epoch stimati (solo live) */
  eta: number | null
  delaySec: number | null
  source: 'live' | 'scheduled'
}

const WINDOW_MS = 90 * 60_000

export function buildBoard(stopId: string, times: StopTimes, updates: Map<string, TripUpdate>, now: number, limit = 12) {
  const live: BoardRow[] = []
  const scheduled: BoardRow[] = []
  const upcoming: BoardRow[] = []
  for (const [date, deps] of Object.entries(times)) {
    const base = serviceDayStart(date)
    for (const [sec, tripId, patternId] of deps) {
      const at = base + sec * 1000
      const any = updates.get(tripId)
      const tu = any?.startDate === date ? any : undefined
      const stu = tu?.stops.find((s) => s.stopId === stopId)
      if (stu?.time) {
        const eta = stu.time * 1000
        if (eta >= now - 30_000 && eta <= now + WINDOW_MS)
          live.push({ tripId, patternId, scheduled: at, eta, delaySec: stu.delay, source: 'live' })
        continue
      }
      // Corsa in tempo reale ma senza stima per questa fermata: già passata (NO_DATA).
      if (tu) continue
      const row: BoardRow = { tripId, patternId, scheduled: at, eta: null, delaySec: null, source: 'scheduled' }
      if (at >= now - 60_000 && at <= now + WINDOW_MS) scheduled.push(row)
      else if (at > now) upcoming.push(row)
    }
  }
  live.sort((a, b) => a.eta! - b.eta!)
  scheduled.sort((a, b) => a.scheduled - b.scheduled)
  const rows = [...live, ...scheduled].slice(0, limit)
  // Di notte: solo le prime corse del mattino, programmate.
  if (!rows.length) return { rows: upcoming.sort((a, b) => a.scheduled - b.scheduled).slice(0, 6), night: true }
  return { rows, night: false }
}
