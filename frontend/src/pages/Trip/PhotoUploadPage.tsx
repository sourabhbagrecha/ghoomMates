import { useEffect, useRef, useState } from 'react'
import headerBg from '../../assets/figma/expenses-header-bg.svg'
import iconCheckSuccess from '../../assets/figma/icon-check-success.svg'
import iconCheck from '../../assets/figma/icon-check.svg'
import iconUpload from '../../assets/figma/icon-upload.svg'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { activeTrip, useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { tripsApi, uploadImage } from '../../services/tripsService'
import { UPLOAD_STEPS } from './tripDetailData'
import './PhotoUploadPage.css'

type Phase = 'pick' | 'uploading' | 'done'
type Picked = { file: File; preview: string }

/** Uploads in flight at once */
const PARALLEL = 3

export function PhotoUploadPage() {
  const navigate = useNavigate()
  const { trip } = useActiveTrip()
  const fileInput = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<Picked[]>([])
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [phase, setPhase] = useState<Phase>('pick')
  const [uploaded, setUploaded] = useState(0)
  const [failed, setFailed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Free the previews when leaving the screen
  const previews = useRef<string[]>([])
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), [])

  const count = selected.size
  const allSelected = photos.length > 0 && count === photos.length
  const label = `${count} photo${count === 1 ? '' : 's'}`

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const addFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
    if (!images.length) return
    const picked = images.map((file) => ({ file, preview: URL.createObjectURL(file) }))
    previews.current.push(...picked.map((p) => p.preview))
    setSelected((prev) => new Set([...prev, ...picked.map((_, i) => photos.length + i)]))
    setPhotos((prev) => [...prev, ...picked])
  }

  // Each photo goes browser → bucket on a signed URL, then the batch is registered with the trip
  const upload = async () => {
    if (!trip) return
    const queue = [...selected].sort((a, b) => a - b).map((i) => photos[i].file)
    setPhase('uploading')
    setUploaded(0)
    setFailed(0)
    setError(null)
    const done: { key: string; width?: number; height?: number }[] = []
    let next = 0
    const worker = async () => {
      while (next < queue.length) {
        const file = queue[next++]
        try {
          done.push(await uploadImage(trip.id, 'photo', file))
          setUploaded((n) => n + 1)
        } catch {
          setFailed((n) => n + 1)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker))
    try {
      if (done.length) await tripsApi.addPhotos(trip.id, done)
      void activeTrip.loadPhotos()
      void activeTrip.loadTrips()
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the photos to the album')
      setPhase('pick')
    }
  }

  const shownCount = phase === 'pick' ? count : uploaded + failed
  const total = count

  return (
    <OnboardingLayout
      eyebrow={`${trip?.groupName ?? 'Trip'} · Upload`}
      title="Add photos"
      subtitle="They go straight to the squad’s cloud album."
      onBack={() => navigate('trip/photos')}
      headerBg={headerBg}
      headerHeight={210}
      bodyClassName="upload__body"
      actions={
        phase === 'pick' ? (
          count ? (
            <>
              <Button variant="primary" disabled={!trip} onClick={() => void upload()}>
                Upload {label}
              </Button>
              <LinkButton onClick={() => fileInput.current?.click()}>Add more from device</LinkButton>
            </>
          ) : (
            <Button variant="primary" onClick={() => fileInput.current?.click()}>
              Pick photos from device
            </Button>
          )
        ) : phase === 'uploading' ? (
          <Button variant="outline" disabled>
            Uploading…
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
          addFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />

      {error && (
        <p className="upload__error" role="alert">
          {error}
        </p>
      )}

      {phase === 'pick' ? (
        photos.length > 0 && (
          <section className="card upload__picker">
            <div className="upload__picker-header">
              <p className="overline">From your device</p>
              <button
                type="button"
                className="text-link"
                onClick={() => setSelected(allSelected ? new Set() : new Set(photos.map((_, i) => i)))}
              >
                {allSelected ? 'Clear' : 'Select all'}
              </button>
            </div>
            <div className="upload__grid">
              {photos.map(({ preview }, i) => {
                const isSelected = selected.has(i)
                return (
                  <button
                    key={preview}
                    type="button"
                    className={`upload__tile${isSelected ? ' upload__tile--selected' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => toggle(i)}
                  >
                    <img src={preview} alt="" />
                    <span className="upload__check">{isSelected && <img src={iconCheck} alt="" width={12} height={12} />}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      ) : (
        <section className="card upload__status">
          <div className="upload__status-row">
            <span className={`upload__status-icon${phase === 'done' ? ' upload__status-icon--done' : ''}`}>
              <img
                src={phase === 'done' ? iconCheckSuccess : iconUpload}
                alt=""
                width={phase === 'done' ? 20 : 22}
                height={phase === 'done' ? 20 : 22}
              />
            </span>
            <div className="upload__status-text">
              <p className="upload__status-title">
                {phase === 'done' ? `${uploaded} photo${uploaded === 1 ? '' : 's'} added` : `Uploading · ${shownCount} of ${total}`}
              </p>
              <div
                className="upload__progress"
                role="progressbar"
                aria-label="Upload progress"
                aria-valuenow={shownCount}
                aria-valuemin={0}
                aria-valuemax={total}
              >
                <span className="upload__progress-fill" style={{ width: `${total ? (shownCount / total) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
          <hr className="upload__divider" />
          <div className="upload__pipeline-header">
            <p className="overline">AI face pipeline</p>
            <p className="upload__found">Face tagging coming soon</p>
          </div>
          <ol className="upload__pipeline">
            {UPLOAD_STEPS.map((name, i) => {
              const status = i === 0 ? (phase === 'done' ? 'done' : 'current') : 'pending'
              return (
                <li key={name} className="upload__pipeline-item">
                  {i > 0 && (
                    <span className={`upload__connector${status === 'pending' ? '' : ' upload__connector--done'}`} aria-hidden="true" />
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
          {phase === 'done' && (
            <p className="upload__done-note">
              {failed ? `${failed} couldn’t upload. Try those again. ` : ''}Your photos are in the squad album.
            </p>
          )}
        </section>
      )}
    </OnboardingLayout>
  )
}
