import iconCheck from '../../assets/figma/icon-check-success.svg'
import { useActiveTrip } from '../../data/activeTrip'
import { CATEGORY_LABELS } from '../../pages/Expenses/expensesData'
import { Avatar } from '../Avatar'
import { Button, LinkButton } from '../Button'
import { memberLabel } from './memberLabel'
import type { ExpenseDraft } from './protocol'
import { formatPaise } from './uiEvents'
import type { CardAction } from './useGhoomMateUi'

type ExpenseDraftCardProps = {
  draft: ExpenseDraft
  status: 'draft' | 'added'
  pending: CardAction | null
  error: string | null
  onAction: (type: CardAction) => void
  onView: () => void
}

/** The expense GhoomMate heard, shown before anything is written. Confirm by voice (“yes”) or tap. */
export function ExpenseDraftCard({ draft, status, pending, error, onAction, onView }: ExpenseDraftCardProps) {
  const members = useActiveTrip().trip?.members
  const added = status === 'added'
  const name = (memberId: string, fallback: string) => memberLabel(members, memberId, fallback)
  const split =
    draft.splitType === 'equal' ? `Split equally · ÷${draft.shares.length}` : `Exact split · ${draft.shares.length} mates`

  return (
    <section className={`voice-card voice-expense${added ? ' voice-expense--added' : ''}`} aria-label="Expense draft">
      <div className="voice-expense__head">
        <div className="voice-expense__info">
          <p className="overline voice-card__overline">
            {added ? 'Added' : 'New expense'} · {CATEGORY_LABELS[draft.category] ?? 'Other'}
          </p>
          <p className="voice-expense__amount">{formatPaise(draft.amountPaise)}</p>
          <p className="voice-expense__title">{draft.description}</p>
        </div>
        {added && (
          <span className="voice-expense__done">
            <img src={iconCheck} alt="" width={14} height={14} />
            Added
          </span>
        )}
      </div>

      <div className="voice-expense__row">
        <span className="voice-expense__label">Paid by</span>
        <span className="voice-person">
          <Avatar person={draft.payer.memberId} size={18} />
          {name(draft.payer.memberId, draft.payer.name)}
        </span>
      </div>

      <div className="voice-expense__split">
        <span className="voice-expense__label">{split}</span>
        <ul className="voice-expense__shares">
          {draft.shares.map((share) => (
            <li key={share.memberId} className="voice-person">
              <Avatar person={share.memberId} size={18} />
              {name(share.memberId, share.name)}
              <span className="voice-person__amount">{formatPaise(share.amountPaise)}</span>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p className="voice-card__error" role="alert">
          {error}
        </p>
      )}

      {added ? (
        <LinkButton className="voice-expense__view" onClick={onView}>
          See it in Expenses →
        </LinkButton>
      ) : (
        <div className="voice-card__actions">
          <Button variant="highlight" disabled={pending !== null} onClick={() => onAction('confirm')}>
            {pending === 'confirm' ? 'Adding…' : 'Confirm'}
          </Button>
          <Button variant="outline" disabled={pending !== null} onClick={() => onAction('cancel')}>
            {pending === 'cancel' ? 'Cancelling…' : 'Cancel'}
          </Button>
        </div>
      )}
    </section>
  )
}
