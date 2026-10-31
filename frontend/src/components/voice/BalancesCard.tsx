import { useActiveTrip } from '../../data/activeTrip'
import { Avatar } from '../Avatar'
import { memberLabel, resolveMember } from './memberLabel'
import type { BalanceLine, TransferLine } from './protocol'
import { formatPaise } from './uiEvents'

type BalancesCardProps = {
  balances: BalanceLine[]
  transfers: TransferLine[]
}

/** “Who owes what?”: the suggested transfers, each person in their own colour. */
export function BalancesCard({ balances, transfers }: BalancesCardProps) {
  const members = useActiveTrip().trip?.members
  const known = [...balances, ...(members ?? [])]
  const person = (ref: string) => {
    const { memberId, name } = resolveMember(ref, known)
    return { memberId: memberId ?? ref, name: memberId ? memberLabel(members, memberId, name) : name }
  }

  return (
    <section className="voice-card voice-balances" aria-label="Who owes what">
      <p className="overline voice-card__overline">Who owes what</p>
      {transfers.length === 0 ? (
        <p className="voice-card__text">All square, mate! Nobody owes anyone.</p>
      ) : (
        <ul className="voice-balances__list">
          {transfers.map((t, i) => {
            const from = person(t.from)
            const to = person(t.to)
            return (
              <li key={`${t.from}-${t.to}-${i}`} className="voice-balances__row">
                <span className="voice-person">
                  <Avatar person={from.memberId} size={18} />
                  {from.name}
                </span>
                <span className="voice-balances__arrow" aria-hidden="true">
                  →
                </span>
                <span className="voice-sr">pays</span>
                <span className="voice-person">
                  <Avatar person={to.memberId} size={18} />
                  {to.name}
                </span>
                <span className="voice-balances__amount">{formatPaise(t.amountPaise)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
