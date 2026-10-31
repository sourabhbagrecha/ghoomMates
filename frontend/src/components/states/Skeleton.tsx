import type { CSSProperties } from 'react'
import './Skeleton.css'

type SkeletonProps = {
  /** line = text row · circle = avatar or icon · card = image or whole card */
  variant?: 'line' | 'circle' | 'card'
  /** px number or any CSS length; lines and cards default to full width */
  width?: number | string
  /** px; circles use `width` for both sides when `height` is left out */
  height?: number
  /** Overrides the variant's corner radius, e.g. a list card's 18 */
  radius?: number
  className?: string
}

const DEFAULTS = {
  line: { width: '100%', height: 12 },
  circle: { width: 40, height: 40 },
  card: { width: '100%', height: 120 },
}

/**
 * Shimmering placeholder block. Decorative: wrap a group of them in an element with
 * `aria-busy="true"` and a label (or a visually hidden “Loading…”) for screen readers.
 */
export function Skeleton({ variant = 'line', width, height, radius, className }: SkeletonProps) {
  const size = DEFAULTS[variant]
  const w = width ?? size.width
  const style: CSSProperties = {
    width: w,
    height: height ?? (variant === 'circle' ? w : size.height),
    borderRadius: radius,
  }

  return (
    <span
      className={`skeleton skeleton--${variant}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    />
  )
}
