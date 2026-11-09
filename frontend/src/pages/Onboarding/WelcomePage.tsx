import { useRef, useState, type PointerEvent } from 'react'
import ellipse1 from '../../assets/figma/welcome-ellipse-1.svg'
import ellipse2 from '../../assets/figma/welcome-ellipse-2.svg'
import ellipse3 from '../../assets/figma/welcome-ellipse-3.svg'
import dot from '../../assets/figma/welcome-dot.svg'
import mascot from '../../assets/mascot/ghoommate-waving.webp'
import { Button } from '../../components/Button'
import { TopSafeArea } from '../../components/TopSafeArea'
import { HOW_IT_WORKS, INTRO_SLIDE_COUNT, PLAN_PREVIEW, TOP_FEATURES } from './onboardingData'
import './WelcomePage.css'

type WelcomePageProps = {
  onGetStarted: () => void
}

// A horizontal drag longer than this (px) moves to the next or previous slide
const SWIPE = 50

/** Intro carousel: what GhoomMates is, how GhoomMate plans a trip, how it works and the top features. */
export function WelcomePage({ onGetStarted }: WelcomePageProps) {
  const [slide, setSlide] = useState(0)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const isLast = slide === INTRO_SLIDE_COUNT - 1
  const goTo = (next: number) => setSlide(Math.max(0, Math.min(INTRO_SLIDE_COUNT - 1, next)))

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = null
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) goTo(slide + (dx < 0 ? 1 : -1))
  }

  return (
    <div className="welcome">
      <div className="welcome__canvas" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <img className="welcome__ellipse" src={ellipse1} alt="" width={280} height={280} style={{ left: 190, top: -80 }} />
        <img className="welcome__ellipse" src={ellipse2} alt="" width={220} height={220} style={{ left: -90, top: 560 }} />
        <img className="welcome__ellipse" src={ellipse3} alt="" width={120} height={120} style={{ left: 300, top: 410 }} />
        <TopSafeArea />

        <p className="welcome__wordmark">
          <img src={dot} alt="" width={10} height={10} />
          GhoomMates
        </p>
        {!isLast && (
          <button type="button" className="welcome__skip" onClick={onGetStarted}>
            Skip
          </button>
        )}

        <section
          key={slide}
          className="welcome__slide"
          aria-roledescription="slide"
          aria-label={`${slide + 1} of ${INTRO_SLIDE_COUNT}`}
        >
          {slide === 0 && <IntroSlide />}
          {slide === 1 && <PlanSlide />}
          {slide === 2 && <HowItWorksSlide />}
          {slide === 3 && <FeaturesSlide />}
        </section>

        <div className="welcome__actions">
          <div className="welcome__dots">
            {Array.from({ length: INTRO_SLIDE_COUNT }, (_, i) => (
              <button
                key={i}
                type="button"
                className={i === slide ? 'welcome__dot--active' : undefined}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === slide ? 'step' : undefined}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
          <Button variant="highlight" onClick={isLast ? onGetStarted : () => goTo(slide + 1)}>
            {isLast ? 'Get started' : 'Next'}
          </Button>
          <p className="welcome__terms">By continuing you agree to our Terms and Privacy Policy</p>
          <span className="home-indicator home-indicator--light" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

function Mascot({ size }: { size: number }) {
  // The animation is 320 × 336
  return (
    <img
      className="welcome__mascot"
      src={mascot}
      alt="GhoomMate, the octopus travel buddy, waving"
      width={size}
      height={Math.round((size * 336) / 320)}
    />
  )
}

function IntroSlide() {
  return (
    <div className="welcome__intro">
      <Mascot size={260} />
      <div className="welcome__headline">
        <h1>Trips with your squad, sorted.</h1>
        <p>Plan together, share every pic and split every rupee, with GhoomMate by your side.</p>
      </div>
    </div>
  )
}

function PlanSlide() {
  return (
    <div className="welcome__panel">
      <div className="welcome__panel-head">
        <Mascot size={120} />
        <div className="welcome__heading">
          <h1>GhoomMate plans the trip for you</h1>
          <p>Say where, when and who. You get a day-by-day plan that fits the whole squad.</p>
        </div>
      </div>
      <div className="welcome__chat" aria-label="Example: asking GhoomMate to plan a trip">
        <p className="welcome__ask">{PLAN_PREVIEW.ask}</p>
        <div className="welcome__reply">
          <p className="welcome__reply-text">{PLAN_PREVIEW.reply}</p>
          <ol className="welcome__stops">
            {PLAN_PREVIEW.stops.map((stop) => (
              <li key={stop.title}>
                <span className="welcome__stop-time">{stop.time}</span>
                <span className="welcome__stop-title">{stop.title}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

function HowItWorksSlide() {
  return (
    <div className="welcome__panel">
      <div className="welcome__panel-head">
        <Mascot size={120} />
        <div className="welcome__heading">
          <h1>From idea to itinerary in 3 steps</h1>
          <p>No group-chat chaos. GhoomMate does the planning legwork.</p>
        </div>
      </div>
      <ol className="welcome__steps">
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.title} className="welcome__card">
            <span className="welcome__step-number">{i + 1}</span>
            <span className="welcome__card-text">
              <strong>{step.title}</strong>
              <span>{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function FeaturesSlide() {
  return (
    <div className="welcome__panel">
      <div className="welcome__panel-head">
        <Mascot size={120} />
        <div className="welcome__heading">
          <h1>Everything your trip needs</h1>
          <p>One app, from the first idea to the last rupee.</p>
        </div>
      </div>
      <ul className="welcome__features">
        {TOP_FEATURES.map((feature) => (
          <li key={feature.title} className="welcome__card">
            <span className="welcome__feature-icon">
              <img src={feature.icon} alt="" width={20} height={20} />
            </span>
            <span className="welcome__card-text">
              <strong>{feature.title}</strong>
              <span>{feature.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
