import type { ReactNode } from 'react'
import './SectionHeader.css'

type SectionHeaderProps = {
  title: string
  /** Right-aligned slot: a text link, a button or a set of pills */
  action?: ReactNode
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <h2 className="section-header__title">{title}</h2>
      {action}
    </div>
  )
}
