import type { ReactNode } from 'react'
import iconCheck from '../assets/figma/icon-check.svg'
import { iconUrl } from '../assets/icons'
import './OptionTile.css'

type OptionGridProps = {
  /** 3 options sit in one row, 4 in a 2 × 2 grid */
  count: number
  /** Single-choice grids are a radio group; multi-choice tiles are toggles */
  multi: boolean
  label: string
  children: ReactNode
}

/** Grid of answer tiles on a flashcard. */
export function OptionGrid({ count, multi, label, children }: OptionGridProps) {
  return (
    <div
      className={`option-grid option-grid--${count === 3 ? 'three' : 'two'}`}
      role={multi ? 'group' : 'radiogroup'}
      aria-label={label}
    >
      {children}
    </div>
  )
}

type OptionTileProps = {
  /** Name of an icon in src/assets/icons, e.g. "sailboat" */
  icon: string
  label: string
  selected: boolean
  multi: boolean
  onClick: () => void
}

/** 28px line icon with a 1–3 word label; turns primary blue with a check when picked. */
export function OptionTile({ icon, label, selected, multi, onClick }: OptionTileProps) {
  const state = multi ? { 'aria-pressed': selected } : { role: 'radio', 'aria-checked': selected }

  return (
    <button
      type="button"
      className={`option-tile${selected ? ' option-tile--selected' : ''}`}
      onClick={onClick}
      {...state}
    >
      {selected && <img className="option-tile__check" src={iconCheck} alt="" width={12} height={12} />}
      <img src={iconUrl(icon, selected ? 'white' : 'primary')} alt="" width={28} height={28} />
      <span className="option-tile__label">{label}</span>
    </button>
  )
}
