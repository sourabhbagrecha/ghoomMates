import { useState } from 'react'
import headerBg from '../../assets/figma/photos-header-bg.svg'
import iconCameraSky from '../../assets/figma/icon-camera-sky.svg'
import iconCheck from '../../assets/figma/icon-check.svg'
import iconFilm from '../../assets/figma/icon-film.svg'
import iconMicWhite from '../../assets/figma/icon-mic-white.svg'
import iconPlay from '../../assets/figma/icon-play.svg'
import iconUpload from '../../assets/figma/icon-upload.svg'
import photoReel from '../../assets/figma/photo-reel.svg'
import reelGlow from '../../assets/figma/reel-glow.svg'
import { Avatar } from '../../components/Avatar'
import { Chip } from '../../components/Chip'
import { GhoomMateSays } from '../../components/GhoomMate'
import { ScreenLayout } from '../../components/ScreenLayout'
import { EmptyState } from '../../components/states/EmptyState'
import { Skeleton } from '../../components/states/Skeleton'
import { useVoice } from '../../components/voice/voiceContext'
import { useActiveTrip } from '../../data/activeTrip'
import { personOf, type PersonId } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { PIPELINE, REEL, type PipelineStep } from './photosData'
import './PhotosPage.css'

export function PhotosPage() {
  const navigate = useNavigate()
  const { trip, photos } = useActiveTrip()
  const total = photos?.total ?? 0

  return (
    <>
      <ScreenLayout
        headerBg={headerBg}
        headerHeight={262}
        eyebrow={photos ? `${total.toLocaleString('en-IN')} ${total === 1 ? 'photo' : 'photos'} · ${trip?.groupName ?? ''}` : 'Loading photos…'}
        title="Trip Memories"
        withBubble
      >
        <main className="screen__body photos__body">
          <FaceFilter squad={trip?.members.map((m) => m.memberId) ?? []} />
          <UploadCard total={total} uploaders={new Set(photos?.items.map((p) => p.uploadedBy.userId)).size} />
          <ReelStudio />
          {!photos ? (
            <Skeleton variant="card" height={230} />
          ) : photos.items.length ? (
            <div className="photo-grid">
              {photos.items.map((photo, i) => (
                <button key={photo.id} type="button" className="photo-grid__item" onClick={() => navigate(`trip/photos/view/${i}`)}>
                  <img src={photo.url} alt={`Trip photo ${i + 1}, from ${photo.uploadedBy.name}`} width={116} height={110} loading="lazy" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              size="compact"
              headingLevel={3}
              title="No photos yet"
              text="Upload the first ones and the whole squad gets them."
              action={{ label: 'Upload photos', icon: iconUpload, onClick: () => navigate('trip/photos/upload') }}
            />
          )}
        </main>
      </ScreenLayout>
      <GhoomMateSays>Say “make a reel” and I’ll cut one in seconds!</GhoomMateSays>
    </>
  )
}

// TODO: filter the grid once face matching runs on uploads
function FaceFilter({ squad }: { squad: PersonId[] }) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<PersonId | null>(null)

  return (
    <section className="face-filter">
      <div className="face-filter__header">
        <h2 className="face-filter__title">Who’s in it?</h2>
        {selected && <span className="face-filter__status">Face filter on</span>}
      </div>
      <div className="face-filter__faces">
        {/* Your face-match selfie lives in Edit profile */}
        <button type="button" className="face" onClick={() => navigate('profile/edit')}>
          <span className="face__add">
            <img src={iconCameraSky} alt="" width={20} height={20} />
          </span>
          <span className="face__label face__label--bold">+ Selfie</span>
        </button>
        {squad.map((id) => {
          const isSelected = id === selected
          return (
            <button
              key={id}
              type="button"
              className={`face${isSelected ? ' face--selected' : ''}`}
              aria-pressed={isSelected}
              onClick={() => setSelected(isSelected ? null : id)}
            >
              <span className="face__ring">
                <Avatar person={id} size={isSelected ? 44 : 52} />
              </span>
              <span className="face__label">{personOf(id).name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function UploadCard({ total, uploaders }: { total: number; uploaders: number }) {
  const navigate = useNavigate()
  // Uploads are ingested into the bucket; the face steps light up once the cloud pipeline lands
  const steps: PipelineStep[] = PIPELINE.map((step, i) => ({ ...step, status: i === 0 && total ? 'done' : 'pending' }))

  return (
    <section className="card upload-card">
      <div className="upload-card__row">
        <span className="upload-card__icon">
          <img src={iconUpload} alt="" width={22} height={22} />
        </span>
        <div className="upload-card__progress">
          <p className="upload-card__title">
            Squad album · {total} {total === 1 ? 'photo' : 'photos'}
          </p>
          <p className="upload-card__found">
            {total ? `From ${uploaders} ${uploaders === 1 ? 'mate' : 'mates'} · stored in the cloud` : 'Add photos from your phone'}
          </p>
        </div>
        <button type="button" className="upload-card__add" onClick={() => navigate('trip/photos/upload')}>
          Add
        </button>
      </div>
      <hr className="upload-card__divider" />
      <div className="upload-card__pipeline-header">
        <p className="overline">AI face pipeline</p>
        <p className="upload-card__found">Face tagging coming soon</p>
      </div>
      <ol className="pipeline">
        {steps.map((step, i) => (
          <li key={step.label} className="pipeline__item">
            {i > 0 && (
              <span
                className={`pipeline__connector${step.status === 'pending' ? '' : ' pipeline__connector--done'}`}
                aria-hidden="true"
              />
            )}
            <div className={`pipeline__step pipeline__step--${step.status}`}>
              <span className="pipeline__badge">
                {step.status === 'done' ? <img src={iconCheck} alt="" width={12} height={12} /> : i + 1}
              </span>
              <span className="pipeline__label">{step.label}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ReelStudio() {
  const navigate = useNavigate()
  const voice = useVoice()
  const [preset, setPreset] = useState<string | null>(null)

  return (
    <section className="reel-studio">
      <img className="reel-studio__glow" src={reelGlow} alt="" width={120} height={120} />
      <div className="reel-preview">
        <img className="reel-preview__photo" src={photoReel} alt="" width={82} height={132} />
        <button type="button" className="reel-preview__play" aria-label="Play reel preview" onClick={() => navigate('trip/photos/reel')}>
          <img src={iconPlay} alt="" width={12} height={12} />
        </button>
        <span className="reel-preview__duration">{REEL.duration}</span>
      </div>
      <div className="reel-studio__controls">
        <div className="reel-studio__header">
          <img src={iconFilm} alt="" width={14} height={14} />
          <p className="overline reel-studio__overline">Reel studio</p>
        </div>
        <p className="reel-studio__prompt">{REEL.prompt}</p>
        <div className="reel-studio__presets">
          {REEL.presets.map((p) => (
            <Chip key={p} variant="onDark" selected={p === preset} onClick={() => setPreset(p === preset ? null : p)}>
              {p}
            </Chip>
          ))}
        </div>
        <div className="reel-studio__actions">
          {/* GhoomMate cuts the reel and shows its progress in the sheet */}
          <button
            type="button"
            className="reel-studio__generate"
            onClick={() => voice.open(preset ? `Make a ${preset.toLowerCase()} reel` : 'Make a reel of our trip')}
          >
            Generate reel
          </button>
          <button type="button" className="reel-studio__voice" aria-label="Describe your reel by voice" onClick={() => voice.open()}>
            <img src={iconMicWhite} alt="" width={18} height={18} />
          </button>
        </div>
      </div>
    </section>
  )
}
