import { useState, type ReactNode } from 'react'
import iconLeafSuccess from '../../assets/icons/icon-leaf-success.svg'
import iconRecycleSuccess from '../../assets/icons/icon-recycle-success.svg'
import iconSproutPrimary from '../../assets/icons/icon-sprout-primary.svg'
import iconChefHat from '../../assets/icons/icon-chef-hat-primary.svg'
import iconMinus from '../../assets/icons/icon-minus-primary.svg'
import iconPlus from '../../assets/icons/icon-plus-primary.svg'
import type { Green } from '../../services/hospitalityService'
import './Hospitality.css'

/** "Green Host 93" pill. The tier (Gold, Silver…) is in the tooltip and spelled out wherever there is room. */
export function GreenBadge({ green, size = 'small' }: { green: Green; size?: 'small' | 'large' }) {
  return (
    <span className={`green-badge green-badge--${size}`} title={`${green.tier} Green Host`}>
      <img src={iconLeafSuccess} alt="" width={size === 'small' ? 12 : 14} height={size === 'small' ? 12 : 14} />
      Green Host <strong>{green.score}</strong>
    </span>
  )
}

/** A green panel with a recycling icon: what to do tomorrow with today's leftovers or trimmings */
export function ZeroWasteTip({ children }: { children: ReactNode }) {
  return (
    <div className="zero-waste">
      <img src={iconRecycleSuccess} alt="" width={18} height={18} />
      <p>
        <strong>Zero-waste tip</strong>
        {children}
      </p>
    </div>
  )
}

type PhotoProps = {
  src: string
  alt: string
  width: number
  height: number
  className?: string
  /** What the placeholder shows if the picture is missing */
  kind?: 'host' | 'farm'
}

/** A picture that never shows a broken-image icon: if it can't load, a soft tile with a sprout or chef's hat stands in. */
export function Photo({ src, alt, width, height, className, kind = 'host' }: PhotoProps) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className={`photo-fallback${className ? ` ${className}` : ''}`} role="img" aria-label={alt}>
        <img src={kind === 'farm' ? iconSproutPrimary : iconChefHat} alt="" width={28} height={28} />
      </span>
    )
  }
  return <img className={className} src={src} alt={alt} width={width} height={height} loading="lazy" onError={() => setFailed(true)} />
}

type StepperProps = {
  value: number
  min: number
  max: number
  step?: number
  /** Names what is counted, for screen readers: "guests", "Jain guests", "kilos" */
  label: string
  /** How the number is shown; defaults to the number itself */
  format?: (value: number) => string
  onChange: (value: number) => void
}

/** − 6 + : a round-button counter. The number is live for screen readers. */
export function Stepper({ value, min, max, step = 1, label, format, onChange }: StepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next * 100) / 100))
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper__button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        <img src={iconMinus} alt="" width={16} height={16} />
      </button>
      <output className="stepper__value" aria-live="polite">
        {format ? format(value) : value}
      </output>
      <button type="button" className="stepper__button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        <img src={iconPlus} alt="" width={16} height={16} />
      </button>
    </div>
  )
}
