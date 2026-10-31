import { useEffect, useRef, useState } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconDownload from '../../assets/figma/icon-download-primary.svg'
import iconFilm from '../../assets/figma/icon-film.svg'
import iconPlay from '../../assets/figma/icon-play.svg'
import iconRefresh from '../../assets/figma/icon-refresh-primary.svg'
import photoReel from '../../assets/figma/photo-reel.svg'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { Toast } from '../../components/Toast'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { exportReel, shareOrSave } from '../../reels/exportReel'
import type { PlannedReel } from '../../reels/planner'
import { getReelState, reelActions, useReelStore } from '../../reels/reelStore'
import { formatReelDuration, REEL_FPS, REEL_HEIGHT, REEL_WIDTH, reelTimeline } from '../../reels/timeline'
import { TripReel } from '../../reels/TripReel'
import { REEL_STYLES } from '../../reels/types'
import { SHARE_TARGETS } from './tripDetailData'
import './ReelResultPage.css'

export function ReelResultPage() {
  const navigate = useNavigate()
  const [toast, showToast] = useToast()
  const { status, reel, take, error, madeFrom } = useReelStore()
  const player = useRef<PlayerRef>(null)
  const [playing, setPlaying] = useState(false)
  const [frame, setFrame] = useState(0)
  /** MP4 render progress, 0 to 1, while saving or sharing */
  const [rendering, setRendering] = useState<number | null>(null)
  // The last MP4, so a share that lost its tap (renders take a while) can go out on the next tap
  const rendered = useRef<{ reel: PlannedReel; file: File } | null>(null)
  const abortRender = useRef<AbortController | null>(null)

  const planning = status === 'planning'
  const total = reel ? reelTimeline(reel.plan).total : 0
  const busy = planning || rendering !== null

  // Opened from the preview or by voice before anything was cut
  useEffect(() => {
    if (getReelState().status === 'idle') void reelActions.generate()
  }, [])

  useEffect(() => () => abortRender.current?.abort(), [])

  // The player remounts for every new cut
  useEffect(() => {
    const p = player.current
    if (!p) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame)
    p.addEventListener('play', onPlay)
    p.addEventListener('pause', onPause)
    p.addEventListener('ended', onPause)
    p.addEventListener('frameupdate', onFrame)
    setPlaying(false)
    setFrame(0)
    return () => {
      p.removeEventListener('play', onPlay)
      p.removeEventListener('pause', onPause)
      p.removeEventListener('ended', onPause)
      p.removeEventListener('frameupdate', onFrame)
    }
  }, [reel, planning])

  const regenerate = async () => {
    player.current?.pause()
    await reelActions.generate({ regenerate: true, direction: madeFrom || getReelState().direction })
    if (getReelState().status === 'ready') showToast('Fresh cut ready!')
  }

  const deliver = async (share: boolean, label: string) => {
    if (!reel || busy) return
    player.current?.pause()
    try {
      let file = rendered.current?.reel === reel ? rendered.current.file : null
      if (!file) {
        abortRender.current = new AbortController()
        setRendering(0)
        file = await exportReel(reel, setRendering, abortRender.current.signal)
        rendered.current = { reel, file }
        setRendering(null)
      }
      const result = await shareOrSave(file, share)
      if (result === 'shared') showToast('Reel shared!')
      else if (result === 'saved') showToast(share ? `Saved. Post it on ${label} from your gallery` : 'Saved to your device')
    } catch (err) {
      setRendering(null)
      if (abortRender.current?.signal.aborted) return
      // Sharing needs a fresh tap once the render is done
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        showToast(`Your reel is ready. Tap ${label} again to share`)
        return
      }
      console.error('Reel export failed:', err)
      showToast('Couldn’t make the video on this browser. Try Chrome')
    }
  }

  const styleLabel = reel ? REEL_STYLES.find((s) => s.id === reel.plan.style)?.label : null
  const meta = reel
    ? [formatReelDuration(total), styleLabel, reel.plan.soundtrack, `${reel.plan.scenes.length} clips`].filter(Boolean).join(' · ')
    : ''

  return (
    <>
      <OnboardingLayout
        eyebrow="Reel studio"
        title={reel && !planning ? 'Your reel is ready' : 'Cutting your reel'}
        onBack={() => navigate('trip/photos')}
        headerBg={headerBg}
        headerHeight={170}
        bodyClassName="reel__body"
      >
        <div className={`reel__preview${busy ? ' reel__preview--busy' : ''}`}>
          {reel && !planning ? (
            <Player
              key={take}
              ref={player}
              component={TripReel}
              inputProps={{ plan: reel.plan, photos: reel.photos }}
              durationInFrames={total}
              fps={REEL_FPS}
              compositionWidth={REEL_WIDTH}
              compositionHeight={REEL_HEIGHT}
              className="reel__player"
              style={{ width: '100%', height: '100%' }}
              clickToPlay={rendering === null}
              doubleClickToFullscreen
            />
          ) : (
            <img className="reel__cover" src={photoReel} alt="" />
          )}
          {reel && !playing && !busy && (
            <button type="button" className="reel__play" onClick={() => player.current?.play()} aria-label="Play reel">
              <img src={iconPlay} alt="" width={22} height={22} />
            </button>
          )}
          {reel && !planning && <span className="reel__duration">{formatReelDuration(total - frame)}</span>}
          <span className="reel__track" aria-hidden="true">
            <span
              className="reel__track-fill"
              style={{ width: `${rendering !== null ? rendering * 100 : total > 1 ? (100 * frame) / (total - 1) : 0}%` }}
            />
          </span>
          {planning && <span className="reel__busy">GhoomMate is picking shots…</span>}
          {rendering !== null && <span className="reel__busy">Making the video · {Math.round(rendering * 100)}%</span>}
          {status === 'error' && !reel && <span className="reel__busy">{error}</span>}
        </div>

        <div className="reel__heading">
          <h2 className="reel__title">{reel ? reel.plan.title : 'Your reel'}</h2>
          {reel && (
            <p className="reel__meta">
              {meta}
              {take > 1 && ` · Take ${take}`}
            </p>
          )}
          {status === 'error' && reel && <p className="reel__error">{error}</p>}
        </div>

        <button type="button" className="reel__regenerate" onClick={regenerate} disabled={busy}>
          <img src={iconRefresh} alt="" width={16} height={16} />
          {planning ? 'Regenerating…' : status === 'error' && !reel ? 'Try again' : 'Regenerate'}
        </button>

        <section className="card reel__share">
          <h3 className="overline">Share to</h3>
          <div className="reel__targets">
            {SHARE_TARGETS.map((t) => (
              <button key={t.id} type="button" className="reel__target" onClick={() => deliver(true, t.label)} disabled={!reel || busy}>
                <span className="reel__target-tile">{t.initial}</span>
                {t.label}
              </button>
            ))}
            <button type="button" className="reel__target" onClick={() => deliver(false, 'Save')} disabled={!reel || busy}>
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
          <p className="reel__prompt">“{madeFrom || getReelState().direction}”</p>
        </section>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
