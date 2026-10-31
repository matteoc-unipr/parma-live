// Treni di Parma dal Worker (/api/trains/*): ViaggiaTreno, con ripiego RFI lato Worker.
// L'ultimo dato buono resta sul telefono: se tutto è giù si mostra quello, con l'ora.
import { useEffect, useState } from 'react'
import { WORKER } from './realtime'

export type TrainMode = 'departures' | 'arrivals'
export type Source = 'viaggiatreno' | 'rfi'
export type Platform = { planned: string | null; actual: string | null }
export type Train = {
  number: string
  label: string
  category: string
  time: string
  station: string
  platform: Platform
  delayMin: number | null
  cancelled: boolean
  inStation: boolean
  lastSeen: { station: string; time: string | null } | null
}
export type TrainStop = { name: string; planned: string | null; actual: string | null; platform: Platform; passed: boolean; cancelled: boolean }
export type TrainDetail = {
  number: string
  label: string
  origin: string
  destination: string
  delayMin: number | null
  cancelled: boolean
  lastSeen: { station: string; time: string | null } | null
  stops: TrainStop[]
  partial: boolean
}
type Meta = { fetchedAt: string; source: Source; notice: string | null; stale?: boolean }

export type Loaded<T> = {
  data: (Meta & T) | null
  /** messaggio da mostrare se l'ultima richiesta è fallita */
  error: string | null
  /** true se `data` viene dal telefono, non dalla rete */
  fromDevice: boolean
}

const REFRESH_MS = 30_000 // come la cache del Worker

const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage pieno o bloccato: resta solo in memoria */
  }
}
const restore = <T,>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${WORKER}${path}`)
  } catch {
    throw new Error(navigator.onLine ? 'Il server dell’app non risponde' : 'Sei offline')
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Errore ${res.status}`)
  return body
}

function usePolled<T>(path: string | null, storageKey: string | null) {
  const [state, setState] = useState<Loaded<T> & { path: string | null }>({ path, data: null, error: null, fromDevice: false })
  useEffect(() => {
    if (!path) return
    let alive = true
    const load = async () => {
      try {
        const data = await getJson<Meta & T>(path)
        if (storageKey) save(storageKey, data)
        if (alive) setState({ path, data, error: null, fromDevice: false })
      } catch (e) {
        if (!alive) return
        const error = e instanceof Error ? e.message : String(e)
        setState((s) => {
          if (s.path === path && s.data) return { ...s, error } // si tiene quello che c'è a schermo
          const device = storageKey ? restore<Meta & T>(storageKey) : null
          return { path, data: device, error, fromDevice: !!device }
        })
      }
    }
    void load()
    const iv = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [path, storageKey])
  // Cambiando richiesta i dati vecchi non valgono: skeleton finché arriva la risposta.
  return state.path === path ? state : { data: null, error: null, fromDevice: false }
}

export const useTrains = (mode: TrainMode) => usePolled<{ trains: Train[] }>(`/api/trains/${mode}`, `parmaLive.trains.${mode}.v1`)
export const useTrainDetail = (numero: string | null) => usePolled<{ train: TrainDetail }>(numero ? `/api/trains/train/${numero}` : null, null)

/** RFI scrive tutto in maiuscolo: "MILANO CENTRALE" → "Milano Centrale". */
export const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s.'(-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
