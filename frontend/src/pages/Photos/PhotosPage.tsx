import { useState } from 'react'
import headerBg from '../../assets/figma/photos-header-bg.svg'
import iconCheck from '../../assets/figma/icon-check.svg'
import iconFilm from '../../assets/figma/icon-film.svg'
import iconMicWhite from '../../assets/figma/icon-mic-white.svg'
import iconPlay from '../../assets/figma/icon-play.svg'
import iconScanFace from '../../assets/figma/icon-scan-face-primary-20.svg'
import iconUpload from '../../assets/figma/icon-upload.svg'
import reelGlow from '../../assets/figma/reel-glow.svg'
import { Chip } from '../../components/Chip'
import { GhoomMateSays } from '../../components/GhoomMate'
import { ScreenLayout } from '../../components/ScreenLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { EmptyState } from '../../components/states/EmptyState'
import { Skeleton } from '../../components/states/Skeleton'
import { useVoice } from '../../components/voice/voiceContext'
import { Toast } from '../../components/Toast'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { reelsApi } from '../../services/reelsService'
import { ApiRequestError, tripsApi, type FaceSummary, type TripPhoto } from '../../services/tripsService'
import { MiniatureEntry } from '../Miniature/MiniatureEntry'
import { PastReels } from '../Reel/PastReels'
import { useTripReels } from '../Reel/useTripReels'
import { useTripStore } from '../Trip/tripStore'
import { useProfileStore } from '../Profile/profileStore'
import { faceSummaryOf, hasMatched, markMatched, setMatchedIds, sizeSelfie, useFacePolling, useMatchedIds } from './faceSearch'
import { PIPELINE, REEL, type PipelineStep } from './photosData'
import './PhotosPage.css'

// Reel studio only shows once the album has enough photos to cut a reel from
const REEL_MIN_PHOTOS = 4

