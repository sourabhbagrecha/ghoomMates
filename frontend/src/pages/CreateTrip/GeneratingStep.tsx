import { useEffect, useRef, useState } from 'react'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import ellipse1 from '../../assets/figma/welcome-ellipse-1.svg'
import ellipse3 from '../../assets/figma/welcome-ellipse-3.svg'
import { Button } from '../../components/Button'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { TopSafeArea } from '../../components/TopSafeArea'
import './GeneratingStep.css'

const STEP_MS = 700
const FINISH_MS = 500

type GeneratingStepProps = {
  destination: string
  steps: string[]
  /** The trip is saved and the draft plan is back */
  ready: boolean
  error: string | null
  onCancel: () => void
  onRetry: () => void
  onDone: () => void
}

/** Full-screen loading state: ticks off each step while the plan is generated, then moves on to the draft. */
export function GeneratingStep({ destination, steps, ready, error, onCancel, onRetry, onDone }: GeneratingStepProps) {
  const [ticked, setTicked] = useState(0)
  // The last step stays in progress until the real request finishes
  const done = ready ? ticked : Math.min(ticked, steps.length - 1)
  const finished = done >= steps.length

  // Keep the latest callback without restarting the timers
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  useEffect(() => {
    if (error) return
    const timer = finished
      ? window.setTimeout(() => onDoneRef.current(), FINISH_MS)
      : window.setTimeout(() => setTicked((d) => Math.min(d + 1, steps.length)), STEP_MS)
    return () => window.clearTimeout(timer)
  }, [done, finished, error, steps.length])

  return (
    <div className="create-generating">
      <div className="create-generating__canvas">
        <img className="create-generating__ellipse" src={ellipse1} alt="" width={280} height={280} style={{ left: 190, top: -80 }} />
        <img className="create-generating__ellipse" src={ellipse3} alt="" width={120} height={120} style={{ left: -40, top: 420 }} />
        <TopSafeArea />

        <div className="create-generating__hero">
          <span className="create-generating__mascot">
            <GhoomMateAvatar size={132} ring={5} />
          </span>
          <h1 className="create-generating__title">
            {error ? 'That didn’t work' : finished ? 'Your plan’s ready!' : `Planning ${destination}…`}
          </h1>
          <p className="create-generating__subtitle">{error ?? 'GhoomMate is mixing your squad’s vibe, dates and budget.'}</p>
        </div>

        <ol className="create-generating__steps" aria-live="polite">
          {steps.map((label, i) => {
            const state = i < done ? 'done' : i === done ? 'active' : 'pending'
            return (
              <li key={label} className={`create-generating__step create-generating__step--${state}`}>
                <span className="create-generating__status" aria-hidden="true">
                  {state === 'done' && <img src={iconCheck} alt="" width={14} height={14} />}
                </span>
                {label}
                <span className="create-generating__sr">{state === 'done' ? ', done' : state === 'active' ? ', in progress' : ''}</span>
              </li>
            )
          })}
        </ol>

        <div className="create-generating__actions">
          {error && (
            <Button variant="highlight" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button variant="glass" onClick={onCancel}>
            Cancel
          </Button>
          <span className="home-indicator home-indicator--light" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
