import type { ReactNode } from 'react'
import { Button } from '../Button'
import { GhoomMateAvatar } from '../GhoomMate'
import './EmptyState.css'

type EmptyStateProps = {
  title: string
  text?: ReactNode
  /** The one thing to do next */
  action?: { label: string; onClick: () => void; icon?: string }
  /** compact = smaller mascot and a pill button, for use inside a section (e.g. an empty day) */
  size?: 'default' | 'compact'
  headingLevel?: 2 | 3
  className?: string
}

/** Friendly “nothing here yet” card with GhoomMate, a short explanation and one action. */
export function EmptyState({ title, text, action, size = 'default', headingLevel = 2, className }: EmptyStateProps) {
  const compact = size === 'compact'
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  const icon = action?.icon && <img src={action.icon} alt="" width={compact ? 14 : 16} height={compact ? 14 : 16} />

  return (
    <section className={`card empty-state empty-state--${size}${className ? ` ${className}` : ''}`}>
      <GhoomMateAvatar size={compact ? 56 : 96} ring={compact ? 2 : 4} />
      <Heading className="empty-state__title">{title}</Heading>
      {text && <p className="empty-state__text">{text}</p>}
      {action &&
        (compact ? (
          <button type="button" className="pill-button empty-state__action" onClick={action.onClick}>
            {icon}
            {action.label}
          </button>
        ) : (
          <Button variant="primary" className="empty-state__action" onClick={action.onClick}>
            {icon}
            {action.label}
          </Button>
        ))}
    </section>
  )
}
