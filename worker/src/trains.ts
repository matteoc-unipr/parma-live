// Treni di Parma: ViaggiaTreno come fonte primaria, monitor RFI come ripiego. Campi normalizzati per l'app.
// Campi ViaggiaTreno verificati su campioni reali (fixtures/viaggiatreno, 31/10/2026). Ogni campo è letto come opzionale.
import { parseMonitor, type RfiTrain } from './rfi'

const VT = 'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno'
const RFI_MONITOR = 'https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor'
const PARMA_VT = 'S05014'
const PARMA_RFI = '2035'
const TIMEOUT_MS = 6000 // ViaggiaTreno è spesso lento: oltre si passa a RFI

export type Source = 'viaggiatreno' | 'rfi'
export type Train = {
  number: string
  /** "RV 2477" */
  label: string
  category: string
  /** orario programmato HH:MM a Parma */
  time: string
  /** destinazione (partenze) o provenienza (arrivi) */
  station: string
  platform: { planned: string | null; actual: string | null }
  delayMin: number | null
  cancelled: boolean
  inStation: boolean
  lastSeen: { station: string; time: string | null } | null
  /** fermate successive (solo RFI, partenze): servono al dettaglio di ripiego */
  next?: { name: string; time: string }[]
}
export type TrainStop = {
  name: string
  /** programmato e reale/stimato, HH:MM */
  planned: string | null
  actual: string | null
  platform: { planned: string | null; actual: string | null }
  passed: boolean
  cancelled: boolean
}
export type TrainDetail = {
  number: string
  label: string
  origin: string
  destination: string
  delayMin: number | null
  cancelled: boolean
  lastSeen: { station: string; time: string | null } | null
  stops: TrainStop[]
  /** true con il ripiego RFI: solo Parma e le fermate successive, niente rilevamenti */
  partial: boolean
}

/* ---------- Date e orari nel fuso di Roma (il Worker gira in UTC) ---------- */

/** Data nel formato di `Date.prototype.toString()` a Roma, come la vuole ViaggiaTreno: "Sat Oct 31 2026 10:45:00 GMT+0100". */
export function vtDate(ms: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Rome', weekday: 'short', month: 'short', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
    }).formatToParts(ms).map((p) => [p.type, p.value]),
  )
  const offset = (parts.timeZoneName ?? 'GMT+01:00').replace(':', '')
  return `${parts.weekday} ${parts.month} ${parts.day} ${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${offset}`
}

export const hhmm = (ms: number | null | undefined) =>
  ms ? new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms) : null

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/* ---------- ViaggiaTreno ---------- */
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON ViaggiaTreno, letto solo qui */

