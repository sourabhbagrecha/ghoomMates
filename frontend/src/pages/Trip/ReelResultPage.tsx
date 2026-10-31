import { useEffect, useRef, useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconDownload from '../../assets/figma/icon-download-primary.svg'
import iconFilm from '../../assets/figma/icon-film.svg'
import iconPause from '../../assets/figma/icon-pause-primary.svg'
import iconPlay from '../../assets/figma/icon-play.svg'
import iconRefresh from '../../assets/figma/icon-refresh-primary.svg'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { useNavigate } from '../../hooks/navigation'
import { Toast } from '../../components/Toast'
import { REEL_RESULT, SHARE_TARGETS } from './tripDetailData'
import { useToast } from '../../hooks/useToast'
import './ReelResultPage.css'

export function ReelResultPage() {
  const navigate = useNavigate()
  const [toast, showToast] = useToast()
  const [playing, setPlaying] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [version, setVersion] = useState(1)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const regenerate = () => {
    setPlaying(false)
    setRegenerating(true)
    // TODO: call the reel generator again with the same prompt
    timer.current = window.setTimeout(() => {
      setRegenerating(false)
      setVersion((v) => v + 1)
      showToast('Fresh cut ready!')
    }, 1600)
  }

  return (
    <>
      <OnboardingLayout
        eyebrow="Reel studio"
        title="Your reel is ready"
        onBack={() => navigate('trip/photos')}
        headerBg={headerBg}
        headerHeight={170}
        bodyClassName="reel__body"
      >
        <div className={`reel__preview${regenerating ? ' reel__preview--busy' : ''}`}>
          <img className="reel__cover" src={REEL_RESULT.cover} alt="" />
          {/* TODO: play the generated video */}
          <button
            type="button"
            className="reel__play"
            onClick={() => setPlaying((p) => !p)}
            disabled={regenerating}
            aria-label={playing ? 'Pause reel' : 'Play reel'}
          >
            <img src={playing ? iconPause : iconPlay} alt="" width={22} height={22} />
          </button>
          <span className="reel__duration">{REEL_RESULT.duration}</span>
          <span className="reel__track" aria-hidden="true">
            <span key={`${version}-${playing}`} className={`reel__track-fill${playing ? ' reel__track-fill--playing' : ''}`} />
          </span>
          {regenerating && <span className="reel__busy">Cutting a new version…</span>}
        </div>

        <div className="reel__heading">
          <h2 className="reel__title">{REEL_RESULT.title}</h2>
          <p className="reel__meta">
            {REEL_RESULT.meta}
            {version > 1 && ` · Take ${version}`}
          </p>
        </div>

        <button type="button" className="reel__regenerate" onClick={regenerate} disabled={regenerating}>
          <img src={iconRefresh} alt="" width={16} height={16} />
          {regenerating ? 'Regenerating…' : 'Regenerate'}
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
          <p className="reel__prompt">{REEL_RESULT.prompt}</p>
        </section>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
