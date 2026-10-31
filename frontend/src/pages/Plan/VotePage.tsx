import { useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconCheck from '../../assets/figma/icon-check.svg'
import iconCheckBold from '../../assets/figma/icon-check-white-bold.svg'
import { Avatar, AvatarStack } from '../../components/Avatar'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { PEOPLE } from '../../data/people'
import { TRIP, type Vote } from './planData'
import { voteResult, type PlanState, type TalliedOption } from './planState'
import './VotePage.css'

type VotePageProps = {
  vote: Vote
  plan: PlanState
  onBack: () => void
}

export function VotePage({ vote, plan, onBack }: VotePageProps) {
  const submitted = plan.votes[vote.id]
  const [draft, setDraft] = useState(submitted)
  const [editing, setEditing] = useState(!submitted)
  // While choosing, your avatar previews on the option you’ve picked
  const result = voteResult(vote, editing ? draft : submitted)
  const othersVoted = vote.options.reduce((n, o) => n + o.votes.length, 0)

  const submit = () => {
    if (!draft) return
    // TODO: send the vote to the planning service
    plan.castVote(vote.id, draft)
    setEditing(false)
  }

  const keepVote = () => {
    setDraft(submitted)
    setEditing(false)
  }

  return (
    <OnboardingLayout
      eyebrow={`Squad vote · ${editing ? othersVoted : result.total} of ${TRIP.members.length} voted`}
      title={vote.title}
      onBack={onBack}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="plan-page__body"
      actions={
        editing ? (
          <>
            <Button variant="primary" disabled={!draft} onClick={submit}>
              {submitted ? 'Update my vote' : 'Submit vote'}
            </Button>
            {submitted && <LinkButton onClick={keepVote}>Keep my vote</LinkButton>}
          </>
        ) : (
          <>
            <Button variant="primary" onClick={onBack}>
              Back to plan
            </Button>
            <LinkButton onClick={() => setEditing(true)}>Change my vote</LinkButton>
          </>
        )
      }
    >
      <section className="card vote-question">
        <p className="vote-question__by">
          <Avatar person={vote.startedBy} size={18} />
          {PEOPLE[vote.startedBy].name} asked · {vote.started}
        </p>
        <h2 className="vote-question__title">{vote.question}</h2>
        <p className="vote-question__deadline">
          <img src={iconClock} alt="" width={14} height={14} />
          Closes {vote.closes}
          {editing && ' · Pick one'}
        </p>
      </section>

      {!editing && <VoteOutcome vote={vote} result={result} />}

      {editing ? (
        <div className="vote-options" role="radiogroup" aria-label={vote.question}>
          {result.options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={draft === option.id}
              className={`vote-option${draft === option.id ? ' vote-option--selected' : ''}`}
              onClick={() => setDraft(option.id)}
            >
              <OptionSummary option={option} />
              <span className="vote-option__radio" aria-hidden="true">
                {draft === option.id && <img src={iconCheck} alt="" width={12} height={12} />}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <ul className="vote-options" aria-label="Results">
          {result.options.map((option) => {
            const percent = result.total ? Math.round((option.voters.length / result.total) * 100) : 0
            const yours = option.id === submitted
            return (
              <li key={option.id} className={`vote-option vote-option--result${yours ? ' vote-option--selected' : ''}`}>
                <div className="vote-option__row">
                  <OptionSummary option={option} />
                  <span className="vote-option__percent">{percent}%</span>
                </div>
                <div className="vote-option__footer">
                  <div className="vote-option__bar">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  {yours && <span className="tag">You voted</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </OnboardingLayout>
  )
}

function OptionSummary({ option }: { option: TalliedOption }) {
  const count = option.voters.length
  return (
    <>
      <img className="vote-option__photo" src={option.photo} alt="" width={72} height={72} />
      <span className="vote-option__info">
        <span className="vote-option__name">{option.name}</span>
        <span className="vote-option__details">{option.details}</span>
        <span className="vote-option__price">{option.price}</span>
        <span className="vote-option__voters">
          {count > 0 && <AvatarStack people={option.voters} size={18} overlap={6} />}
          {count === 0 ? 'No votes yet' : `${count} vote${count > 1 ? 's' : ''}`}
        </span>
      </span>
    </>
  )
}

function VoteOutcome({ vote, result }: { vote: Vote; result: ReturnType<typeof voteResult> }) {
  const counts = result.options.map((o) => o.voters.length).join('–')
  const [title, text] = !result.complete
    ? [`${result.leader?.name ?? 'Nobody'} is leading`, `Waiting on ${TRIP.members.length - result.total} more before ${vote.closes}.`]
    : result.leader
      ? [`${result.leader.name} wins!`, 'Everyone’s voted, so it’s locked into the draft plan.']
      : [`It’s a tie at ${counts}`, `Settle it in the group chat before ${vote.closes}.`]

  return (
    <section className="vote-outcome" role="status">
      <span className="vote-outcome__icon">
        <img src={iconCheckBold} alt="" width={18} height={18} />
      </span>
      <span className="vote-outcome__text">
        <span className="vote-outcome__title">{title}</span>
        <span className="vote-outcome__body">Your vote’s in. {text}</span>
      </span>
    </section>
  )
}
