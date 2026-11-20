import { useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconFilm from '../../assets/figma/icon-film-white.svg'
import iconMicWhite from '../../assets/figma/icon-mic-white.svg'
import iconPlus from '../../assets/figma/icon-plus.svg'
import iconUpload from '../../assets/figma/icon-upload.svg'
import iconClose from '../../assets/figma/icon-x-white.svg'
import { Chip } from '../../components/Chip'
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
import { ApiRequestError, type FaceSummary, type TripPhoto } from '../../services/tripsService'
import { PastReels } from '../Reel/PastReels'
import { useTripReels } from '../Reel/useTripReels'
import { useTripStore } from '../Trip/tripStore'
import { faceSummaryOf, setPhotoFilter, useFacePolling, usePhotoFilter } from './faceSearch'
import { PhotoFilters, PhotoSearchField } from './PhotoSearch'
import { usePhotoSearch } from './usePhotoSearch'
import { REEL } from './photosData'
import './PhotosPage.css'

// Reel studio only shows once the album has enough photos to cut a reel from
const REEL_MIN_PHOTOS = 4

export function PhotosPage() {
  const navigate = useNavigate()
  const { trip, photos } = useActiveTrip()
  const total = photos?.total ?? 0
  const summary = faceSummaryOf(photos)
  const [toast, showToast] = useToast()
  // What the album is filtered to (the search or GhoomMate), or null while it shows everything
  const filter = usePhotoFilter()
  const matchedIds = filter?.ids ?? null
  const [searching, setSearching] = useState(false)
  const search = usePhotoSearch({ trip, photos: photos?.items ?? [], onSearching: setSearching, showToast })
  const { reels } = useTripReels(trip?.id ?? null)
  useFacePolling(summary?.pending ?? 0)

  const visible = (photos?.items ?? []).map((photo, index) => ({ photo, index })).filter(({ photo }) => !matchedIds || matchedIds.has(photo.id))
  const uploaders = new Set(photos?.items.map((p) => p.uploadedBy.userId)).size
  const upload = () => navigate('trip/photos/upload')

  return (
    <>
      <ScreenLayout
        headerBg={headerBg}
        headerHeight={170}
        eyebrow={photos ? `${total.toLocaleString('en-IN')} ${total === 1 ? 'photo' : 'photos'} · ${trip?.groupName ?? ''}` : 'Loading photos…'}
        title="Trip Memories"
      >
        <div className="screen__header-row">
          <PhotoSearchField search={search} disabled={!trip || !total} />
        </div>
        <main className="screen__body photos__body">
          {trip && total > 0 && <PhotoFilters search={search} />}
          {trip && photos && total >= REEL_MIN_PHOTOS && <ReelStudio tripId={trip.id} photos={photos.items} showToast={showToast} />}
          {!photos ? (
            <Skeleton variant="card" height={230} />
          ) : filter && !visible.length ? (
            <EmptyState
              size="compact"
              headingLevel={3}
              title={`No photos for “${filter.label}”`}
              text="Try fewer people or a broader moment, or check back as more get added."
              action={{ label: 'Show all photos', onClick: () => setPhotoFilter(null) }}
            />
          ) : photos.items.length ? (
            <section className="photo-gallery">
              <div className="photo-gallery__header">
                <SectionHeader
                  title={filter ? filter.label : 'All photos'}
                  action={
                    filter ? (
                      <button type="button" className="text-link" onClick={() => setPhotoFilter(null)}>
                        Show all {total}
                      </button>
                    ) : (
                      <button type="button" className="pill-button" onClick={upload}>
                        <img src={iconPlus} alt="" width={14} height={14} />
                        Add
                      </button>
                    )
                  }
                />
                <p className="photo-gallery__meta" role="status">
                  {filter ? `${visible.length} of ${total} photos` : albumLine(total, uploaders, summary)}
                </p>
              </div>
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
              action={{ label: 'Upload photos', icon: iconUpload, onClick: upload }}
            />
          )}
          {/* Appears once the list is in, so trips without reels never flash a placeholder */}
          <PastReels reels={reels ?? []} onOpen={(reel) => navigate(`trip/photos/reel?id=${reel.id}`)} />
        </main>
      </ScreenLayout>
      <Toast message={toast} />
    </>
  )
}

/** One quiet line under the gallery title: who added photos and where the cloud face tagging is */
function albumLine(total: number, uploaders: number, summary: FaceSummary | null) {
  const from = `From ${uploaders} ${uploaders === 1 ? 'mate' : 'mates'}`
  if (!summary) return from
  if (summary.pending > 0) return `${from} · tagging faces, ${total - summary.pending} of ${total} done`
  if (summary.faces > 0) return `${from} · ${summary.faces} ${summary.faces === 1 ? 'face' : 'faces'} found`
  return from
}

function ReelStudio({ tripId, photos, showToast }: { tripId: string; photos: TripPhoto[]; showToast: (message: string) => void }) {
  const navigate = useNavigate()
  const voice = useVoice()
  const { reelPicks } = useTripStore()
  const [prompt, setPrompt] = useState('')
  const [cutting, setCutting] = useState(false)
  const [open, setOpen] = useState(false)
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

  const subtitle = usePicks ? `From your ${picked.length} picks` : 'GhoomMate cuts it in seconds'

  return (
    <section className={`reel-studio${open ? ' reel-studio--open' : ''}`} aria-busy={cutting}>
      <div className="reel-studio__bar">
        <span className="reel-studio__icon">
          <img src={iconFilm} alt="" width={18} height={18} />
        </span>
        <div className="reel-studio__text">
          <h2 className="reel-studio__title">Make a reel</h2>
          <p className="reel-studio__subtitle">{subtitle}</p>
        </div>
        {open ? (
          <button type="button" className="reel-studio__close" aria-label="Close reel studio" disabled={cutting} onClick={() => setOpen(false)}>
            <img src={iconClose} alt="" width={18} height={18} />
          </button>
        ) : (
          <button type="button" className="reel-studio__start" onClick={() => setOpen(true)}>
            Create
          </button>
        )}
      </div>
      {open && (
        <div className="reel-studio__panel">
          <textarea
            aria-label="Describe your reel"
            className="reel-studio__prompt"
            value={prompt}
            rows={2}
            maxLength={300}
            disabled={cutting}
            autoFocus
            placeholder={REEL.placeholder}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="reel-studio__presets no-scrollbar">
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
      )}
    </section>
  )
}
