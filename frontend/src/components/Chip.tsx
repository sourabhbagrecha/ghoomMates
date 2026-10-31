import type { ReactNode } from 'react'
import iconCheck from '../assets/figma/icon-check.svg'
import './Chip.css'

type ChipProps = {
  selected?: boolean
  /** `onDark` is the translucent chip used on blue gradient cards */
  variant?: 'default' | 'onDark'
  onClick?: () => void
  children: ReactNode
}

export function Chip({ selected = false, variant = 'default', onClick, children }: ChipProps) {
  const className = ['chip', variant === 'onDark' && 'chip--on-dark', selected && 'chip--selected']
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={className} aria-pressed={selected} onClick={onClick}>
      {selected && <img src={iconCheck} alt="" width={12} height={12} />}
      {children}
    </button>
  )
}
