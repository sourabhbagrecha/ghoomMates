import type { JSX } from 'react'
import { useNavigate } from '../../hooks/navigation'
import { BookingsPage } from './BookingsPage'
import { BudgetPage } from './BudgetPage'
import { ChecklistPage } from './ChecklistPage'
import { PlanOverviewPage } from './PlanOverviewPage'
import { isVoteId, VOTES } from './planData'
import { usePlanState } from './planState'
import { VotePage } from './VotePage'
import './plan.css'

/**
 * Before-the-trip screens for the Udaipur heritage weekend. `path` is the route after `plan`:
 *   []                  Overview
 *   ['vote', <voteId>]  A squad vote (stay | sunset)
 *   ['bookings']        Stays and transport
 *   ['checklist']       Group to-dos and your packing list
 *   ['budget']          Deposits and the budget pool
 */
export function PlanRoutes({ path }: { path: string[] }): JSX.Element {
  const navigate = useNavigate()
  const plan = usePlanState()
  const backToPlan = () => navigate('plan')
  const [screen, param] = path

  if (screen === 'vote' && isVoteId(param)) {
    return <VotePage key={param} vote={VOTES[param]} plan={plan} onBack={backToPlan} />
  }
  if (screen === 'bookings') return <BookingsPage plan={plan} onBack={backToPlan} />
  if (screen === 'checklist') return <ChecklistPage plan={plan} onBack={backToPlan} />
  if (screen === 'budget') return <BudgetPage plan={plan} onBack={backToPlan} />
  return <PlanOverviewPage plan={plan} />
}
