import iconCheck from '../../assets/figma/icon-check-white-bold.svg'
import iconFilm from '../../assets/figma/icon-film.svg'
import iconPlay from '../../assets/figma/icon-play.svg'
import { useActiveTrip } from '../../data/activeTrip'
import { formatReelDuration } from '../../pages/Trip/tripFormat'
import { Avatar } from '../Avatar'
import { Button } from '../Button'
import { memberLabel } from './memberLabel'
import type { ReelJob } from './protocol'

type ReelProgressCardProps = {
  reel: ReelJob
  onWatch: () => void
}

/** Thumbnails on the card’s filmstrip; the rest are summed up as “+N” */
const STRIP_MAX = 6

/**
 * A reel GhoomMate is cutting: the picked shots landing on a filmstrip, a progress bar and each render
 * stage, then a Watch button once it’s ready. Updated live by `reel.progress` / `reel.ready`.
 */
export function ReelProgressCard({ reel, onWatch }: ReelProgressCardProps) {
  const members = useActiveTrip().trip?.members
  const ready = reel.status === 'ready'
  const percent = Math.round(reel.progress * 100)
  const strip = reel.photos.slice(0, STRIP_MAX)
  const extra = reel.photos.length - strip.length
  // Shots “land” on the strip as the render moves along
  const placed = ready ? strip.length : Math.ceil(reel.progress * strip.length)
  const current = reel.stages.find((s) => s.status === 'current')

  return (
    <section className={`voice-card voice-reel${ready ? ' voice-reel--ready' : ''}`} aria-label="Reel studio">
      <div className="voice-reel__head">
        <button
          type="button"
          className="voice-reel__poster"
          onClick={onWatch}
          disabled={!ready}
          aria-label={ready ? `Watch ${reel.title}` : 'Reel is rendering'}
        >
          {reel.coverUrl && <img className="voice-reel__cover" src={reel.coverUrl} alt="" />}
          {ready ? (
            <span className="voice-reel__play">
              <img src={iconPlay} alt="" width={14} height={14} />
            </span>
          ) : (
            <span className="voice-reel__percent">{percent}%</span>
          )}
        </button>

        <div className="voice-reel__info">
          <p className="overline voice-card__overline voice-reel__overline">
            <img src={iconFilm} alt="" width={12} height={12} />
            {ready ? 'Reel ready' : 'Cutting your reel'}
          </p>
          <p className="voice-reel__title">{reel.title}</p>
          <p className="voice-reel__meta">
            {formatReelDuration(reel.durationSec)} · {reel.music} · {reel.clips} {reel.clips === 1 ? 'clip' : 'clips'}
          </p>
          {reel.featuring.length > 0 && (
            <ul className="voice-reel__cast" aria-label="Starring">
              {reel.featuring.map((id) => (
                <li key={id} className="voice-person">
                  <Avatar person={id} size={18} />
                  {memberLabel(members, id, 'Mate')}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ul className="voice-reel__strip" aria-hidden="true">
        {strip.map((photo, i) => (
          <li key={photo.id} className={`voice-reel__shot${i < placed ? ' voice-reel__shot--placed' : ''}`}>
            <img src={photo.url} alt="" loading="lazy" />
          </li>
        ))}
        {extra > 0 && <li className="voice-reel__shot voice-reel__shot--more">+{extra}</li>}
      </ul>

      <div
        className="voice-reel__bar"
        role="progressbar"
        aria-label="Reel progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={ready ? 'Ready' : `${percent}%${current ? `, ${current.label}` : ''}`}
      >
        <span className="voice-reel__bar-fill" style={{ width: `${percent}%` }} />
      </div>

      <ol className="voice-reel__stages">
        {reel.stages.map((stage) => (
          <li key={stage.id} className={`voice-reel__stage voice-reel__stage--${stage.status}`}>
            <span className="voice-reel__badge" aria-hidden="true">
              {stage.status === 'done' && <img src={iconCheck} alt="" width={10} height={10} />}
            </span>
            {stage.label}
            <span className="voice-sr">{stage.status === 'done' ? ', done' : stage.status === 'current' ? ', in progress' : ''}</span>
          </li>
        ))}
      </ol>

      {ready && (
        <Button variant="primary" className="voice-reel__watch" onClick={onWatch}>
          Watch reel
        </Button>
      )}
    </section>
  )
}
