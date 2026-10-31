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
import { PEOPLE, SQUAD, type PersonId } from '../../data/people'
import { FACE_MATCH, LIBRARY, PHOTOS, PIPELINE, REEL, UPLOAD } from './photosData'
import './PhotosPage.css'

export function PhotosPage() {
  return (
    <>
      <ScreenLayout
        headerBg={headerBg}
        headerHeight={262}
        eyebrow={`${LIBRARY.photos} photos · ${LIBRARY.videos} videos`}
        title="Trip Memories"
        withBubble
      >
        <main className="screen__body photos__body">
          <FaceFilter />
          <UploadCard />
          <ReelStudio />
          <div className="photo-grid">
            {PHOTOS.map((src, i) => (
              <img key={src} src={src} alt={`Trip photo ${i + 1}`} width={116} height={110} />
            ))}
          </div>
        </main>
      </ScreenLayout>
      <GhoomMateSays>Say “make a reel” and I’ll cut one in seconds!</GhoomMateSays>
    </>
  )
}

function FaceFilter() {
  const [selected, setSelected] = useState<PersonId | null>(FACE_MATCH.person)

  return (
    <section className="face-filter">
      <div className="face-filter__header">
        <h2 className="face-filter__title">Who’s in it?</h2>
        {selected && <span className="face-filter__status">Face filter on</span>}
      </div>
      <div className="face-filter__faces">
        <button type="button" className="face">
          <span className="face__add">
            <img src={iconCameraSky} alt="" width={20} height={20} />
          </span>
          <span className="face__label face__label--bold">+ Selfie</span>
        </button>
        {SQUAD.map((id) => {
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
              <span className="face__label">{PEOPLE[id].name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function UploadCard() {
  const progress = (UPLOAD.uploaded / UPLOAD.total) * 100

  return (
    <section className="card upload-card">
      <div className="upload-card__row">
        <span className="upload-card__icon">
          <img src={iconUpload} alt="" width={22} height={22} />
        </span>
        <div className="upload-card__progress">
          <p className="upload-card__title">
            Bulk upload · {UPLOAD.uploaded} of {UPLOAD.total}
          </p>
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={UPLOAD.uploaded}
            aria-valuemin={0}
            aria-valuemax={UPLOAD.total}
          >
            <span className="progress__fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <button type="button" className="upload-card__add">
          Add
        </button>
      </div>
      <hr className="upload-card__divider" />
      <div className="upload-card__pipeline-header">
        <p className="overline">AI face pipeline</p>
        <p className="upload-card__found">
          Found {PEOPLE[FACE_MATCH.person].name} in {FACE_MATCH.count} pics
        </p>
      </div>
      <ol className="pipeline">
        {PIPELINE.map((step, i) => (
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
  const [preset, setPreset] = useState<string | null>(null)

  return (
    <section className="reel-studio">
      <img className="reel-studio__glow" src={reelGlow} alt="" width={120} height={120} />
      <div className="reel-preview">
        <img className="reel-preview__photo" src={photoReel} alt="" width={82} height={132} />
        <button type="button" className="reel-preview__play" aria-label="Play reel preview">
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
          <button type="button" className="reel-studio__generate">
            Generate reel
          </button>
          <button type="button" className="reel-studio__voice" aria-label="Describe your reel by voice">
            <img src={iconMicWhite} alt="" width={18} height={18} />
          </button>
        </div>
      </div>
    </section>
  )
}
