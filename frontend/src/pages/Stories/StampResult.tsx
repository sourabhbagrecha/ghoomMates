import { Avatar } from '../../components/Avatar'
import { Button, LinkButton } from '../../components/Button'
import iconCheck from '../../assets/figma/icon-check-white-bold.svg'
import { PersonToggle } from '../Trip/PersonToggle'
import { scoreLocally, type StampResult as Stamped, type Story } from '../../services/storiesService'
import type { Copy } from './storiesData'
import { StampSeal } from './StampSeal'
import './StampResult.css'

type Mate = { memberId: string; userId: string }

type StampResultProps = {
  story: Story
  copy: Copy
  answers: number[]
  /** Everyone else on the trip, who can be stamped along with you */
  mates: Mate[]
  /** Mates who listened with you (user ids) */
  listeners: string[]
  saving: boolean
  /** The passport's answer once you have stamped it */
  stamped: Stamped | null
  onToggle: (userId: string) => void
  onStamp: () => void
  onPassport: () => void
  onAnother: () => void
}

/** After the quiz: who listened along, the stamp coming down on the passport, and where the squad stands */
export function StampResult({ story, copy, answers, mates, listeners, saving, stamped, onToggle, onStamp, onPassport, onAnother }: StampResultProps) {
  if (!stamped) {
    const round = scoreLocally(story.quiz, answers)
    return (
      <section className="card stamp-card" aria-labelledby="stamp-title">
        <StampSeal siteName={story.siteName} grade={round.grade} score={round.score} total={round.total} size={148} empty />
        <h2 id="stamp-title" className="stamp-card__title">
          {copy.yourScore(round.score, round.total)}
        </h2>

        {mates.length > 0 && (
          <div className="stamp-card__listeners">
            <p className="overline">{copy.whoListened}</p>
            <p className="stamp-card__hint">{copy.whoListenedHint}</p>
            <div className="stamp-card__row">
              {mates.map((mate) => (
                <PersonToggle
                  key={mate.userId}
                  person={mate.memberId}
                  selected={listeners.includes(mate.userId)}
                  label="Listened"
                  onClick={() => onToggle(mate.userId)}
                />
              ))}
            </div>
          </div>
        )}

        <Button variant="highlight" className="stamp-card__cta" disabled={saving} onClick={onStamp}>
          {saving ? copy.stamping : copy.stampIt}
        </Button>
      </section>
    )
  }

  const best = stamped.best
  // Who the passport desk actually stamped along with you, by name
  const stampedNames = stamped.stampedWith > 0
    ? (stamped.squad?.members ?? []).filter((m) => m.stamped && listeners.includes(m.userId)).map((m) => m.name.split(' ')[0]).join(', ')
    : ''
  return (
    <section className="card stamp-card stamp-card--done" aria-labelledby="stamp-title">
      <StampSeal siteName={story.siteName} grade={best.grade} score={best.score} total={best.total} size={188} animate />
      <h2 id="stamp-title" className="stamp-card__title">
        {copy.grade[best.grade].title}
      </h2>
      <p className="stamp-card__line">{copy.grade[best.grade].line}</p>
      <p className="stamp-card__count">{stamped.firstTime ? copy.firstStamp : copy.bestKept}</p>
      <p className="stamp-card__hint">{copy.passportCount(stamped.passport.stamped, stamped.passport.totalSites)}</p>
      {stamped.savedOnPhone && <p className="stamp-card__note">{copy.savedOnPhone}</p>}

      {stamped.squad && (
        <div className="squad-stamps">
          <p className="squad-stamps__count">{copy.squadCount(stamped.squad.stamped, stamped.squad.total)}</p>
          <ul className="squad-stamps__list">
            {stamped.squad.members.map((member) => (
              <li key={member.memberId} className={member.stamped ? 'squad-stamps__person squad-stamps__person--stamped' : 'squad-stamps__person'}>
                <span className="squad-stamps__avatar">
                  <Avatar person={member.memberId} size={42} />
                  {member.stamped && (
                    <span className="squad-stamps__check" aria-label="Has this stamp">
                      <img src={iconCheck} alt="" width={10} height={10} />
                    </span>
                  )}
                </span>
                <span className="squad-stamps__name">{member.name.split(' ')[0]}</span>
              </li>
            ))}
          </ul>
          {stampedNames && <p className="stamp-card__hint">{copy.stampedWith(stampedNames)}</p>}
        </div>
      )}

      <Button variant="primary" onClick={onPassport}>
        {copy.openPassport}
      </Button>
      <LinkButton onClick={onAnother}>{copy.anotherStory}</LinkButton>
    </section>
  )
}
