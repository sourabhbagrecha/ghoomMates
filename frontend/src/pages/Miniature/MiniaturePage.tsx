import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import headerBg from '../../assets/figma/expenses-header-bg.svg'
import iconAlert from '../../assets/figma/icon-alert-primary.svg'
import iconDownload from '../../assets/figma/icon-download-primary.svg'
import iconShare from '../../assets/figma/icon-share-white.svg'
import { iconUrl } from '../../assets/icons'
import { Button, LinkButton } from '../../components/Button'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { EmptyState } from '../../components/states/EmptyState'
import { Skeleton } from '../../components/states/Skeleton'
import { Toast } from '../../components/Toast'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { artworksApi, type Artwork, type ArtworkGallery, type ArtworkStyleId } from '../../services/artworksService'
import { ApiRequestError, type TripPhoto } from '../../services/tripsService'
import { downloadPicture, sharePicture, slug, type ShareOutcome } from './artworkFiles'
import { framePhoto } from './framePhoto'
import { failureNote, INLINE_ERRORS, rankPhotos, STYLES, styleById, type FailureNote, type StyleCard } from './miniatureData'
import { MiniatureFrame } from './MiniatureFrame'
import { CommissionCard, PhotoPicker, SquadGallery, StylePicker } from './MiniatureParts'
import { PainterAtWork } from './PainterAtWork'
import './MiniaturePage.css'

type View =
  | { kind: 'pick' }
  | { kind: 'painting'; photo: TripPhoto; style: StyleCard }
  | { kind: 'result'; artwork: Artwork }
  /** The painter couldn't help, so the photo got a miniature frame instead */
  | { kind: 'framed'; photo: TripPhoto; style: StyleCard; note: FailureNote }

const SHARE_MESSAGES: Partial<Record<ShareOutcome, string>> = {
  copied: 'Link copied · works for 12 hours',
  failed: 'Couldn’t share that. Try saving it instead.',
}