const vtFetch = async (path: string) => {
  const res = await fetch(`${VT}/${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`ViaggiaTreno: HTTP ${res.status}`)
  return res
}

/** provvedimento 1 o tipoTreno "ST" = soppresso. */
const vtCancelled = (t: any) => t?.provvedimento === 1 || t?.tipoTreno === 'ST'

export function fromVtBoardItem(t: any, kind: 'departures' | 'arrivals'): Train {
  const dep = kind === 'departures'
  const label = str(t.compNumeroTreno) ?? `${str(t.categoria) ?? ''} ${t.numeroTreno ?? ''}`.trim()
  const lastStation = str(t.stazioneUltimoRilevamento)
  return {
    number: String(t.numeroTreno ?? ''),
    label,
    category: label.split(' ')[0] ?? '',
    time: str(dep ? t.compOrarioPartenza : t.compOrarioArrivo) ?? hhmm(num(dep ? t.orarioPartenza : t.orarioArrivo)) ?? '',
    station: str(dep ? t.destinazione : t.origine) ?? '',
    platform: {
      planned: str(dep ? t.binarioProgrammatoPartenzaDescrizione : t.binarioProgrammatoArrivoDescrizione),
      actual: str(dep ? t.binarioEffettivoPartenzaDescrizione : t.binarioEffettivoArrivoDescrizione),
    },
    delayMin: num(t.ritardo),
    cancelled: vtCancelled(t),
    inStation: t.inStazione === true,
    lastSeen: lastStation && lastStation !== '--' ? { station: lastStation, time: hhmm(num(t.oraUltimoRilevamento)) } : null,
  }
}

export async function vtBoard(kind: 'departures' | 'arrivals', now: number): Promise<Train[]> {
  const res = await vtFetch(`${kind === 'departures' ? 'partenze' : 'arrivi'}/${PARMA_VT}/${encodeURIComponent(vtDate(now))}`)
  const json = (await res.json()) as unknown
  if (!Array.isArray(json)) throw new Error('ViaggiaTreno: risposta inattesa')
  return json.map((t) => fromVtBoardItem(t, kind))
}

export function fromVtAndamento(a: any): TrainDetail {
  const stops: TrainStop[] = (Array.isArray(a.fermate) ? a.fermate : []).map((f: any) => {
    // Partenza dove c'è (come nel tabellone), arrivo al capolinea.
    const real = num(f.partenzaReale) ?? num(f.arrivoReale) ?? num(f.effettiva)
    const planned = num(f.partenza_teorica) ?? num(f.arrivo_teorico) ?? num(f.programmata)
    // Nelle fermate future `ritardo` vale 0: si stima con il ritardo attuale del treno.
    const delay = num(a.ritardo) ?? 0
    return {
      name: str(f.stazione) ?? '',
      planned: hhmm(planned),
      // Passata: orario reale; futura: programmato + ritardo attuale del treno.
      actual: hhmm(real ?? (planned ? planned + delay * 60_000 : null)),
      platform: {
        planned: str(f.binarioProgrammatoArrivoDescrizione) ?? str(f.binarioProgrammatoPartenzaDescrizione),
        actual: str(f.binarioEffettivoArrivoDescrizione) ?? str(f.binarioEffettivoPartenzaDescrizione),
      },
      passed: real !== null,
      cancelled: f.actualFermataType === 3,
    }
  })
  const lastStation = str(a.stazioneUltimoRilevamento)
  return {
    number: String(a.numeroTreno ?? ''),
    label: str(a.compNumeroTreno) ?? String(a.numeroTreno ?? ''),
    origin: str(a.origine) ?? stops[0]?.name ?? '',
    destination: str(a.destinazione) ?? stops.at(-1)?.name ?? '',
    delayMin: num(a.ritardo),
    cancelled: vtCancelled(a),
    lastSeen: lastStation && lastStation !== '--' ? { station: lastStation, time: hhmm(num(a.oraUltimoRilevamento)) } : null,
    stops,
    partial: false,
  }
}

/** Numero → stazione d'origine e data (cercaNumeroTrenoTrenoAutocomplete: "2477 - BOLOGNA C.LE|2477-S05043-1698274800000"). */
export function parseTrainSearch(text: string) {
  const first = text.split('\n').map((l) => l.trim()).find(Boolean)
  const [, key] = first?.split('|') ?? []
  const [, origin, midnight] = key?.split('-') ?? []
  return origin && midnight ? { origin, midnight } : null
}

export async function vtTrain(numero: string): Promise<TrainDetail> {
  const found = parseTrainSearch(await (await vtFetch(`cercaNumeroTrenoTrenoAutocomplete/${numero}`)).text())
  if (!found) throw new Error(`ViaggiaTreno: treno ${numero} non trovato`)
  const json = await (await vtFetch(`andamentoTreno/${found.origin}/${numero}/${found.midnight}`)).json()
  return fromVtAndamento(json)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ---------- Ripiego RFI ---------- */

export function fromRfi(t: RfiTrain): Train {
  const category = t.operator === 'FRECCIAROSSA' ? 'FR' : ({ REG: 'R', RV: 'RV', INTERCITY: 'IC', 'INTERCITY NOTTE': 'ICN', EUROCITY: 'EC' } as Record<string, string>)[t.category] ?? t.category
  return {
    number: t.number,
    label: `${category} ${t.number}`,
    category,
    time: t.time,
    station: t.station,
    // Il monitor mostra un solo binario: quello attuale, che può già essere cambiato.
    platform: { planned: null, actual: t.platform },
    delayMin: t.delayMin,
    cancelled: /soppress|cancell/i.test(t.note ?? ''),
    inStation: t.atPlatform,
    lastSeen: null,
    next: t.stops,
  }
}

export async function rfiBoard(kind: 'departures' | 'arrivals'): Promise<Train[]> {
  const res = await fetch(`${RFI_MONITOR}?placeId=${PARMA_RFI}&arrivals=${kind === 'arrivals' ? 'True' : 'False'}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`RFI: HTTP ${res.status}`)
  return parseMonitor(await res.text()).map(fromRfi)
}

/** Dettaglio di ripiego: dal tabellone RFI si conoscono solo Parma e (in partenza) le fermate successive. */
export function rfiDetail(numero: string, departures: Train[], arrivals: Train[]): TrainDetail | null {
  const dep = departures.find((t) => t.number === numero)
  const arr = arrivals.find((t) => t.number === numero)
  const t = dep ?? arr
  if (!t) return null
  const delay = t.delayMin ?? 0
  const plus = (time: string) => {
    const m = (+time.slice(0, 2) * 60 + +time.slice(3) + delay + 1440) % 1440
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  }
  const parma: TrainStop = { name: 'PARMA', planned: t.time, actual: plus(t.time), platform: t.platform, passed: false, cancelled: t.cancelled }
  return {
    number: t.number,
    label: t.label,
    origin: dep ? (arr?.station ?? '') : t.station,
    destination: dep ? t.station : 'PARMA',
    delayMin: t.delayMin,
    cancelled: t.cancelled,
    lastSeen: null,
    stops: [
      parma,
      ...(dep?.next ?? []).map((s) => ({ name: s.name, planned: s.time, actual: plus(s.time), platform: { planned: null, actual: null }, passed: false, cancelled: t.cancelled })),
    ],
    partial: true,
  }
}
