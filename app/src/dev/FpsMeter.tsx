// `?fps`: misura dei frame sul dispositivo. Finestra mobile di 5 s; i dati sono anche in window.__fps.
import { useEffect, useState } from 'react'
import { busFrameMs, busSourceUpdates } from '../map/busLayer'

type Stats = { fps: number; p95: number; worst: number; slow: number; frames: number; busJs: number; busJsP95: number; loopHz: number; sourceHz: number }
declare global {
  interface Window {
    __fps?: Stats
  }
}

export function FpsMeter() {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    const deltas: [number, number][] = [] // [timestamp, durata frame]
    let last = 0
    let raf = 0
    const loop = (t: number) => {
      if (last) deltas.push([t, t - last])
      last = t
      while (deltas.length && t - deltas[0]![0] > 5000) deltas.shift()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const iv = setInterval(() => {
      if (deltas.length < 10) return
      const d = deltas.map(([, x]) => x).sort((a, b) => a - b)
      const span = deltas.at(-1)![0] - deltas[0]![0]
      const js = busFrameMs.splice(0).sort((a, b) => a - b)
      const sourceHz = busSourceUpdates.n
      busSourceUpdates.n = 0
      const s: Stats = {
        fps: Math.round((deltas.length / span) * 1000 * 10) / 10,
        p95: Math.round(d[Math.floor(d.length * 0.95)]! * 10) / 10,
        worst: Math.round(d.at(-1)! * 10) / 10,
        slow: Math.round((d.filter((x) => x > 1000 / 50).length / d.length) * 1000) / 10, // % frame sotto 50 fps
        frames: d.length,
        busJs: js.length ? Math.round((js.reduce((a, b) => a + b, 0) / js.length) * 100) / 100 : 0,
        busJsP95: js.length ? Math.round(js[Math.floor(js.length * 0.95)]! * 100) / 100 : 0,
        loopHz: js.length, // campioni nell'ultimo secondo = frame del loop bus
        sourceHz,
      }
      window.__fps = s
      setStats(s)
    }, 1000)
    // In background rAF si ferma: si riparte da zero per non contare la pausa come un frame lento.
    const onVis = () => {
      deltas.length = 0
      last = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  if (!stats) return null
  return (
    <div style={{ position: 'absolute', left: 16, top: 'calc(var(--safe-top) + 104px)', zIndex: 20, padding: '6px 10px', borderRadius: 10, background: 'rgba(0,0,0,0.72)', color: '#fff', font: '600 12px/16px ui-monospace, monospace', pointerEvents: 'none' }}>
      {stats.fps} fps · p95 {stats.p95} ms · max {stats.worst} ms · lenti {stats.slow}%
      <br />
      bus: loop {stats.loopHz}/s · GPU {stats.sourceHz}/s · JS {stats.busJs} ms (p95 {stats.busJsP95})
    </div>
  )
}
