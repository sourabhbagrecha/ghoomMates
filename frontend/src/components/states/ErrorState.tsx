import { useId, useState } from 'react'
import iconAlert from '../../assets/figma/icon-alert-primary.svg'
import { Button, LinkButton } from '../Button'
import './ErrorState.css'

type ErrorStateProps = {
  title?: string
  text?: string
  /** Technical detail (error code, request id) shown behind “Show details” */
  detail?: string
  onRetry: () => void
  retryLabel?: string
  /** Disables the button while the retry is in flight */
  retrying?: boolean
  headingLevel?: 2 | 3
  className?: string
}

/** Friendly failure card: what went wrong in plain words, and a way to try again. */
export function ErrorState({
  title = 'That didn’t load',
  text = 'Something went wrong on our side. Give it another go?',
  detail,
  onRetry,
  retryLabel = 'Try again',
  retrying = false,
  headingLevel = 2,
  className,
}: ErrorStateProps) {
  const [showDetail, setShowDetail] = useState(false)
  const detailId = useId()
  const Heading = headingLevel === 3 ? 'h3' : 'h2'

  return (
    <section className={`card error-state${className ? ` ${className}` : ''}`}>
      <span className="error-state__icon">
        <img src={iconAlert} alt="" width={22} height={22} />
      </span>
      <Heading className="error-state__title">{title}</Heading>
      <p className="error-state__text">{text}</p>
      <Button variant="primary" className="error-state__retry" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Trying again…' : retryLabel}
      </Button>
      {detail && (
        <>
          <LinkButton aria-expanded={showDetail} aria-controls={detailId} onClick={() => setShowDetail((v) => !v)}>
            {showDetail ? 'Hide details' : 'Show details'}
          </LinkButton>
          <p id={detailId} className="error-state__detail" hidden={!showDetail}>
            {detail}
          </p>
        </>
      )}
    </section>
  )
}