export function PhotosPage() {
  const navigate = useNavigate()
  const { trip, photos } = useActiveTrip()
  const total = photos?.total ?? 0
  const summary = faceSummaryOf(photos)
  const [toast, showToast] = useToast()
  // Photo ids found by the face filter, or null while it is off
  const matchedIds = useMatchedIds()
  const [searching, setSearching] = useState(false)
  const { reels } = useTripReels(trip?.id ?? null)
  useFacePolling(summary?.pending ?? 0)

  const visible = (photos?.items ?? []).map((photo, index) => ({ photo, index })).filter(({ photo }) => !matchedIds || matchedIds.has(photo.id))

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
          <FaceFilter
            tripId={trip?.id ?? null}
            total={total}
            matchCount={matchedIds ? visible.length : null}
            searching={searching}
            onSearching={setSearching}
            onMatches={setMatchedIds}
            showToast={showToast}
          />
          <UploadCard
            total={total}
            uploaders={new Set(photos?.items.map((p) => p.uploadedBy.userId)).size}
            summary={summary}
            matched={hasMatched(trip?.id ?? null)}
          />
          <MiniatureEntry />
          {!photos ? (
            <Skeleton variant="card" height={230} />
          ) : matchedIds && !visible.length ? (
            <EmptyState
              size="compact"
              headingLevel={3}
              title="No photos of you yet"
              text="We couldn’t spot you in the squad’s photos. Try a clearer selfie, or check back as more get added."
              action={{ label: 'Show all photos', onClick: () => setMatchedIds(null) }}
            />
          ) : photos.items.length ? (
            <section className="photo-gallery">
              <SectionHeader
                title={matchedIds ? 'Photos of you' : 'All photos'}
                action={
                  matchedIds ? (
                    <button type="button" className="text-link" onClick={() => setMatchedIds(null)}>
                      Show all {total}
                    </button>
                  ) : (
                    <span className="photo-gallery__count">{total}</span>
                  )
                }
              />
              <div className="photo-grid" aria-busy={searching}>
                {visible.map(({ photo, index: i }) => (
                  <button key={photo.id} type="button" className="photo-grid__item" onClick={() => navigate(`trip/photos/view/${i}`)}>
                    <img src={photo.url} alt={`Trip photo ${i + 1}, from ${photo.uploadedBy.name}`} width={116} height={116} loading="lazy" />
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <EmptyState
              size="compact"
              headingLevel={3}
              title="No photos yet"
              text="Upload the first ones and the whole squad gets them."
              action={{ label: 'Upload photos', icon: iconUpload, onClick: () => navigate('trip/photos/upload') }}
            />
          )}
          {trip && photos && total >= REEL_MIN_PHOTOS && <ReelStudio tripId={trip.id} photos={photos.items} showToast={showToast} />}
          {/* Appears once the list is in, so trips without reels never flash a placeholder */}
          <PastReels reels={reels ?? []} onOpen={(reel) => navigate(`trip/photos/reel?id=${reel.id}`)} />
        </main>
      </ScreenLayout>
      <Toast message={toast} />
      <GhoomMateSays>Say “make a reel” and I’ll cut one in seconds!</GhoomMateSays>
    </>
  )
}

type FaceFilterProps = {
  tripId: string | null
  total: number
  /** Photos you were found in, or null while the filter is off */
  matchCount: number | null
  searching: boolean
  onSearching: (searching: boolean) => void
  onMatches: (ids: Set<string> | null) => void
  showToast: (message: string) => void
}

const SEARCH_ERRORS: Record<string, string> = {
  NO_FACE: 'We couldn’t see a face in your selfie, try another',
  INVALID_IMAGE: 'We couldn’t read your selfie, try another',
  SELFIE_TOO_LARGE: 'Your selfie is too large, try another',
  FACE_SEARCH_DISABLED: 'Face search isn’t switched on yet',
  FACE_SEARCH_UNAVAILABLE: 'Face search is busy right now, try again in a minute',
}

function FaceFilter({ tripId, total, matchCount, searching, onSearching, onMatches, showToast }: FaceFilterProps) {
  const navigate = useNavigate()
  const profile = useProfileStore()
  // Only your own selfie is ever sent to the server, so only you can be matched
  const selfie = profile.selfie ?? (profile.photo?.startsWith('data:') ? profile.photo : null)
  const active = matchCount !== null

  const findMe = async () => {
    if (searching) return
    if (active) {
      onMatches(null)
      return
    }
    if (!tripId || !selfie) return
    onSearching(true)
    try {
      const { matches } = await tripsApi.findMe(tripId, [await sizeSelfie(selfie)])
      markMatched(tripId)
      onMatches(new Set(matches.map((m) => m.photoId)))
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : ''
      showToast(SEARCH_ERRORS[code] ?? 'Couldn’t search the photos right now, try again')
    } finally {
      onSearching(false)
    }
  }

  const photosLabel = `${total} ${total === 1 ? 'photo' : 'photos'}`
  const [title, text, action] = searching
    ? ['Finding you…', `Checking every face in ${photosLabel}`, 'Searching…']
    : active
      ? [matchCount ? `You’re in ${matchCount} of ${photosLabel}` : 'Couldn’t spot you yet', 'Showing only photos with you', 'Show all']
      : selfie
        ? ['Find photos of you', total ? `We’ll match your selfie to every face in ${photosLabel}` : 'Works once the squad adds photos', 'Find me']
        : ['Find photos of you', 'Add a selfie and we’ll spot you in the album', 'Add selfie']

  return (
    <section className={`face-filter${active ? ' face-filter--active' : ''}`} aria-busy={searching}>
      {/* Your face-match selfie lives in Edit profile */}
      <span className="face-filter__face">
        {selfie ? <img className="face-filter__selfie" src={selfie} alt="Your selfie" width={44} height={44} /> : <img src={iconScanFace} alt="" width={20} height={20} />}
      </span>
      <div className="face-filter__text" role="status">
        <h2 className="face-filter__title">{title}</h2>
        <p className="face-filter__hint">{text}</p>
      </div>
      <button
        type="button"
        className="face-filter__action"
        aria-pressed={selfie ? active : undefined}
        disabled={searching || (!!selfie && !active && !total)}
        onClick={() => (selfie ? void findMe() : navigate('profile/edit'))}
      >
        {action}
      </button>
    </section>
  )
}

function faceLine(total: number, summary: FaceSummary | null) {
  if (!total || !summary) return 'Add photos to start tagging faces'
  if (summary.pending > 0) return `Tagging faces · ${total - summary.pending} of ${total} ${total === 1 ? 'photo' : 'photos'}`
  if (summary.faces > 0) {
    const photoCount = summary.indexed
    return `${summary.faces} ${summary.faces === 1 ? 'face' : 'faces'} found in ${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}${summary.failed ? ` · ${summary.failed} couldn’t be read` : ''}`
  }
  return summary.failed ? 'Couldn’t read faces in some photos' : 'No faces found in these photos'
}

function UploadCard({ total, uploaders, summary, matched }: { total: number; uploaders: number; summary: FaceSummary | null; matched: boolean }) {
  const navigate = useNavigate()
  // Ingest is done once photos are stored; Faces and Embed follow the cloud pipeline, Match follows a find-me search
  const processing = !!total && !!summary && summary.pending > 0
  const processed = !!total && !!summary && summary.pending === 0
  const steps: PipelineStep[] = PIPELINE.map((step, i): PipelineStep => {
    if (i === 0) return { ...step, status: total ? 'done' : 'pending' }
    if (i === 1 || i === 2) return { ...step, status: processed ? 'done' : processing ? 'current' : 'pending' }
    if (i === 3) return { ...step, status: matched ? 'done' : 'pending' }
    return { ...step, status: 'pending' }
  })

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
        <p className="upload-card__found" role="status">{faceLine(total, summary)}</p>
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

function ReelStudio({ tripId, photos, showToast }: { tripId: string; photos: TripPhoto[]; showToast: (message: string) => void }) {
  const navigate = useNavigate()
  const voice = useVoice()
  const { reelPicks } = useTripStore()
  const [prompt, setPrompt] = useState('')
  const [cutting, setCutting] = useState(false)
  // Photos picked with "Add to reel" in the viewer (indexes into the album)
  const picked = reelPicks.map((i) => photos[i]?.id).filter((id): id is string => !!id)
  const usePicks = picked.length >= 2

  const generate = async () => {
    const text = prompt.trim()
    if (text.length < 3) {
      showToast('Tell GhoomMate what kind of reel you want, or pick a style')
      return
    }
    setCutting(true)
    try {
      const reel = await reelsApi.create(tripId, text, usePicks ? picked : undefined)
      navigate(`trip/photos/reel?id=${reel.id}`)
    } catch (err) {
      showToast(err instanceof ApiRequestError ? err.message : 'Couldn’t cut the reel, try again')
      setCutting(false)
    }
  }

  return (
    <section className="reel-studio" aria-busy={cutting}>
      <img className="reel-studio__glow" src={reelGlow} alt="" width={120} height={120} />
      <div className="reel-preview">
        {photos[0] && <img className="reel-preview__photo" src={photos[0].url} alt="" width={82} height={132} />}
        <button type="button" className="reel-preview__play" aria-label="Watch the squad’s reels" onClick={() => navigate('trip/photos/reel')}>
          <img src={iconPlay} alt="" width={12} height={12} />
        </button>
        <span className="reel-preview__duration">{usePicks ? `${picked.length} picked` : `${photos.length} photos`}</span>
      </div>
      <div className="reel-studio__controls">
        <div className="reel-studio__header">
          <img src={iconFilm} alt="" width={14} height={14} />
          <label className="overline reel-studio__overline" htmlFor="reel-studio-prompt">
            Reel studio
          </label>
        </div>
        <textarea
          id="reel-studio-prompt"
          className="reel-studio__prompt"
          value={prompt}
          rows={3}
          maxLength={300}
          disabled={cutting}
          placeholder={REEL.placeholder}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="reel-studio__presets">
          {REEL.presets.map((p) => (
            <Chip key={p.label} variant="onDark" selected={prompt === p.prompt} onClick={() => setPrompt(prompt === p.prompt ? '' : p.prompt)}>
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="reel-studio__actions">
          <button type="button" className="reel-studio__generate" onClick={() => void generate()} disabled={cutting}>
            {cutting ? 'GhoomMate is cutting…' : 'Generate reel'}
          </button>
          <button type="button" className="reel-studio__voice" aria-label="Describe your reel by voice" onClick={() => voice.open('Make a reel of Kabir')}>
            <img src={iconMicWhite} alt="" width={18} height={18} />
          </button>
        </div>
      </div>
    </section>
  )
}
