import iconArrow from '../../assets/figma/icon-arrow-primary.svg'
import iconHeadphones from '../../assets/icons/icon-headphones-primary.svg'
import iconStamp from '../../assets/icons/icon-stamp-sky.svg'
import { useNavigate } from '../../hooks/navigation'
import { useStories } from './storiesStore'
import './HearTheStory.css'

type HearTheStoryProps = {
  siteId: string
  siteName: string
  /** `card` for a stop's story card; `link` for a quiet text action inside a list */
  variant?: 'card' | 'link'
}

/** Opens the Kaavad story for a heritage site: panels that unfold, a storyteller's voice, a quiz and a stamp */
export function HearTheStory({ siteId, siteName, variant = 'card' }: HearTheStoryProps) {
  const navigate = useNavigate()
  const { catalogue, stamps } = useStories()
  const item = catalogue.find((c) => c.siteId === siteId)
  const stamp = stamps.get(siteId)
  const open = () => navigate(`trip/explore/story/${siteId}`)

  if (variant === 'link') {
    return (
      <button type="button" className="hear-link" onClick={open}>
        <img src={stamp ? iconStamp : iconHeadphones} alt="" width={14} height={14} />
        {stamp ? 'Hear it again' : 'Hear the story'}
      </button>
    )
  }

  return (
    <button type="button" className="hear-story" onClick={open} aria-label={`Hear the story of ${siteName}${stamp ? ' (stamped)' : ''}`}>
      <span className="hear-story__cover">
        {item?.art ? <img className="hear-story__art" src={item.art} alt="" width={52} height={52} loading="lazy" /> : <img src={iconHeadphones} alt="" width={22} height={22} />}
      </span>
      <span className="hear-story__text">
        <span className="hear-story__title">Hear the story</span>
        <span className="hear-story__sub">
          {item?.curated ? `${item.panels} painted panels · English and हिन्दी` : 'A short story with a quiz'} · earns a stamp
        </span>
      </span>
      {stamp ? (
        <span className="hear-story__stamped">
          <img src={iconStamp} alt="" width={14} height={14} />
          {stamp.score}/{stamp.total}
        </span>
      ) : (
        <img src={iconArrow} alt="" width={18} height={18} />
      )}
    </button>
  )
}
