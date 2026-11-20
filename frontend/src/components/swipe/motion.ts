// Motion helpers for the swipe stack. Everything here runs in event handlers and effects, never during render.
import type { Axis, Card, CardOption, Reply } from '../../data/taste'

export const reducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A tiny tick on a swipe commit, where the phone supports it */
export function tick() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(10)
}

/** Where a card goes when it leaves: off-screen in a direction, or a short lift for tap answers */
export type Exit = { kind: 'fling'; x: number; y: number; rotate: number } | { kind: 'lift' }

export const FLING_MS = 320
export const LIFT_MS = 220
export const FADE_MS = 180
export const RETURN_MS = 360
/** How long a tapped tile shows as picked before the card moves on */
export const PICKED_MS = 250

/**
 * Off-screen keyframe for a fling in a direction (-1, 0 or 1 on each axis). `from` is where a drag let go, so
 * the card keeps travelling the way the finger threw it.
 */
export function flingTo(dirX: number, dirY: number, width: number, height: number, from = { x: 0, y: 0 }): Exit {
  return {
    kind: 'fling',
    x: dirX ? dirX * (width * 1.4 + 80) : from.x * 1.5,
    y: dirY ? dirY * (height * 1.3 + 80) : from.y * 1.5 + 40,
    rotate: dirX ? dirX * 24 : clamp((from.x / width) * 24, -12, 12),
  }
}

export const exitTransform = (exit: Exit) =>
  exit.kind === 'fling' ? `translate(${exit.x}px, ${exit.y}px) rotate(${exit.rotate}deg)` : 'translateY(-24px) scale(1.02)'

/** Runs a Web Animation and resolves when it ends (straight away where the browser has none) */
export function play(el: HTMLElement | null, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
  if (!el || typeof el.animate !== 'function') return Promise.resolve()
  return el
    .animate(keyframes, options)
    .finished.then(() => undefined)
    .catch(() => undefined)
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Whole ms since a performance.now() reading (for a card's answer time; call it from handlers only) */
export const msSince = (start: number) => Math.max(0, Math.round(performance.now() - start))

/** The axis an option speaks to most, e.g. for the fallback art of a catalogue card with no photo */
export function strongestAxis(option?: CardOption): Axis | undefined {
  let best: Axis | undefined
  let bestValue = 0
  for (const [axis, value] of Object.entries(option?.effects.axes ?? {}) as [Axis, number][]) {
    if (value > bestValue) {
      best = axis
      bestValue = value
    }
  }
  return best
}

/** ₹ with Indian digit grouping: ₹1,25,000 */
export const rupees = (amount: number) => (amount === 0 ? 'Free' : `₹${Math.round(amount).toLocaleString('en-IN')}`)

const labelsOf = (card: Card, ids: string[]) =>
  card.options
    .filter((o) => ids.includes(o.id))
    .map((o) => o.label)
    .join(', ')

/** What the screen reader hears when an answer is committed, e.g. “Liked Sunset boat ride” */
export function announce(card: Card, reply: Reply): string {
  switch (reply.kind) {
    case 'swipe':
      if (reply.verdict === 'like') return `Liked ${card.prompt}`
      if (reply.verdict === 'love') return `Must-do: ${card.prompt}`
      return `Passed on ${card.prompt}`
    case 'choose':
      return `${card.prompt}: ${labelsOf(card, reply.optionIds) || 'nothing picked'}`
    case 'best-worst': {
      const best = card.options.find((o) => o.id === reply.best)?.label
      const worst = card.options.find((o) => o.id === reply.worst)?.label
      return `${card.prompt}: best ${best}, worst ${worst}`
    }
    case 'skip':
      return `Skipped ${card.prompt}`
  }
}
