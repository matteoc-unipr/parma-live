// BottomSheet a tre detent (design: full y=56, half y=400, peek y=688 su 844 pt).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useUi, type Detent } from '../store'

// Detent full: y=56 nel design (status bar 54); nell'app installata va sotto la safe area vera.
const safeTop = () => {
  const probe = document.createElement('div')
  probe.style.paddingTop = 'env(safe-area-inset-top)'
  document.body.appendChild(probe)
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0
  probe.remove()
  return px
}
const FULL = Math.max(56, safeTop() + 6)
// Altezza dell'html (allungata in styles.css), non innerHeight: nell'app installata iOS è più corta dello schermo.
const screenH = () => document.documentElement.getBoundingClientRect().height
const detentY = (d: Detent, h: number) => (d === 'full' ? FULL : d === 'half' ? Math.round((h * 400) / 844) : h - 156)

export function BottomSheet({ header, children, closable = true }: { header: ReactNode; children: ReactNode; closable?: boolean }) {
  const detent = useUi((s) => s.detent)
  const [h, setH] = useState(screenH)
  const [dragY, setDragY] = useState<number | null>(null)
  const [entered, setEntered] = useState(false)
  const drag = useRef<{ startY: number; y0: number; active: boolean; samples: [number, number][] } | null>(null)
  const justDragged = useRef(false)

  useEffect(() => {
    const onResize = () => setH(screenH())
    window.addEventListener('resize', onResize)
    const raf = requestAnimationFrame(() => setEntered(true)) // parte da fuori schermo e sale a half
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
    }
  }, [])

  const restY = entered ? detentY(detent, h) : h
  const y = dragY ?? restY

  const onPointerDown = (e: React.PointerEvent) => {
    // A full la lista scrolla da sola: si trascina lo sheet solo dall'intestazione.
    if (detent === 'full' && (e.target as HTMLElement).closest('[data-scroll]')) return
    drag.current = { startY: e.clientY, y0: restY, active: false, samples: [[e.timeStamp, e.clientY]] }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    if (!d.active && Math.abs(dy) < 6) return
    if (!d.active) {
      d.active = true
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    d.samples = [...d.samples.slice(-4), [e.timeStamp, e.clientY]]
    let next = d.y0 + dy
    if (next < FULL) next = FULL - (FULL - next) * 0.25 // rubber band sopra full
    setDragY(next)
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d?.active || dragY === null) return
    justDragged.current = true
    setTimeout(() => (justDragged.current = false), 0)
    const [[t0, y0], [t1, y1]] = [d.samples[0]!, d.samples.at(-1)!]
    const velocity = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0 // px/ms
    const projected = dragY + velocity * 180
    setDragY(null)
    if (closable && projected > detentY('peek', h) + 70) return useUi.getState().openSheet(null)
    const nearest = (['full', 'half', 'peek'] as Detent[]).reduce((a, b) =>
      Math.abs(detentY(b, h) - projected) < Math.abs(detentY(a, h) - projected) ? b : a,
    )
    useUi.setState({ detent: nearest })
  }

  // Dopo un trascinamento il click non deve arrivare alle righe.
  const swallowClick = (e: React.MouseEvent) => {
    if (justDragged.current) e.stopPropagation()
  }

  return (
    <div
      data-component="BottomSheet"
      className={`sheet ${dragY === null ? 'animate' : ''}`}
      style={{ height: h - FULL - 8, transform: `translateY(${y}px)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={swallowClick}
    >
      <div data-component="SheetHandle" className="sheet-handle">
        <div />
      </div>
      <div className="sheet-head">{header}</div>
      <div
        data-scroll
        className="sheet-list"
        style={{ overflowY: detent === 'full' ? 'auto' : 'hidden', touchAction: detent === 'full' ? 'pan-y' : 'none' }}
      >
        {children}
      </div>
    </div>
  )
}
