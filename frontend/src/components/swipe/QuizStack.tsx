// Vibe Swipe card stack: the top card and two peeking behind it. Swipe cards follow the finger (left nope, right
// yes, up must-do); this-or-that cards drag toward a half; the other formats are tapped. The stack animates the
// answered card away, then calls onAnswer; the parent drops it from `cards`. See frontend/DESIGN_GUIDELINES.md.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { iconUrl } from '../../assets/icons'
import type { Card, Reply, Verdict } from '../../data/taste'
import { LinkButton } from '../Button'
import {
  announce,
  clamp,
  exitTransform,
  FADE_MS,
  FLING_MS,
  flingTo,
  LIFT_MS,
  msSince,
  play,
  reducedMotion,
  RETURN_MS,
  tick,
  type Exit,
} from './motion'
import { SwipeCard } from './SwipeCard'
import { useDrag, type DragState } from './useDrag'
import './Swipe.css'

export type CataloguePhoto = { src: string; alt: string; credit: string; license: string; source: string }

export type QuizStackProps = {
  /** Cards still to answer, top first. The stack animates the answered card away, then calls onAnswer;
   * the parent then drops that card from `cards`. */
  cards: Card[]
  onAnswer: (card: Card, reply: Reply, ms: number) => void
  /** Rewind the last answer (the parent puts that card back on top) */
  onUndo?: () => void
  canUndo?: boolean
  /** Credited photo for art.kind === 'catalog' cards */
  photoFor?: (experienceId: string) => CataloguePhoto | undefined
  /** Optional line under the top card, e.g. "Riya and Kabir loved this" */
  footer?: (card: Card) => ReactNode
  /** Shown in place of the deck once every card is answered (undo stays available). Without it the stack
   * renders nothing when `cards` is empty. */
  empty?: ReactNode
  className?: string
}

/** Past this share of the card's width (height for must-do) a released swipe commits */
const COMMIT_X = 0.3
const COMMIT_Y = 0.25
/** A flick this fast (px/ms) over at least FLICK_MIN px commits too */
const FLICK = 0.5
const FLICK_MIN = 40
/** If the parent keeps an answered card on top this long, give it back */
const STUCK_MS = 1200

const HOW: Record<Card['format'], string> = {
  swipe: '',
  'this-or-that': 'Tap one, or drag toward it',
  pick: 'Pick one',
  multi: 'Pick any, then tap Done',
  'best-worst': 'One best, one worst',
  spectrum: 'Slide to where you sit',
}

const KEYS: Record<Card['format'], string> = {
  swipe: 'Left arrow for nope, right arrow for yes, up arrow for must-do.',
  'this-or-that': 'Left or up arrow picks the first, right or down arrow the second.',
  pick: 'Tab to an option and press Enter.',
  multi: 'Tab to the options, then Done.',
  'best-worst': 'Tab to the thumbs, then Lock it in.',
  spectrum: 'Tab to the slider, then Lock it in.',
}

const ARROWS: Partial<Record<string, Verdict>> = { ArrowLeft: 'nope', ArrowRight: 'like', ArrowUp: 'love' }

const STAMP_VARS = ['--yes', '--nope', '--love', '--toward-a', '--toward-b'] as const

function setVars(el: HTMLElement, vars: Partial<Record<(typeof STAMP_VARS)[number], number>>) {
  for (const name of STAMP_VARS) el.style.setProperty(name, String(vars[name] ?? 0))
}

const STAMP: Record<Verdict, Partial<Record<(typeof STAMP_VARS)[number], number>>> = {
  like: { '--yes': 1 },
  nope: { '--nope': 1 },
  love: { '--love': 1 },
}

