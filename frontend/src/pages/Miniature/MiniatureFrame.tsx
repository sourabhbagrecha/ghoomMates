import type { ReactNode } from 'react'
import './MiniatureFrame.css'

type MiniatureFrameProps = {
  /**
   * mat = a slim ivory mount around a painting that already has its own painted border ·
   * ornate = the full vermilion-and-gold border with corner rosettes, for a plain photo
   */
  variant?: 'mat' | 'ornate'
  /** Name plate on the lower border (ornate only), e.g. the style name */
  label?: string
  className?: string
  children: ReactNode
}

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
const PETALS = [0, 45, 90, 135, 180, 225, 270, 315]

/** A small eight-petal lotus, painted in the frame's colours. */
function Rosette({ corner }: { corner: (typeof CORNERS)[number] }) {
  return (
    <svg className={`miniature-frame__corner miniature-frame__corner--${corner}`} viewBox="0 0 28 28" width={28} height={28} aria-hidden="true" focusable="false">
      <circle className="rosette__disc" cx="14" cy="14" r="13" />
      <g className="rosette__petals">
        {PETALS.map((angle) => (
          <ellipse key={angle} cx="14" cy="7.6" rx="2.5" ry="5" transform={`rotate(${angle} 14 14)`} />
        ))}
      </g>
      <circle className="rosette__heart" cx="14" cy="14" r="3.3" />
    </svg>
  )
}

/** A miniature-painting frame: wraps a finished painting (mat) or dresses up a plain photo (ornate). */
export function MiniatureFrame({ variant = 'mat', label, className, children }: MiniatureFrameProps) {
  const ornate = variant === 'ornate'
  const classes = ['miniature-frame', `miniature-frame--${variant}`, ornate && label && 'miniature-frame--labelled', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      {ornate && CORNERS.map((corner) => <Rosette key={corner} corner={corner} />)}
      <div className="miniature-frame__inner">{children}</div>
      {ornate && label && <span className="miniature-frame__label">{label}</span>}
    </div>
  )
}
