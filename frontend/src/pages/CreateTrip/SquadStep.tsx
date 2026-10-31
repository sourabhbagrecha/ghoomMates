import { useEffect, useRef, useState } from 'react'
import iconCheck from '../../assets/figma/icon-check.svg'
import iconContact from '../../assets/figma/icon-contact-primary.svg'
import iconCopy from '../../assets/figma/icon-copy-white.svg'
import iconLink from '../../assets/figma/icon-link-primary.svg'
import iconQr from '../../assets/figma/icon-qr-primary.svg'
import { Avatar, AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { PEOPLE, type PersonId } from '../../data/people'
import { INVITE_HOST, MATES, slugify, type TripDetails } from './createTripData'
import './SquadStep.css'

type SquadStepProps = {
  trip: TripDetails
  onChange: (patch: Partial<TripDetails>) => void
  onBack: () => void
  onContinue: () => void
}

export function SquadStep({ trip, onChange, onBack, onContinue }: SquadStepProps) {
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const copiedTimer = useRef<number>(undefined)
  const link = `${INVITE_HOST}${slugify(trip.name)}`
  const mateCount = trip.mates.length

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const toggleMate = (id: PersonId) =>
    onChange({ mates: trip.mates.includes(id) ? trip.mates.filter((m) => m !== id) : [...trip.mates, id] })

  const copyLink = () => {
    // TODO: real invite links from the trips service
    navigator.clipboard?.writeText(`https://${link}`).catch(() => {})
    setCopied(true)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  // TODO: render a real QR code for the invite link
  const showQr = () => setNotice('QR code ready. Mates can scan it from your screen.')

  // TODO: open the native contacts picker
  const pickContacts = () => setNotice('Contacts are coming soon. Share the link for now!')

  return (
    <OnboardingLayout
      eyebrow="New trip · Step 3 of 4"
      title="Who’s coming?"
      subtitle="Name the trip and add your mates. You’re always in."
      step={3}
      onBack={onBack}
      bodyClassName="create-squad__body"
      actions={
        <Button variant="primary" disabled={!trip.name.trim()} onClick={onContinue}>
          Continue
        </Button>
      }
    >
      <TextField
        label="Trip name"
        placeholder="Manali Snow Escape"
        maxLength={24}
        value={trip.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <TextField
        label="Group name"
        placeholder="Mountain Crew"
        maxLength={24}
        value={trip.group}
        onChange={(e) => onChange({ group: e.target.value })}
      />

      <section className="card create-mates" aria-labelledby="create-mates-title">
        <div className="create-mates__header">
          <h2 id="create-mates-title" className="create-mates__title">
            Your squad
          </h2>
          <span className="create-mates__count">
            <AvatarStack people={['you', ...trip.mates]} size={18} overlap={6} />
            You + {mateCount} {mateCount === 1 ? 'mate' : 'mates'}
          </span>
        </div>
        <ul className="create-mates__list">
          <li className="create-mate">
            <Avatar person="you" size={34} />
            <span className="create-mate__text">
              You
              <span>Organiser</span>
            </span>
            <span className="tag">Always in</span>
          </li>
          {MATES.map(({ id, note }) => {
            const added = trip.mates.includes(id)
            return (
              <li key={id}>
                <button
                  type="button"
                  className="create-mate"
                  aria-pressed={added}
                  aria-label={`${PEOPLE[id].name}, ${added ? 'added' : 'not added'}`}
                  onClick={() => toggleMate(id)}
                >
                  <Avatar person={id} size={34} />
                  <span className="create-mate__text">
                    {PEOPLE[id].name}
                    <span>{note}</span>
                  </span>
                  <span className={`create-mate__pill${added ? ' create-mate__pill--added' : ''}`}>
                    {added && <img src={iconCheck} alt="" width={12} height={12} />}
                    {added ? 'Added' : 'Add'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card create-invite" aria-label="Invite more mates">
        <p className="overline">Invite anyone else</p>
        <div className="create-invite__link">
          <span className="create-invite__link-icon">
            <img src={iconLink} alt="" width={18} height={18} />
          </span>
          <span className="create-invite__url">{link}</span>
          <button
            type="button"
            className="pill-button create-invite__copy"
            onClick={copyLink}
          >
            <img src={copied ? iconCheck : iconCopy} alt="" width={copied ? 12 : 14} height={copied ? 12 : 14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="create-invite__options">
          <button
            type="button"
            className="create-invite__option"
            onClick={showQr}
          >
            <img src={iconQr} alt="" width={18} height={18} />
            Show QR
          </button>
          <button
            type="button"
            className="create-invite__option"
            onClick={pickContacts}
          >
            <img src={iconContact} alt="" width={18} height={18} />
            From contacts
          </button>
        </div>
        <p className="create-invite__notice" role="status">
          {copied ? 'Link copied. Paste it in your group chat.' : notice}
        </p>
      </section>
    </OnboardingLayout>
  )
}
