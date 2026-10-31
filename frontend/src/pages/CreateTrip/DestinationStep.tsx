import { useState } from 'react'
import iconCheck from '../../assets/figma/icon-check-white-bold.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import iconSearch from '../../assets/figma/icon-search.svg'
import iconSparkles from '../../assets/figma/icon-sparkles-primary.svg'
import { Button } from '../../components/Button'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { TextField } from '../../components/TextField'
import { DESTINATIONS, SURPRISES, customDestinationId, destinationName, findDestination } from './createTripData'
import './DestinationStep.css'

type DestinationStepProps = {
  destination: string | null
  onPick: (id: string) => void
  onBack: () => void
  onContinue: () => void
}

export function DestinationStep({ destination, onPick, onBack, onContinue }: DestinationStepProps) {
  const [query, setQuery] = useState('')
  // Index of the last surprise shown, -1 before the first tap
  const [surpriseIndex, setSurpriseIndex] = useState(-1)
  const surprise = SURPRISES[surpriseIndex]
  const picked = findDestination(destination)

  const q = query.trim().toLowerCase()
  const matches = q
    ? DESTINATIONS.filter((d) => `${d.name} ${d.region} ${d.tag}`.toLowerCase().includes(q))
    : DESTINATIONS
  // A place we don't have a card for can still be planned (and stays visible once picked)
  const pickedCustom = destination && !picked ? destination : null
  const customId = q ? (matches.some((d) => d.name.toLowerCase() === q) ? null : customDestinationId(query)) : pickedCustom

  const surpriseUs = () => {
    // TODO: ask GhoomMate for a pick based on the squad's vibe checks
    const next = (surpriseIndex + 1) % SURPRISES.length
    setSurpriseIndex(next)
    setQuery('')
    onPick(SURPRISES[next].destination)
  }

  return (
    <OnboardingLayout
      eyebrow="New trip · Step 1 of 4"
      title="Where to?"
      subtitle="Pick a place, or let GhoomMate choose for the squad."
      step={1}
      onBack={onBack}
      bodyClassName="create-destination__body"
      actions={
        <Button variant="primary" disabled={!destination} onClick={onContinue}>
          {picked ? `Continue with ${picked.name}` : 'Continue'}
        </Button>
      }
    >
      <TextField
        label="Search destinations"
        type="search"
        placeholder="Try Spiti, Gokarna, Kasol…"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        leading={<img className="create-destination__search-icon" src={iconSearch} alt="" width={18} height={18} />}
      />

      <section className="create-surprise">
        <GhoomMateAvatar size={44} ring={2} />
        <div className="create-surprise__text">
          {surprise ? (
            <>
              <p className="create-surprise__title">How about {findDestination(surprise.destination)?.name}?</p>
              <p className="create-surprise__detail">{surprise.reason}</p>
            </>
          ) : (
            <>
              <p className="create-surprise__title">Can’t decide?</p>
              <p className="create-surprise__detail">I’ll pick a place that fits your squad’s vibe.</p>
            </>
          )}
        </div>
        <button type="button" className="create-surprise__button" onClick={surpriseUs}>
          <img src={iconSparkles} alt="" width={16} height={16} />
          {surprise ? 'Another' : 'Surprise us'}
        </button>
      </section>

      <SectionHeader title={q ? 'Results' : 'Popular right now'} />

      {customId && (
        <button
          type="button"
          className={`list-card create-destination__custom${destination === customId ? ' create-destination__custom--selected' : ''}`}
          aria-pressed={destination === customId}
          onClick={() => onPick(customId)}
        >
          <span className="create-destination__custom-icon">
            <img src={iconMapPin} alt="" width={14} height={14} />
          </span>
          <span className="create-destination__custom-text">
            Plan a trip to “{destinationName(customId)}”
            <span>GhoomMate will build it from scratch</span>
          </span>
        </button>
      )}

      {matches.length > 0 ? (
        <ul className="create-destination__grid">
          {matches.map((d) => {
            const selected = d.id === destination
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className={`create-place${selected ? ' create-place--selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => onPick(d.id)}
                >
                  <span className="create-place__cover">
                    <img src={d.photo} alt="" width={116} height={110} />
                    {d.badge && <span className="create-place__badge">{d.badge}</span>}
                    {selected && (
                      <span className="create-place__check">
                        <img src={iconCheck} alt="" width={14} height={14} />
                      </span>
                    )}
                  </span>
                  <span className="create-place__info">
                    <span className="create-place__name">{d.name}</span>
                    <span className="create-place__meta">{d.region}</span>
                    <span className="create-place__meta">{d.details}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="create-destination__empty">No cards for “{query.trim()}” yet, but you can still plan it.</p>
      )}
    </OnboardingLayout>
  )
}
