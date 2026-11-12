import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconDownload from '../../assets/figma/icon-download-white.svg'
import iconFilm from '../../assets/figma/icon-film.svg'
import iconRefresh from '../../assets/figma/icon-refresh-primary.svg'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { EmptyState } from '../../components/states/EmptyState'
import { Skeleton } from '../../components/states/Skeleton'
import { Toast } from '../../components/Toast'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { ApiRequestError } from '../../services/tripsService'
import { reelsApi, type Reel } from '../../services/reelsService'
import { PastReels } from '../Reel/PastReels'
import { REEL_FPS, reelDurationInFrames } from '../Reel/reelTiming'
import { useTripReels } from '../Reel/useTripReels'
import { SHARE_TARGETS } from './tripDetailData'
import './ReelResultPage.css'

// Remotion and the reel fonts load with the first reel shown, not with the app; the preview box holds the space meanwhile
const ReelPlayer = lazy(() => import('../Reel/ReelPlayer'))

const reelIdFromHash = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('id')

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

const STYLE_NAMES: Record<string, string> = {
  cinematic: 'Cinematic',
  energetic: 'Hype edit',
  dreamy: 'Dreamy',
  retro: 'Retro film',
  playful: 'Playful',
}

export function ReelResultPage() {
  const navigate = useNavigate()
  const { trip } = useActiveTrip()
  const [toast, showToast] = useToast()
  const tripId = trip?.id ?? null
  const tripName = trip?.name ?? ''
  const { reels, failed, retry, add, mapTiles } = useTripReels(tripId)
  // The reel in the link (or the one just cut here); the squad's newest when there is none
  const [selectedId, setSelectedId] = useState(reelIdFromHash)
  const reel = (selectedId && (reels?.find((r) => r.id === selectedId) ?? reelsApi.cached(selectedId))) || reels?.[0] || null
  const loading = !reel && reels === null
  // What's typed in the prompt box, or null to show the reel's own prompt
  const [draft, setDraft] = useState<string | null>(null)
  const prompt = draft ?? reel?.prompt ?? ''
  const [cutting, setCutting] = useState(false)
  // Progress of the MP4 being made on this device, 0 to 1, or null when idle
  const [rendering, setRendering] = useState<number | null>(null)
  const video = useRef<{ reelId: string; file: File } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const preview = useRef<HTMLDivElement>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const show = (next: Reel) => {
    abort.current?.abort()
    setRendering(null)
    setSelectedId(next.id)
    setDraft(null)
    navigate(`trip/photos/reel?id=${next.id}`, { replace: true })
    preview.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const recut = async () => {
    if (!tripId || cutting) return
    const text = prompt.trim()
    if (text.length < 3) {
      showToast('Tell GhoomMate what kind of reel you want')
      return
    }
    setCutting(true)
    try {
      const next = await reelsApi.create(tripId, text)
      add(next)
      show(next)
      showToast(next.source === 'template' ? 'GhoomMate was busy, so here’s a quick cut' : 'Fresh cut ready!')
    } catch (err) {
      showToast(err instanceof ApiRequestError ? err.message : 'Couldn’t cut a new reel, try again')
    } finally {
      setCutting(false)
    }
  }

  // The MP4 is made once per reel and reused for every share
  const makeVideo = async (current: Reel) => {
    if (video.current?.reelId === current.id) return video.current.file
    const controller = new AbortController()
    abort.current = controller
    setRendering(0)
    try {
      // The MP4 encoder is big, so it only loads when someone saves or shares
      const { renderReel } = await import('../Reel/exportReel')
      const file = await renderReel(current, tripName, mapTiles, setRendering, controller.signal)
      video.current = { reelId: current.id, file }
      return file
    } finally {
      setRendering(null)
    }
  }

  const exportVideo = async (target: 'save' | (typeof SHARE_TARGETS)[number]['label']) => {
    if (!reel || rendering !== null) return
    try {
      const file = await makeVideo(reel)
      const { downloadFile, shareFile } = await import('../Reel/exportReel')
      if (target !== 'save' && (await shareFile(file, reel.plan.title))) return
      downloadFile(file)
      showToast(target === 'save' ? 'Reel saved' : `Saved, now post it on ${target} from your downloads`)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('Reel render failed', err)
      showToast('Couldn’t make the video on this browser. Try Chrome, Edge or Safari')
    }
  }

  const busyLabel = cutting ? 'GhoomMate is cutting a new version…' : rendering !== null ? `Making your video · ${Math.round(rendering * 100)}%` : null

  return (
    <>
      <OnboardingLayout
        eyebrow="Reel studio"
        title={reel ? 'Your reel is ready' : 'Your reels'}
        onBack={() => navigate('trip/photos')}
        headerBg={headerBg}
        headerHeight={170}
        bodyClassName="reel__body"
      >
        {loading ? (
          <Skeleton variant="card" height={360} />
        ) : !reel && failed ? (
          <EmptyState title="Couldn’t load your reels" text="Check your connection and try again." action={{ label: 'Try again', onClick: retry }} />
        ) : !reel ? (
          <EmptyState
            title="No reels yet"
            text="Tell GhoomMate what you want, like “30 seconds of our beach day, dreamy vibe”, and it cuts one from the squad’s photos."
            action={{ label: 'Make a reel', onClick: () => navigate('trip/photos') }}
          />
        ) : (
          <>
            <div ref={preview} className={`reel__preview${busyLabel ? ' reel__preview--busy' : ''}`}>
              <Suspense fallback={null}>
                <ReelPlayer key={reel.id} reel={reel} tripName={tripName} mapTiles={mapTiles} />
              </Suspense>
              {busyLabel && <span className="reel__busy" role="status">{busyLabel}</span>}
            </div>

            <div className="reel__heading">
              <h2 className="reel__title">{reel.plan.title}</h2>
              <p className="reel__meta">
                {clock(reelDurationInFrames(reel.plan) / REEL_FPS)} · {STYLE_NAMES[reel.plan.style] ?? reel.plan.style} · {reel.plan.scenes.length}{' '}
                {reel.plan.scenes.length === 1 ? 'scene' : 'scenes'}
                {reel.source === 'template' && ' · Quick cut'}
              </p>
            </div>

            <button type="button" className="reel__regenerate" onClick={() => void recut()} disabled={cutting || rendering !== null}>
              <img src={iconRefresh} alt="" width={16} height={16} />
              {cutting ? 'Regenerating…' : 'Regenerate'}
            </button>

            <section className="card reel__share">
              <h3 className="overline">Share to</h3>
              <div className="reel__targets">
                {SHARE_TARGETS.map((t) => (
                  <button key={t.id} type="button" className={`reel__target reel__target--${t.id}`} aria-label={`Share to ${t.label}`} title={t.label} disabled={rendering !== null || cutting} onClick={() => void exportVideo(t.label)}>
                    <img src={t.icon} alt="" width={28} height={28} />
                  </button>
                ))}
                <button type="button" className="reel__target reel__target--save" aria-label="Save to your phone" title="Save" disabled={rendering !== null || cutting} onClick={() => void exportVideo('save')}>
                  <img src={iconDownload} alt="" width={26} height={26} />
                </button>
              </div>
            </section>

            <section className="reel__prompt-card">
              <label className="reel__prompt-header" htmlFor="reel-prompt">
                <img src={iconFilm} alt="" width={14} height={14} />
                <span className="overline reel__prompt-overline">Your prompt</span>
              </label>
              <textarea
                id="reel-prompt"
                className="reel__prompt"
                value={prompt}
                maxLength={300}
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Make it faster, add a dreamy vibe, only the beach photos…"
              />
              <p className="reel__prompt-hint">Change the words and tap Regenerate for a new cut.</p>
            </section>

            <PastReels reels={reels} currentId={reel.id} onOpen={show} />
          </>
        )}
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
