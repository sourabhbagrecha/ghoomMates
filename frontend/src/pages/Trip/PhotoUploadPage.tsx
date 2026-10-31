import { useEffect, useRef, useState } from 'react'
import headerBg from '../../assets/figma/expenses-header-bg.svg'
import iconCheckSuccess from '../../assets/figma/icon-check-success.svg'
import iconCheck from '../../assets/figma/icon-check.svg'
import iconUpload from '../../assets/figma/icon-upload.svg'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { PEOPLE, SQUAD } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { CAMERA_ROLL, PHOTO_DETAILS, UPLOAD_STEPS } from './tripDetailData'
import { listNames } from './tripFormat'
import './PhotoUploadPage.css'

type Phase = 'pick' | 'uploading' | 'done'

/** Ticks per pipeline step after the upload finishes */
const STEP_TICKS = 6

export function PhotoUploadPage() {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<string[]>(CAMERA_ROLL)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [phase, setPhase] = useState<Phase>('pick')
  const [tick, setTick] = useState(0)

  const count = selected.size
  const uploaded = Math.min(tick, count)
  const step = tick < count ? 0 : 1 + Math.floor((tick - count) / STEP_TICKS)
  const finished = phase === 'uploading' && step >= UPLOAD_STEPS.length
  const allSelected = count === photos.length

  // TODO: real upload + face pipeline; this only simulates progress
  useEffect(() => {
    if (phase !== 'uploading' || finished) return
    const id = window.setInterval(() => setTick((t) => t + 1), 150)
    return () => window.clearInterval(id)
  }, [phase, finished])

  const shownPhase: Phase = finished ? 'done' : phase

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  // Who GhoomMate "found" in the uploaded photos, most-seen first
  const found = SQUAD.map((id) => ({
    id,
    count: [...selected].filter((i) => PHOTO_DETAILS[i]?.people.includes(id)).length,
  }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)

  const label = `${count} photo${count === 1 ? '' : 's'}`

  return (
    <OnboardingLayout
      eyebrow="Trip Memories · Upload"
      title="Add photos"
      subtitle="GhoomMate tags faces and sorts them for the squad."
      onBack={() => navigate('trip/photos')}
      headerBg={headerBg}
      headerHeight={210}
      bodyClassName="upload__body"
      actions={
        shownPhase === 'pick' ? (
          <>
            <Button variant="primary" disabled={count === 0} onClick={() => setPhase('uploading')}>
              {count ? `Upload ${label}` : 'Pick photos to upload'}
            </Button>
            <LinkButton onClick={() => fileInput.current?.click()}>Pick from device</LinkButton>
          </>
        ) : shownPhase === 'uploading' ? (
          <Button variant="outline" onClick={() => navigate('trip/photos')}>
            Keep uploading in background
          </Button>
        ) : (
          <Button variant="primary" onClick={() => navigate('trip/photos')}>
            Back to photos
          </Button>
        )
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const urls = [...(e.target.files ?? [])].map((f) => URL.createObjectURL(f))
          if (!urls.length) return
          setSelected((prev) => new Set([...prev, ...urls.map((_, i) => photos.length + i)]))
          setPhotos((prev) => [...prev, ...urls])
        }}
      />

      {shownPhase === 'pick' ? (
        <section className="card upload__picker">
          <div className="upload__picker-header">
            <p className="overline">Camera roll · Today</p>
            <button
              type="button"
              className="text-link"
              onClick={() => setSelected(allSelected ? new Set() : new Set(photos.map((_, i) => i)))}
            >
              {allSelected ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div className="upload__grid">
            {photos.map((src, i) => {
              const isSelected = selected.has(i)
              return (
                <button
                  key={src}
                  type="button"
                  className={`upload__tile${isSelected ? ' upload__tile--selected' : ''}`}
                  aria-pressed={isSelected}
                  aria-label={`Photo ${i + 1}`}
                  onClick={() => toggle(i)}
                >
                  <img src={src} alt="" />
                  <span className="upload__check">{isSelected && <img src={iconCheck} alt="" width={12} height={12} />}</span>
                </button>
              )
            })}
          </div>
        </section>
      ) : (
        <section className="card upload__status">
          <div className="upload__status-row">
            <span className={`upload__status-icon${shownPhase === 'done' ? ' upload__status-icon--done' : ''}`}>
              <img
                src={shownPhase === 'done' ? iconCheckSuccess : iconUpload}
                alt=""
                width={shownPhase === 'done' ? 20 : 22}
                height={shownPhase === 'done' ? 20 : 22}
              />
            </span>
            <div className="upload__status-text">
              <p className="upload__status-title">
                {shownPhase === 'done' ? `${label} added` : `Uploading · ${uploaded} of ${count}`}
              </p>
              <div
                className="upload__progress"
                role="progressbar"
                aria-label="Upload progress"
                aria-valuenow={uploaded}
                aria-valuemin={0}
                aria-valuemax={count}
              >
                <span className="upload__progress-fill" style={{ width: `${(uploaded / count) * 100}%` }} />
              </div>
            </div>
          </div>
          <hr className="upload__divider" />
          <div className="upload__pipeline-header">
            <p className="overline">AI face pipeline</p>
            {shownPhase === 'done' && found.length > 0 && (
              <p className="upload__found">
                Found {listNames(found.map((f) => `${PEOPLE[f.id].name} in ${f.count}`))}
              </p>
            )}
          </div>
          <ol className="upload__pipeline">
            {UPLOAD_STEPS.map((name, i) => {
              const status = i < step ? 'done' : i === step ? 'current' : 'pending'
              return (
                <li key={name} className="upload__pipeline-item">
                  {i > 0 && (
                    <span
                      className={`upload__connector${status === 'pending' ? '' : ' upload__connector--done'}`}
                      aria-hidden="true"
                    />
                  )}
                  <div className={`upload__step upload__step--${status}`}>
                    <span className="upload__badge">
                      {status === 'done' ? <img src={iconCheck} alt="" width={12} height={12} /> : i + 1}
                    </span>
                    <span className="upload__step-label">{name}</span>
                  </div>
                </li>
              )
            })}
          </ol>
          {shownPhase === 'done' && <p className="upload__done-note">Your photos are in the squad album, sorted by face.</p>}
        </section>
      )}
    </OnboardingLayout>
  )
}
