import { useRef, type MouseEvent, type PointerEvent } from 'react'

export type DragState = {
  dx: number
  dy: number
  /** px per ms over the last ~100 ms, for flicks */
  vx: number
  vy: number
  width: number
  height: number
}

type DragOptions = {
  enabled: boolean
  /** The card follows the finger; called on every move once the drag has started */
  onMove: (state: DragState) => void
  /** Finger lifted (cancelled: the browser took the pointer, so spring back) */
  onRelease: (state: DragState, cancelled: boolean) => void
  onStart?: (target: HTMLElement) => void
}

type Sample = { x: number; y: number; t: number }

/** Below this a press is still a tap, so buttons inside the card (this-or-that halves) keep working */
const SLOP = 8
const VELOCITY_WINDOW_MS = 100

/**
 * Pointer drag for a swipe card: works with mouse, touch and pen. The pointer is only captured once it moves
 * past the slop, so a plain tap still clicks whatever is under it. The element needs `touch-action: none`.
 */
export function useDrag({ enabled, onMove, onRelease, onStart }: DragOptions) {
  const drag = useRef<{ id: number; x: number; y: number; width: number; height: number; active: boolean; samples: Sample[] } | null>(null)
  const swallowClick = useRef(false)

  const stateOf = (e: PointerEvent<HTMLElement>): DragState => {
    const d = drag.current!
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    const now = e.timeStamp
    const recent = d.samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS)
    const first = recent[0] ?? { x: e.clientX, y: e.clientY, t: now }
    const dt = Math.max(1, now - first.t)
    return { dx, dy, vx: (e.clientX - first.x) / dt, vy: (e.clientY - first.y) / dt, width: d.width, height: d.height }
  }

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    swallowClick.current = false
    // A press that never became a drag may have ended outside the card without a pointerup: start over
    if (!enabled || drag.current?.active) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      active: false,
      samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < SLOP) return
      d.active = true
      e.currentTarget.setPointerCapture(e.pointerId)
      onStart?.(e.currentTarget)
    }
    d.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp })
    if (d.samples.length > 12) d.samples.shift()
    onMove(stateOf(e))
  }

  const end = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const state = stateOf(e)
    drag.current = null
    if (!d.active) return
    // Swallow the click this release makes (mouse), but not a later one: a touch drag makes no click at all
    swallowClick.current = true
    window.setTimeout(() => {
      swallowClick.current = false
    }, 0)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    onRelease(state, cancelled)
  }

  /** A drag that ends over a button must not also press it */
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: PointerEvent<HTMLElement>) => end(e, false),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e, true),
    onClickCapture,
  }
}
