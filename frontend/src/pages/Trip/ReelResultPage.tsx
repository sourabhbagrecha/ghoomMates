import { useEffect, useRef, useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconDownload from '../../assets/figma/icon-download-primary.svg'
import iconFilm from '../../assets/figma/icon-film.svg'
import iconPause from '../../assets/figma/icon-pause-primary.svg'
import iconPlay from '../../assets/figma/icon-play.svg'
import iconRefresh from '../../assets/figma/icon-refresh-primary.svg'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { Toast } from '../../components/Toast'
import { reelRoute } from '../../components/voice/uiEvents'
import { useVoice } from '../../components/voice/voiceContext'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { newIdempotencyKey, tripsApi, type TripReel } from '../../services/tripsService'
import { REEL_RESULT, SHARE_TARGETS } from './tripDetailData'
import { formatReelDuration } from './tripFormat'
import './ReelResultPage.css'

const POLL_MS = 1000

/**
 * The reel player. `reelId` picks a reel; without one it shows the trip’s latest. While a reel renders it
 * polls and shows the current stage. Before any reel exists it shows the sample reel.
 */
export function ReelResultPage({ reelId }: { reelId?: string }) {
  const navigate = useNavigate()
  const voice = useVoice()
  const { tripId } = useActiveTrip()
  const [toast, showToast] = useToast()
  // undefined while loading, null when the trip has no reels yet
  const [reel, setReel] = useState<TripReel | null | undefined>(undefined)
  const [playing, setPlaying] = useState(false)
  const [frame, setFrame] = useState(0)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    const load = reelId ? tripsApi.reel(tripId, reelId) : tripsApi.reels(tripId).then((items) => items[0] ?? null)
    load.then((r) => !cancelled && setReel(r)).catch(() => !cancelled && setReel(null))
    return () => {
      cancelled = true
    }
  }, [tripId, reelId])

  // Poll until the render finishes; a failed poll just tries again
  useEffect(() => {
    if (!tripId || reel?.status !== 'rendering') return
    const { id } = reel
    const timer = window.setTimeout(() => {
      tripsApi
        .reel(tripId, id)
        .then((next) => setReel((r) => (r?.id === id ? next : r)))
        .catch(() => setReel((r) => (r?.id === id ? { ...r } : r)))
    }, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [tripId, reel])

  const status = reel?.status
  const lastStatus = useRef(status)
  useEffect(() => {
    if (lastStatus.current === 'rendering' && status === 'ready') showToast('Fresh cut ready!')
    lastStatus.current = status
  }, [status, showToast])

  // Playback is a slideshow of the picked shots across the reel’s length
  const photos = reel?.photos ?? []
  useEffect(() => {
    if (!playing || !reel || photos.length === 0) return
    const timer = window.setTimeout(
      () => {
        if (frame + 1 < photos.length) return setFrame(frame + 1)
        setPlaying(false)
        setFrame(0)
      },
      (reel.durationSec * 1000) / photos.length,
    )
    return () => window.clearTimeout(timer)
  }, [playing, frame, reel, photos.length])

  const rendering = status === 'rendering' || starting

  const regenerate = async () => {
    if (!tripId || !reel) {
      voice.open('Make a reel of our trip')
      return
    }
    setPlaying(false)
    setFrame(0)
    setStarting(true)
    try {
      const { title, prompt, vibe, durationSec, featuring } = reel
      const next = await tripsApi.makeReel(tripId, { title, prompt, vibe, durationSec, featuring }, newIdempotencyKey())
      setReel(next)
      navigate(reelRoute(next.id))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Couldn’t start a new cut')
    } finally {
      setStarting(false)
    }
  }

  const togglePlay = () => {
    if (!playing) setFrame(0)
    setPlaying((p) => !p)
  }

  const cover = reel ? (playing ? photos[frame]?.url : reel.coverUrl) ?? REEL_RESULT.cover : REEL_RESULT.cover
  const current = reel?.stages.find((s) => s.status === 'current')
  const durationSec = reel?.durationSec ?? 30

  return (
    <>
      <OnboardingLayout
        eyebrow="Reel studio"
        title={rendering ? 'Cutting your reel…' : 'Your reel is ready'}
        onBack={() => navigate('trip/photos')}
        headerBg={headerBg}
        headerHeight={170}
        bodyClassName="reel__body"
      >
        <div className={`reel__preview${rendering ? ' reel__preview--busy' : ''}`}>
          <img key={cover} className="reel__cover" src={cover} alt="" />
          <button
            type="button"
            className="reel__play"
            onClick={togglePlay}
            disabled={rendering || reel === undefined}
            aria-label={playing ? 'Pause reel' : 'Play reel'}
          >
            <img src={playing ? iconPause : iconPlay} alt="" width={22} height={22} />
          </button>
          <span className="reel__duration">{reel ? formatReelDuration(reel.durationSec) : REEL_RESULT.duration}</span>
          <span className="reel__track" aria-hidden="true">
            <span
              key={`${reel?.id}-${playing}`}
              className={`reel__track-fill${playing ? ' reel__track-fill--playing' : ''}`}
              style={{ animationDuration: `${durationSec}s` }}
            />
          </span>
          {rendering && (
            <span className="reel__busy">
              {current ? `${current.label}… ${Math.round((reel?.progress ?? 0) * 100)}%` : 'Cutting a new version…'}
            </span>
          )}
        </div>

        <div className="reel__heading">
          <h2 className="reel__title">{reel?.title ?? REEL_RESULT.title}</h2>
          <p className="reel__meta">
            {reel ? `${formatReelDuration(reel.durationSec)} · ${reel.music} · ${reel.clips} clips` : REEL_RESULT.meta}
          </p>
        </div>

        <button type="button" className="reel__regenerate" onClick={() => void regenerate()} disabled={rendering || reel === undefined}>
          <img src={iconRefresh} alt="" width={16} height={16} />
          {rendering ? 'Regenerating…' : reel ? 'Regenerate' : 'Make one with GhoomMate'}
        </button>

        <section className="card reel__share">
          <h3 className="overline">Share to</h3>
          <div className="reel__targets">
            {SHARE_TARGETS.map((t) => (
              // TODO: open the platform's share intent with the video
              <button key={t.id} type="button" className="reel__target" onClick={() => showToast(`Opening ${t.label}…`)}>
                <span className="reel__target-tile">{t.initial}</span>
                {t.label}
              </button>
            ))}
            {/* TODO: download the rendered video */}
            <button type="button" className="reel__target" onClick={() => showToast('Saved to your phone')}>
              <span className="reel__target-tile">
                <img src={iconDownload} alt="" width={20} height={20} />
              </span>
              Save
            </button>
          </div>
        </section>

        <section className="reel__prompt-card">
          <p className="reel__prompt-header">
            <img src={iconFilm} alt="" width={14} height={14} />
            <span className="overline reel__prompt-overline">Prompt used</span>
          </p>
          <p className="reel__prompt">{reel ? (reel.prompt ? `“${reel.prompt}”` : 'Picked by GhoomMate') : REEL_RESULT.prompt}</p>
        </section>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
