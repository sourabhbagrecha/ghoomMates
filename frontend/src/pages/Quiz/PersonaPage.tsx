import { useState } from 'react'
import { AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { VibeChart } from '../../components/VibeChart'
import { SQUAD } from '../../data/people'
import { SQUAD_VIBE, VIBE_AXES, vibeMatch, type VibeScores } from '../../data/vibe'
import { personaFor } from './quizData'
import './QuizPages.css'

const GROUP = 'Goa Gang'

type PersonaPageProps = {
  scores: VibeScores
  onBack: () => void
  onDone: () => void
}

export function PersonaPage({ scores, onBack, onDone }: PersonaPageProps) {
  const [compare, setCompare] = useState(false)
  const persona = personaFor(scores)
  const match = vibeMatch(scores, SQUAD_VIBE)
  const label = (id: string) => VIBE_AXES.find((a) => a.id === id)?.label

  return (
    <OnboardingLayout
      eyebrow="Your travel persona"
      title="Meet your vibe"
      onBack={onBack}
      bodyClassName="quiz__body"
      actions={
        <Button variant="primary" onClick={onDone}>
          Continue
        </Button>
      }
    >
      <section className="card persona">
        <p className="overline">You're</p>
        <h2 className="persona__name">{persona.name}</h2>
        <p className="persona__tagline">{persona.tagline}</p>
        <VibeChart
          series={[
            ...(compare ? [{ scores: SQUAD_VIBE, color: 'var(--color-sky)', fillOpacity: 0.28 }] : []),
            { scores, color: 'var(--color-amber)', fillOpacity: compare ? 0.15 : 0.3, dots: true },
          ]}
          width={260}
          label={`Your vibe chart${compare ? ` compared with the ${GROUP}` : ''}`}
        />
        <div className="persona__footer">
          <div className="persona__traits">
            {persona.top.map((id) => (
              <span key={id} className="tag">
                {label(id)}
              </span>
            ))}
          </div>
          <Chip selected={compare} onClick={() => setCompare((c) => !c)}>
            Compare squad
          </Chip>
        </div>
        {compare && (
          <div className="persona__legend">
            <span>
              <span className="persona__swatch persona__swatch--squad" />
              {GROUP}
            </span>
            <span>
              <span className="persona__swatch persona__swatch--you" />
              You
            </span>
          </div>
        )}
      </section>

      <section className="list-card persona__match">
        <AvatarStack people={SQUAD} size={26} overlap={9} />
        <div className="persona__match-text">
          <p>{GROUP}</p>
          <span>Blended into the squad spiderweb</span>
        </div>
        <span className="persona__match-pill">{match}% match</span>
      </section>
    </OnboardingLayout>
  )
}
