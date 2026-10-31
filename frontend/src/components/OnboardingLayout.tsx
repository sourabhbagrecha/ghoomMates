import type { ReactNode } from 'react'
import iconBack from '../assets/figma/icon-back-white.svg'
import defaultHeaderBg from '../assets/figma/onboarding-header-bg.svg'
import { StatusBar } from './StatusBar'
import './OnboardingLayout.css'

type OnboardingLayoutProps = {
  eyebrow: string
  title: string
  subtitle?: ReactNode
  /** 1–4 shows the sign-up progress bar */
  step?: number
  onBack: () => void
  headerRight?: ReactNode
  /** Extra row on the blue header under the title (e.g. the squad on the invite screen) */
  headerExtra?: ReactNode
  headerBg?: string
  headerHeight?: number
  bodyClassName?: string
  children: ReactNode
  /** Buttons pinned to the bottom of the screen */
  actions?: ReactNode
}

const TOTAL_STEPS = 4

/**
 * Shell for sign-up, setup and other pushed screens (e.g. Notifications):
 * blue header with back button, scrolling body, optional pinned actions.
 */
export function OnboardingLayout({
  eyebrow,
  title,
  subtitle,
  step,
  onBack,
  headerRight,
  headerExtra,
  headerBg = defaultHeaderBg,
  headerHeight = 232,
  bodyClassName,
  children,
  actions,
}: OnboardingLayoutProps) {
  return (
    <div className="onboarding">
      <div className="onboarding__scroll">
        <img className="onboarding__header-bg" src={headerBg} alt="" width={393} height={headerHeight} />
        <div className="onboarding__content">
          <StatusBar />
          <div className="onboarding__top-bar">
            <button type="button" className="onboarding__back" onClick={onBack} aria-label="Back">
              <img src={iconBack} alt="" width={20} height={20} />
            </button>
            {headerRight}
          </div>
          <header className="onboarding__heading">
            <p className="onboarding__eyebrow">{eyebrow}</p>
            <h1 className="onboarding__title">{title}</h1>
            {subtitle && <p className="onboarding__subtitle">{subtitle}</p>}
          </header>
          {headerExtra}
          {step && (
            <div
              className="onboarding__progress"
              role="progressbar"
              aria-label={`Step ${step} of ${TOTAL_STEPS}`}
              aria-valuenow={step}
              aria-valuemin={1}
              aria-valuemax={TOTAL_STEPS}
            >
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <span key={i} className={i < step ? 'onboarding__segment--done' : undefined} />
              ))}
            </div>
          )}
          <main className={`onboarding__body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</main>
        </div>
      </div>
      {actions ? (
        <footer className="onboarding__actions">
          {actions}
          <span className="home-indicator" aria-hidden="true" />
        </footer>
      ) : (
        <span className="home-indicator" aria-hidden="true" />
      )}
    </div>
  )
}