/** Waits for the painting to load so it appears all at once, never more than a few seconds */
function preload(url: string, timeoutMs = 8_000) {
  return new Promise<void>((resolve) => {
    const image = new Image()
    const done = () => {
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(done, timeoutMs)
    image.onload = done
    image.onerror = done
    image.src = url
  })
}

/**
 * Squad Miniature, #/trip/photos/miniature: pick a squad photo and a Udaipur painting tradition, watch the painter
 * work, then share the result with the squad. When the painter can't (busy, over the limit, offline) the photo
 * gets a miniature frame instead, so the flow never dead-ends. Every result links on to real painters.
 */
export function MiniaturePage() {
  const navigate = useNavigate()
  const { trip, photos } = useActiveTrip()
  const [toast, showToast] = useToast()
  const [view, setView] = useState<View>({ kind: 'pick' })
  const [pickedPhoto, setPickedPhoto] = useState<string | null>(null)
  const [styleId, setStyleId] = useState<ArtworkStyleId>(STYLES[0].id)
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [gallery, setGallery] = useState<ArtworkGallery | null>(null)
  const [galleryFailed, setGalleryFailed] = useState(false)
  // Bumped to load the gallery again
  const [galleryVersion, setGalleryVersion] = useState(0)
  // The framed copy of a photo (with its style's name plate) is drawn once and reused for sharing and saving
  const framed = useRef<{ key: string; blob: Promise<Blob> } | null>(null)

  const tripId = trip?.id
  const you = trip?.members.find((member) => member.memberId === trip.memberId)
  const squadSize = trip?.members.length ?? 4
  const candidates = useMemo(() => rankPhotos(photos?.items ?? [], squadSize), [photos, squadSize])
  const photo = candidates.find((candidate) => candidate.id === pickedPhoto) ?? candidates[0] ?? null
  const style = styleById(styleId) ?? STYLES[0]
  const limit = gallery?.limit
  const resting = limit?.remaining === 0

  useEffect(() => {
    if (!tripId) return
    let current = true
    artworksApi.list(tripId).then(
      (next) => {
        if (!current) return
        setGallery(next)
        setGalleryFailed(false)
      },
      () => {
        if (current) setGalleryFailed(true)
      },
    )
    return () => {
      current = false
    }
  }, [tripId, galleryVersion])

  // A new view starts at the top of the screen
  const viewKey = view.kind === 'result' ? `result:${view.artwork.id}` : view.kind
  useEffect(() => {
    document.querySelector('.onboarding__scroll')?.scrollTo({ top: 0 })
  }, [viewKey])

  const paint = async (source: TripPhoto, chosen: StyleCard) => {
    if (!tripId) return
    setProblem(null)
    setView({ kind: 'painting', photo: source, style: chosen })
    try {
      const artwork = await artworksApi.paint(tripId, source.id, chosen.id)
      await preload(artwork.url)
      setGallery((current) => ({ items: [artwork, ...(current?.items.filter((item) => item.id !== artwork.id) ?? [])], limit: artwork.limit }))
      setView({ kind: 'result', artwork })
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : 'ARTWORK_FAILED'
      if (INLINE_ERRORS[code]) {
        setProblem(INLINE_ERRORS[code])
        setView({ kind: 'pick' })
      } else {
        setView({ kind: 'framed', photo: source, style: chosen, note: failureNote(code) })
      }
      // The day's allowance may have changed under us
      if (code === 'ARTWORK_LIMIT') setGalleryVersion((n) => n + 1)
    }
  }

  const framedBlob = (source: TripPhoto, chosen: StyleCard) => {
    const key = `${source.id}:${chosen.id}`
    if (framed.current?.key !== key) {
      const blob = framePhoto(source.url, chosen.name)
      // A failed drawing is not kept, so the next tap tries again
      blob.catch(() => {
        if (framed.current?.key === key) framed.current = null
      })
      framed.current = { key, blob }
    }
    return framed.current!.blob
  }

  const openArtwork = (artwork: Artwork) => setView({ kind: 'result', artwork })
  const backToPicker = () => setView({ kind: 'pick' })

  const share = async () => {
    if (view.kind !== 'result' && view.kind !== 'framed') return
    const outcome =
      view.kind === 'result'
        ? await sharePicture(
            { url: view.artwork.url, filename: `ghoomates-${slug(view.artwork.styleName)}-${view.artwork.id.slice(0, 8)}.png` },
            `${view.artwork.styleName} · ${trip?.groupName ?? 'Ghoomates'}`,
            `Our squad, painted as a ${view.artwork.styleName} in Udaipur. Made with Ghoomates.`,
          )
        : await sharePicture(
            { url: view.photo.url, filename: `ghoomates-${slug(view.style.name)}-frame.jpg`, makeBlob: () => framedBlob(view.photo, view.style) },
            `${view.style.name} · ${trip?.groupName ?? 'Ghoomates'}`,
            'Our squad, in a miniature frame. Made with Ghoomates.',
          )
    const message = SHARE_MESSAGES[outcome]
    if (message) showToast(message)
  }

  const save = async () => {
    if (view.kind !== 'result' && view.kind !== 'framed') return
    const saved =
      view.kind === 'result'
        ? await downloadPicture({ url: view.artwork.url, filename: `ghoomates-${slug(view.artwork.styleName)}-${view.artwork.id.slice(0, 8)}.png` })
        : await downloadPicture({ url: view.photo.url, filename: `ghoomates-${slug(view.style.name)}-frame.jpg`, makeBlob: () => framedBlob(view.photo, view.style) })
    showToast(saved ? 'Saved to your device' : 'Couldn’t save that. Try again.')
  }

  const gallerySection = (
    <SquadGallery
      gallery={gallery}
      failed={galleryFailed}
      youId={you?.userId}
      openId={view.kind === 'result' ? view.artwork.id : null}
      onOpen={openArtwork}
      onRetry={() => setGalleryVersion((n) => n + 1)}
    />
  )

  const finePrint = limit ? `${limit.remaining} of ${limit.perDay} paintings left today · about 20 seconds` : 'Takes about 20 seconds'

  let eyebrow = `${trip?.groupName ?? 'Trip'} · Squad Miniature`
  let title = 'Paint us in miniature'
  let subtitle: string | undefined = 'Pick a squad photo and a tradition, and our painter does the rest.'
  let body: ReactNode
  let actions: ReactNode

  if (view.kind === 'painting') {
    eyebrow = view.style.name
    title = 'Painting your squad'
    subtitle = 'Mineral colours, a squirrel-hair brush and a little patience.'
    body = <PainterAtWork photoUrl={view.photo.url} style={view.style} />
    actions = (
      <Button variant="outline" disabled>
        Painting…
      </Button>
    )
  } else if (view.kind === 'result') {
    const { artwork } = view
    const card = styleById(artwork.style)
    const byYou = artwork.createdBy.userId === you?.userId
    eyebrow = artwork.styleName
    title = 'Your miniature is ready'
    subtitle = undefined
    body = (
      <>
        <MiniatureFrame variant="mat" className="miniature__result">
          <img className="miniature__art" src={artwork.url} alt={`Your squad painted as a ${artwork.styleName}`} />
        </MiniatureFrame>
        <div className="miniature__caption">
          <div className="miniature__caption-text">
            <h2 className="miniature__style-name">{artwork.styleName}</h2>
            <p className="miniature__byline">
              Painted by {byYou ? 'you' : artwork.createdBy.name.split(' ')[0]} · in the squad gallery for everyone
            </p>
            {card && <p className="miniature__tradition">{card.tradition}</p>}
          </div>
          <button type="button" className="miniature__icon-button" aria-label="Save to your device" onClick={() => void save()}>
            <img src={iconDownload} alt="" width={20} height={20} />
          </button>
        </div>
        <CommissionCard />
        {gallerySection}
      </>
    )
    actions = (
      <>
        <Button variant="primary" className="miniature__action" onClick={() => void share()}>
          <img src={iconShare} alt="" width={20} height={20} />
          Share with the squad
        </Button>
        <LinkButton onClick={backToPicker}>Paint another</LinkButton>
      </>
    )
  } else if (view.kind === 'framed') {
    const { note } = view
    eyebrow = view.style.name
    title = 'Framed for now'
    subtitle = undefined
    body = (
      <>
        <section className="card miniature__notice" role="status">
          <span className="miniature__notice-icon">
            <img src={iconAlert} alt="" width={22} height={22} />
          </span>
          <div>
            <h2 className="miniature__notice-title">{note.title}</h2>
            <p className="miniature__notice-text">{note.text}</p>
          </div>
        </section>
        <MiniatureFrame variant="ornate" label={view.style.name}>
          <img className="miniature__art" src={view.photo.url} alt={`Your squad photo in a ${view.style.name} frame`} />
        </MiniatureFrame>
        <div className="miniature__caption">
          <div className="miniature__caption-text">
            <h2 className="miniature__style-name">{view.style.name}</h2>
            <p className="miniature__byline">{note.retry ? 'Framed for now · the painter can try again' : 'Framed for now'}</p>
            <p className="miniature__tradition">{view.style.tradition}</p>
          </div>
          <button type="button" className="miniature__icon-button" aria-label="Save the framed photo" onClick={() => void save()}>
            <img src={iconDownload} alt="" width={20} height={20} />
          </button>
        </div>
        <CommissionCard />
        {gallerySection}
      </>
    )
    const { photo: framedPhoto, style: framedStyle } = view
    actions = note.retry ? (
      <>
        <Button variant="primary" onClick={() => void paint(framedPhoto, framedStyle)}>
          Try again
        </Button>
        <LinkButton onClick={() => void share()}>Share the framed photo</LinkButton>
      </>
    ) : (
      <>
        <Button variant="primary" onClick={backToPicker}>
          Choose another photo
        </Button>
        <LinkButton onClick={() => void share()}>Share the framed photo</LinkButton>
      </>
    )
  } else {
    const noPhotos = !!photos && !candidates.length
    body = (
      <>
        {!noPhotos && <GhoomMateTip>Pick a photo where everyone’s face shows. I’ll keep every one of you in the painting.</GhoomMateTip>}
        {problem && (
          <p className="miniature__problem" role="alert">
            {problem}
          </p>
        )}
        {!photos ? (
          <div className="miniature__loading" aria-busy="true" aria-label="Loading your photos">
            <Skeleton variant="line" width={160} height={18} />
            <div className="miniature__loading-tiles">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} variant="card" width={88} height={88} radius={14} />
              ))}
            </div>
          </div>
        ) : noPhotos ? (
          <EmptyState
            size="compact"
            headingLevel={3}
            title="No photos to paint yet"
            text="Add a squad photo to the album and come back. A group shot with everyone’s face works best."
            action={{ label: 'Upload photos', onClick: () => navigate('trip/photos/upload') }}
          />
        ) : (
          <PhotoPicker
            photos={candidates}
            selectedId={photo?.id ?? null}
            expanded={showAllPhotos}
            onExpand={setShowAllPhotos}
            onSelect={setPickedPhoto}
          />
        )}
        <StylePicker selected={styleId} onSelect={setStyleId} />
        {gallerySection}
      </>
    )
    actions = (
      <>
        <Button
          variant="primary"
          className="miniature__action"
          disabled={!photo || !tripId || resting}
          onClick={() => photo && void paint(photo, style)}
        >
          <img src={iconUrl('brush', 'white')} alt="" width={20} height={20} />
          {resting ? 'The painters rest until tomorrow' : photo ? 'Paint our squad' : 'Pick a photo to paint'}
        </Button>
        <p className="miniature__fine-print">{finePrint}</p>
      </>
    )
  }

  // Said aloud when the painting is ready or couldn't be made, since the screen changes under a screen reader
  const announcement = view.kind === 'result' ? `Your ${view.artwork.styleName} is ready.` : view.kind === 'framed' ? `${view.note.title}. ${view.note.text}` : ''

  return (
    <>
      <p className="miniature__sr" role="status">
        {announcement}
      </p>
      <OnboardingLayout
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        onBack={view.kind === 'pick' ? () => navigate('trip/photos') : backToPicker}
        headerBg={headerBg}
        headerHeight={210}
        bodyClassName="miniature__body"
        actions={actions}
      >
        {body}
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
