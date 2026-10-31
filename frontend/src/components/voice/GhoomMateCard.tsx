import type { ReactNode } from 'react'
import { BalancesCard } from './BalancesCard'
import { DayPlanCard } from './DayPlanCard'
import { ExpenseDraftCard } from './ExpenseDraftCard'
import { ExperiencesCard } from './ExperiencesCard'
import type { UiAction } from './protocol'
import type { UiCard } from './uiEvents'
import type { CardAction } from './useGhoomMateUi'

type CardProps<K extends UiCard['kind']> = {
  card: Extract<UiCard, { kind: K }>
  pending: CardAction | null
  error: string | null
  onAction: (action: UiAction) => void
  onNavigate: (route: string) => void
}

/** One renderer per card kind: a new skill’s card is one more entry */
const RENDERERS: { [K in UiCard['kind']]: (props: CardProps<K>) => ReactNode } = {
  expense: ({ card, pending, error, onAction, onNavigate }) => (
    <ExpenseDraftCard
      draft={card.draft}
      status={card.status}
      pending={pending}
      error={error}
      onAction={(type) => onAction({ type, draftId: card.draft.id })}
      onView={() => onNavigate('trip/expenses')}
    />
  ),
  balances: ({ card }) => <BalancesCard balances={card.balances} transfers={card.transfers} />,
  experiences: ({ card, pending, onAction, onNavigate }) => (
    <ExperiencesCard
      city={card.city}
      basis={card.basis}
      picks={card.picks}
      pending={pending}
      onAction={onAction}
      onNavigate={onNavigate}
    />
  ),
  dayPlan: ({ card, pending, error, onAction, onNavigate }) => (
    <DayPlanCard
      plan={card.plan}
      status={card.status}
      pending={pending}
      error={error}
      onAction={onAction}
      onNavigate={onNavigate}
    />
  ),
}

/** Whatever GhoomMate last put on screen */
export function GhoomMateCard(props: CardProps<UiCard['kind']>) {
  const render = RENDERERS[props.card.kind] as (props: CardProps<UiCard['kind']>) => ReactNode
  return render(props)
}
