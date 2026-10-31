import { useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button, LinkButton } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { Toast } from '../../components/Toast'
import { PEOPLE, type PersonId } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import type { PastTripDetails } from './pastTripData'
import './AlbumPage.css'

/** Read-only album of a finished trip, filterable by who's in the photo. */
export function AlbumPage({ details }: { details: PastTripDetails }) {
  const navigate = useNavigate()
  const [toast, showToast] = useToast()
  const [person, setPerson] = useState<PersonId | null>(null)
  const { trip } = details
  const photos = person ? details.photos.filter((p) => p.people.includes(person)) : details.photos

  return (
    <>
      <OnboardingLayout
        eyebrow={`${trip.name} · ${details.photoCount} photos`}
        title="Album"
        onBack={() => navigate(`past/${trip.id}`)}
        headerBg={headerBg}
        headerHeight={170}
        bodyClassName="album__body"
        actions={
          <>
            {/* TODO: real export and share links */}
            <Button variant="primary" onClick={() => showToast(`Preparing ${details.photoCount} photos to download`)}>
              Download all {details.photoCount}
            </Button>
            <LinkButton onClick={() => showToast('Album link copied')}>Share album link</LinkButton>
          </>
        }
      >
        <div className="album__filters no-scrollbar">
          <Chip selected={!person} onClick={() => setPerson(null)}>
            Everyone
          </Chip>
          {trip.members.map((id) => (
            <Chip key={id} selected={person === id} onClick={() => setPerson(person === id ? null : id)}>
              {PEOPLE[id].name}
            </Chip>
          ))}
        </div>
        <p className="album__count">
          {person ? `${PEOPLE[person].name} is in ${photos.length} of these` : `Showing ${photos.length} of ${details.photoCount}`}
        </p>
        <ul className="album__grid">
          {photos.map((p, i) => (
            <li key={`${p.src}-${i}`} className="album__photo">
              <img src={p.src} alt={`Photo with ${p.people.map((id) => PEOPLE[id].name).join(', ')}`} />
              <AvatarStack people={p.people.slice(0, 3)} size={18} overlap={6} />
            </li>
          ))}
        </ul>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
