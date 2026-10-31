import type { ReactNode } from 'react'
import iconCheck from '../../assets/figma/icon-check-success.svg'

type ProgressBarProps = {
  value: number
  max: number
  label: string
  /** Thin variant for summaries */
  thin?: boolean
}

export function ProgressBar({ value, max, label, thin }: ProgressBarProps) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      className={`plan-progress${thin ? ' plan-progress--thin' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span className="plan-progress__fill" style={{ width: `${percent}%` }} />
    </div>
  )
}

type StatusTagProps = {
  /** done = booked/paid/locked · action = needs someone · waiting = not started */
  tone: 'done' | 'action' | 'waiting'
  children: ReactNode
}

export function StatusTag({ tone, children }: StatusTagProps) {
  return (
    <span className={`tag plan-status plan-status--${tone}`}>
      {tone === 'done' && <img src={iconCheck} alt="" width={12} height={12} />}
      {children}
    </span>
  )
}
