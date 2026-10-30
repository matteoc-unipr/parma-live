// Tabellone RFI di Parma via Worker (/rfi/partenze, /rfi/arrivi).
import { useEffect, useState } from 'react'
import { WORKER } from './realtime'

export type Train = {
  number: string
  operator: string
  category: string
  station: string
  time: string
  delayMin: number | null
  note: string | null
  platform: string | null
  atPlatform: boolean
  stops: { name: string; time: string }[]
  info: string | null
}
export type TrainMode = 'partenze' | 'arrivi'

const CATEGORY: Record<string, string> = {
  REG: 'R',
  RV: 'RV',
  INTERCITY: 'IC',
  'INTERCITY NOTTE': 'ICN',
  "ALTA VELOCITA'": 'FR',
  EUROCITY: 'EC',
}
export const shortCategory = (t: Train) =>
  t.operator === 'FRECCIAROSSA' ? 'FR' : t.operator === 'ITALO' ? 'ITA' : (CATEGORY[t.category] ?? t.category)

export const isCancelled = (t: Train) => /soppress|cancell/i.test(t.note ?? '')

export const addMinutes = (hhmm: string, min: number) => {
  const total = (+hhmm.slice(0, 2) * 60 + +hhmm.slice(3) + min + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function useTrains(mode: TrainMode) {
  const [state, setState] = useState<{ mode: TrainMode; trains: Train[] | null; at: Date | null; error: boolean }>({
    mode,
    trains: null,
    at: null,
    error: false,
  })
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`${WORKER}/rfi/${mode}`)
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as { trains: Train[] }
        if (alive) setState({ mode, trains: json.trains, at: new Date(), error: false })
      } catch {
        if (alive) setState((s) => ({ ...s, mode, error: true }))
      }
    }
    void load()
    const iv = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [mode])
  // Cambiando modalità i dati vecchi non valgono: skeleton finché arriva la risposta.
  return state.mode === mode ? state : { trains: null, at: null, error: false }
}

/** RFI scrive tutto in maiuscolo: "MILANO CENTRALE" → "Milano Centrale". */
export const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s.'(-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
