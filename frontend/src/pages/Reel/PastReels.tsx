import { SectionHeader } from '../../components/SectionHeader'
import { Skeleton } from '../../components/states/Skeleton'
import type { Reel } from '../../services/reelsService'
import { REEL_FPS, reelDurationInFrames } from './reelTiming'
import './PastReels.css'

type PastReelsProps = {
  /** Newest first; null while loading */
  reels: Reel[] | null
  /** The reel on screen, marked in the row */
  currentId?: string
  onOpen: (reel: Reel) => void
  title?: string
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

function when(iso: string) {
  const made = new Date(iso)
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(made).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return made.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** The squad's earlier reels as a sideways row of covers. Shows nothing until there is a reel to show. */
export function PastReels({ reels, currentId, onOpen, title = 'Squad reels' }: PastReelsProps) {
  if (reels && !reels.length) return null
  return (
    <section className="past-reels">
      <SectionHeader title={title} action={reels ? <span className="past-reels__count">{reels.length}</span> : undefined} />
      {!reels ? (
        <Skeleton variant="card" height={190} />
      ) : (
        <ul className="past-reels__row">
          {reels.map((reel) => {
            const cover = reel.plan.scenes.find((s) => s.photos.length)?.photos[0].url
            const current = reel.id === currentId
            return (
              <li key={reel.id}>
                <button
                  type="button"
                  className={`past-reels__card${current ? ' past-reels__card--current' : ''}`}
                  aria-current={current || undefined}
                  onClick={() => onOpen(reel)}
                >
                  <span className="past-reels__cover">
                    {cover && <img src={cover} alt="" width={104} height={156} loading="lazy" />}
                    <span className="past-reels__duration">{clock(reelDurationInFrames(reel.plan) / REEL_FPS)}</span>
                    {current && <span className="past-reels__playing">Playing</span>}
                  </span>
                  <span className="past-reels__title">{reel.plan.title}</span>
                  <span className="past-reels__meta">
                    {reel.createdBy.name.split(' ')[0]} · {when(reel.createdAt)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
