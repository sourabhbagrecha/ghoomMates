import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AvatarStack } from '../../components/Avatar'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { EmptyState } from '../../components/states/EmptyState'
import { Skeleton } from '../../components/states/Skeleton'
import { VibeChart } from '../../components/VibeChart'
import type { Fan, StyleKey } from '../../data/taste'
import { VIBE_AXES, type VibeScores } from '../../data/vibe'
import type { TasteSummary } from '../../services/prefsService'
import { fanPersonId } from './decks'
import { STYLE_METERS, fansLine, meterWords, percent } from './quizData'
import './QuizPages.css'

// Shared bits of the Vibe Swipe screens: the screen wrapper, progress, live vibe, style meters and fans. The hooks
// live in quizHooks.ts.

const TWEEN_MS = 420

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Eases the chart from its last shape to the new one, so each swipe visibly nudges your vibe */
function useTweenedVibe(target: VibeScores): VibeScores {
  const key = VIBE_AXES.map(({ id }) => target[id].toFixed(3)).join(',')
  const [shown, setShown] = useState(target)
  const current = useRef(target)

  useEffect(() => {
    const to = key.split(',').map(Number)
    const from = VIBE_AXES.map(({ id }) => current.current[id])
    if (from.every((v, i) => Math.abs(v - to[i]) < 0.001)) return
    const instant = prefersReducedMotion()
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = instant ? 1 : Math.min(1, (now - start) / TWEEN_MS)
      const eased = 1 - (1 - t) ** 3
      const next = Object.fromEntries(VIBE_AXES.map(({ id }, i) => [id, from[i] + (to[i] - from[i]) * eased])) as VibeScores
      current.current = next
      setShown(next)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [key])

  return shown
}

// ---- Layout ----

type QuizScreenProps = {
  /** Lets a long title ("Swipe the Udaipur deck") wrap at a smaller size instead of running off a 360px screen */
  longTitle?: boolean
  children: ReactNode
}

/** Wraps an OnboardingLayout: title size and the screen's entrance */
export function QuizScreen({ longTitle, children }: QuizScreenProps) {
  return <div className={`quiz-screen${longTitle ? ' quiz-screen--long-title' : ''}`}>{children}</div>
}

/** Text for screen readers only */
export const ScreenReaderText = ({ children }: { children: ReactNode }) => <span className="quiz-sr">{children}</span>

/** Thin bar under the header title */
export function QuizProgress({ value, max, label }: { value: number; max: number; label: string }) {
  const share = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div
      className="quiz-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <span className="quiz-progress__fill" style={{ transform: `scaleX(${share})` }} />
    </div>
  )
}

/** Placeholder for a deck while it loads: same footprint as the stack, so nothing jumps when it lands */
export function DeckSkeleton({ label = 'Loading your deck' }: { label?: string }) {
  return (
    <div className="quiz-skeleton" aria-busy="true" role="status">
      <ScreenReaderText>{label}…</ScreenReaderText>
      <Skeleton variant="card" height={360} radius={22} />
      <div className="quiz-skeleton__row">
        <Skeleton variant="circle" width={48} />
        <Skeleton variant="circle" width={48} />
        <Skeleton variant="circle" width={48} />
      </div>
      <Skeleton variant="card" height={120} radius={22} />
    </div>
  )
}

/** Trip decks and Squad DNA need an account; the core deck doesn't */
export function SignInNeeded({ onBack }: { onBack: () => void }) {
  return (
    <QuizScreen>
      <OnboardingLayout eyebrow="Vibe Swipe" title="Your trip’s deck" onBack={onBack} bodyClassName="quiz-screen__body">
        <EmptyState
          title="Sign in to swipe your trip’s deck"
          text="Your squad’s picks live on the trip. Sign in and they’ll all be here, mate."
          action={{ label: 'Take me back', onClick: onBack }}
        />
      </OnboardingLayout>
    </QuizScreen>
  )
}

// ---- Vibe ----

const vibeLabel = (scores: VibeScores) =>
  VIBE_AXES.map(({ id, label }) => `${label} ${Math.round(scores[id] * 100)}%`).join(', ')

/** “Your vibe so far”: the spiderweb easing towards your answers, with how sure we are */
export function LiveVibe({ summary, answered }: { summary: TasteSummary; answered: number }) {
  const shown = useTweenedVibe(summary.vibe)
  const sure = percent(summary.overall)
  return (
    <section className="card quiz-live" aria-label="Your vibe so far">
      <VibeChart
        series={[{ scores: shown, color: 'var(--color-amber)', fillOpacity: 0.3, dots: true }]}
        width={128}
        variant="compact"
        label={`Your vibe so far: ${vibeLabel(summary.vibe)}`}
      />
      <div className="quiz-live__text">
        <p className="overline">Your vibe so far</p>
        <p className="quiz-live__persona">{answered >= 3 ? summary.persona.name : 'Keep swiping, mate'}</p>
        <p className="quiz-live__sure" aria-live="polite">
          {answered > 0 ? `We’re ${sure}% sure` : 'Every swipe sharpens it'}
        </p>
      </div>
    </section>
  )
}

/** Pace, mornings, budget and getting around, with words at both ends. Dimensions we know nothing about are left out. */
export function StyleMeters({ style, confidence }: { style: Record<StyleKey, number>; confidence: Record<StyleKey, number> }) {
  const meters = STYLE_METERS.filter((m) => confidence[m.key] > 0)
  if (!meters.length) return null
  return (
    <ul className="quiz-meters" aria-label="Your travel style">
      {meters.map((spec) => {
        const value = style[spec.key]
        const words = meterWords(spec, value)
        return (
          <li key={spec.key} className="quiz-meters__row">
            <div className="quiz-meters__head">
              <span className="quiz-meters__label">{spec.label}</span>
              <span className="quiz-meters__words">{words}</span>
            </div>
            <div
              className="quiz-meters__track"
              role="meter"
              aria-label={spec.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(value * 100)}
              aria-valuetext={words}
            >
              <span className="quiz-meters__dot" style={{ left: `${value * 100}%` }} />
            </div>
            <div className="quiz-meters__ends" aria-hidden="true">
              <span>{spec.low}</span>
              <span>{spec.high}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ---- Fans ----

const MAX_FAN_AVATARS = 4

/** “Riya and Kabir loved this” under a trip card. Only likes and loves ever reach the app. */
export function FansLine({ fans }: { fans: Fan[] }) {
  const shown = fans.filter((f) => f.verdict === 'like' || f.verdict === 'love')
  if (!shown.length) return null
  return (
    <p className="quiz-fans">
      <AvatarStack people={shown.slice(0, MAX_FAN_AVATARS).map(fanPersonId)} size={26} overlap={9} />
      <span className="quiz-fans__text">{fansLine(shown)}</span>
    </p>
  )
}