export function QuizStack({ cards, onAnswer, onUndo, canUndo, photoFor, footer, empty, className }: QuizStackProps) {
  const top = cards[0]
  const topId = top?.id
  const visible = cards.slice(0, 3)
  const helpId = useId()
  const [message, setMessage] = useState('')

  const deckRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLElement>(null)
  /** When the current top card showed up, for the answer's ms */
  const shownAt = useRef(0)
  /** An answer is animating out; ignore input until the next card is on top */
  const busy = useRef(false)
  /** Cards that left and how, so an undone card flies back in from where it went */
  const exits = useRef<{ id: string; exit: Exit }[]>([])
  const undoing = useRef(false)
  /** Keyboard focus was in the deck when the card left: put it back on the deck */
  const refocus = useRef(false)
  const axis = useRef<'x' | 'y'>('x')
  const reduce = useRef(false)
  const stuck = useRef<number | undefined>(undefined)
  /** A picked option shows for a moment before its card leaves */
  const held = useRef<number | undefined>(undefined)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      window.clearTimeout(stuck.current)
      window.clearTimeout(held.current)
    }
  }, [])

  // A new card on top: settle the deck, fly an undone card back in, and keep keyboard focus in the stack
  useLayoutEffect(() => {
    shownAt.current = performance.now()
    busy.current = false
    const deck = deckRef.current
    deck?.style.setProperty('--lift', '0')
    deck?.removeAttribute('data-dragging')
    const el = topRef.current
    if (topId && el) {
      const back = exits.current.at(-1)?.id === topId ? exits.current.pop() : undefined
      if (back || undoing.current) {
        const still = reducedMotion()
        const from = back ? exitTransform(back.exit) : 'translateY(-24px)'
        void play(el, still ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: from, opacity: 0 }, { transform: 'none', opacity: 1 }], {
          duration: still ? FADE_MS : RETURN_MS,
          easing: 'cubic-bezier(0.2, 1.1, 0.4, 1)',
        })
      }
    }
    undoing.current = false
    if (refocus.current) {
      refocus.current = false
      deck?.focus({ preventScroll: true })
    }
  }, [topId])

  /** Puts a dragged card back where it was (the CSS transition is the spring) */
  const settle = (el: HTMLElement) => {
    el.style.transition = ''
    el.style.transform = ''
    setVars(el, {})
    const deck = deckRef.current
    deck?.removeAttribute('data-dragging')
    deck?.style.setProperty('--lift', '0')
  }

  /** Animates the top card away, then hands the answer to the parent. The deck is busy (no Undo, no other answer) from the first tap. */
  const commit = (card: Card, reply: Reply, exit: Exit, delayMs = 0) => {
    const el = topRef.current
    if (busy.current || !el || card.id !== topId) return
    busy.current = true
    const ms = msSince(shownAt.current)
    if (!delayMs) return leave(el, card, reply, exit, ms)
    window.clearTimeout(held.current)
    held.current = window.setTimeout(() => {
      if (alive.current && topRef.current === el) leave(el, card, reply, exit, ms)
    }, delayMs)
  }

  const leave = (el: HTMLElement, card: Card, reply: Reply, exit: Exit, ms: number) => {
    const deck = deckRef.current
    refocus.current = !!deck?.contains(document.activeElement)
    if (reply.kind === 'swipe') tick()
    setMessage(announce(card, reply))
    deck?.removeAttribute('data-dragging')
    deck?.style.setProperty('--lift', '1')

    const still = reducedMotion()
    const from = el.style.transform || 'none'
    const keyframes: Keyframe[] = still
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { transform: from, opacity: 1 },
          { transform: exitTransform(exit), opacity: exit.kind === 'lift' ? 0 : 1 },
        ]
    const duration = still ? FADE_MS : exit.kind === 'fling' ? FLING_MS : LIFT_MS
    const easing = exit.kind === 'fling' ? 'cubic-bezier(0.4, 0, 1, 1)' : 'ease-out'
    void play(el, keyframes, { duration, easing, fill: 'forwards' }).then(() => {
      if (!alive.current) return
      exits.current.push({ id: card.id, exit })
      if (exits.current.length > 50) exits.current.shift()
      onAnswer(card, reply, ms)
      // The parent normally drops the card right away; if it didn't, bring the card back rather than freeze
      window.clearTimeout(stuck.current)
      stuck.current = window.setTimeout(() => {
        if (!alive.current || topRef.current !== el) return
        for (const animation of el.getAnimations()) animation.cancel()
        settle(el)
        busy.current = false
      }, STUCK_MS)
    })
  }

  const size = () => ({ w: topRef.current?.offsetWidth ?? 360, h: topRef.current?.offsetHeight ?? 500 })

  const swipe = (verdict: Verdict, from = { x: 0, y: 0 }) => {
    const el = topRef.current
    if (!top || !el || busy.current) return
    const { w, h } = size()
    setVars(el, STAMP[verdict])
    const exit = verdict === 'love' ? flingTo(0, -1, w, h, from) : flingTo(verdict === 'like' ? 1 : -1, 0, w, h, from)
    commit(top, { kind: 'swipe', verdict }, exit)
  }

  const chooseHalf = (side: 0 | 1, from = { x: 0, y: 0 }, thrown = false) => {
    const el = topRef.current
    const option = top?.options[side]
    if (!top || !el || !option || busy.current) return
    const { w, h } = size()
    setVars(el, side === 0 ? { '--toward-a': 1 } : { '--toward-b': 1 })
    const dir = side === 0 ? -1 : 1
    const exit: Exit = !thrown ? { kind: 'lift' } : axis.current === 'y' ? flingTo(0, dir, w, h, from) : flingTo(dir, 0, w, h, from)
    commit(top, { kind: 'choose', optionIds: [option.id] }, exit)
  }

  const skip = () => top && commit(top, { kind: 'skip' }, { kind: 'lift' })

  const undo = () => {
    if (!onUndo || !canUndo || busy.current) return
    undoing.current = true
    const active = document.activeElement
    refocus.current = !!active && (!!deckRef.current?.contains(active) || !!(active as HTMLElement).closest?.('.swipe__undo'))
    setMessage('Undone. That card is back.')
    onUndo()
  }

  const drag = useDrag({
    enabled: !!top && (top.format === 'swipe' || top.format === 'this-or-that'),
    onStart: (el) => {
      if (busy.current) return
      reduce.current = reducedMotion()
      el.style.transition = 'none'
      deckRef.current?.setAttribute('data-dragging', '')
      if (top?.format === 'this-or-that') {
        const [a, b] = el.querySelectorAll<HTMLElement>('[data-half]')
        axis.current = a && b && b.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1 ? 'y' : 'x'
      }
    },
    onMove: ({ dx, dy, width: w, height: h }: DragState) => {
      const el = topRef.current
      if (!el || busy.current || !top) return
      if (top.format === 'swipe') {
        const rotate = reduce.current ? 0 : clamp((dx / w) * 24, -12, 12)
        el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`
        const up = -dy > Math.abs(dx)
        setVars(el, {
          '--yes': up ? 0 : clamp(dx / (w * COMMIT_X), 0, 1),
          '--nope': up ? 0 : clamp(-dx / (w * COMMIT_X), 0, 1),
          '--love': up ? clamp(-dy / (h * COMMIT_Y), 0, 1) : 0,
        })
        deckRef.current?.style.setProperty('--lift', String(clamp(Math.hypot(dx, dy) / (w * 0.6), 0, 1)))
        return
      }
      const vertical = axis.current === 'y'
      const along = vertical ? dy : dx
      const reach = (vertical ? h : w) * COMMIT_Y
      el.style.transform = vertical
        ? `translateY(${along}px)`
        : `translateX(${along}px) rotate(${reduce.current ? 0 : clamp((along / w) * 16, -8, 8)}deg)`
      setVars(el, { '--toward-a': clamp(-along / reach, 0, 1), '--toward-b': clamp(along / reach, 0, 1) })
    },
    onRelease: ({ dx, dy, vx, vy, width: w, height: h }: DragState, cancelled: boolean) => {
      const el = topRef.current
      if (!el || busy.current || !top) return
      const from = { x: dx, y: dy }
      if (!cancelled && top.format === 'swipe') {
        const up = -dy > Math.abs(dx)
        if (up && (-dy > h * COMMIT_Y || (vy < -FLICK && -dy > FLICK_MIN))) return swipe('love', from)
        if (!up && (dx > w * COMMIT_X || (vx > FLICK && dx > FLICK_MIN))) return swipe('like', from)
        if (!up && (dx < -w * COMMIT_X || (vx < -FLICK && dx < -FLICK_MIN))) return swipe('nope', from)
      }
      if (!cancelled && top.format === 'this-or-that') {
        const vertical = axis.current === 'y'
        const along = vertical ? dy : dx
        const speed = vertical ? vy : vx
        const reach = (vertical ? h : w) * COMMIT_Y
        if (along < -reach || (speed < -FLICK && along < -FLICK_MIN)) return chooseHalf(0, from, true)
        if (along > reach || (speed > FLICK && along > FLICK_MIN)) return chooseHalf(1, from, true)
      }
      settle(el)
    },
  })

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const typing = target instanceof HTMLInputElement && target.type !== 'range'
    const onDeck = target === deckRef.current
    if (!typing && (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      return undo()
    }
    if (!onDeck || e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'Backspace') {
      e.preventDefault()
      return undo()
    }
    if (!top) return
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault()
      return skip()
    }
    if (top.format === 'swipe') {
      const verdict = ARROWS[e.key]
      if (verdict) {
        e.preventDefault()
        swipe(verdict)
      }
    } else if (top.format === 'this-or-that') {
      const side = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 0 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : null
      if (side !== null) {
        e.preventDefault()
        chooseHalf(side)
      }
    }
  }

  if (!top && !empty) return null

  return (
    <div className={`swipe${className ? ` ${className}` : ''}`} onKeyDown={onKeyDown}>
      <div
        ref={deckRef}
        className="swipe__deck"
        role="group"
        aria-label="Vibe cards"
        aria-describedby={helpId}
        tabIndex={top ? 0 : -1}
      >
        {top
          ? visible.map((card, depth) => (
              <SwipeCard
                key={card.id}
                card={card}
                depth={depth}
                photoFor={photoFor}
                cardRef={depth === 0 ? topRef : undefined}
                drag={depth === 0 ? drag : undefined}
                onReply={depth === 0 ? (reply, exit, delayMs) => commit(card, reply, exit, delayMs) : undefined}
              />
            ))
          : empty}
      </div>
      <p id={helpId} className="swipe__sr">
        {top ? `${KEYS[top.format]} S skips, Backspace undoes.` : 'Backspace undoes the last answer.'}
      </p>

      {footer && top && <div className="swipe__footer">{footer(top)}</div>}

      <div className="swipe__controls">
        <div className="swipe__side">
          {onUndo && canUndo && (
            <button type="button" className="swipe-btn swipe__undo" aria-label="Undo last answer" title="Undo" onClick={undo}>
              <img src={iconUrl('undo-2', 'primary')} alt="" width={20} height={20} />
            </button>
          )}
        </div>
        {top?.format === 'swipe' ? (
          <div className="swipe__buttons">
            <button type="button" className="swipe-btn swipe-btn--nope" aria-label="Nope" title="Nope (←)" onClick={() => swipe('nope')}>
              <img src={iconUrl('x', 'primary')} alt="" width={26} height={26} />
            </button>
            <button type="button" className="swipe-btn swipe-btn--love" aria-label="Must-do" title="Must-do (↑)" onClick={() => swipe('love')}>
              <img src={iconUrl('star', 'primary')} alt="" width={22} height={22} />
            </button>
            <button type="button" className="swipe-btn swipe-btn--like" aria-label="Yes" title="Yes (→)" onClick={() => swipe('like')}>
              <img src={iconUrl('heart', 'white')} alt="" width={26} height={26} />
            </button>
          </div>
        ) : (
          <p className="swipe__how">{top ? HOW[top.format] : ''}</p>
        )}
        <div className="swipe__side swipe__side--end">
          {top && (
            <LinkButton className="swipe__skip" onClick={skip}>
              Skip
            </LinkButton>
          )}
        </div>
      </div>

      <p className="swipe__sr" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  )
}
