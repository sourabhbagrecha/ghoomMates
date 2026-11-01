import iconHeadphones from '../../assets/icons/icon-headphones-white.svg'
import iconStamp from '../../assets/icons/icon-stamp-white.svg'
import { SectionHeader } from '../../components/SectionHeader'
import { useNavigate } from '../../hooks/navigation'
import { useStories } from './storiesStore'
import './StoriesOfMewar.css'

/**
 * Explore's "Stories of Mewar": the hand-painted Kaavad stories of Udaipur's heritage sites, each narrated in English or
 * Hindi, with a link to the Heritage Passport.
 */
export function StoriesOfMewar() {
  const navigate = useNavigate()
  const { catalogue, stamps, passport } = useStories()
  const stories = catalogue.filter((c) => c.curated)
  const total = passport?.totalSites ?? catalogue.length

  return (
    <>
      <SectionHeader
        title="Stories of Mewar"
        action={
          <button type="button" className="text-link" onClick={() => navigate('trip/explore/passport')}>
            Passport · {stamps.size}/{total}
          </button>
        }
      />
      <div className="mewar-stories no-scrollbar">
        {stories.map((story) => {
          const stamp = stamps.get(story.siteId)
          return (
            <article key={story.siteId} className="mewar-card">
              <button
                type="button"
                className="mewar-card__open"
                aria-label={`Hear the story of ${story.name}${stamp ? ' (stamped)' : ''}`}
                onClick={() => navigate(`trip/explore/story/${story.siteId}`)}
              />
              <div className="mewar-card__cover">
                {story.art && <img src={story.art} alt="" width={200} height={125} loading="lazy" />}
                <span className="mewar-card__badge">
                  <img src={iconHeadphones} alt="" width={12} height={12} />
                  {story.narrated.hi ? 'EN · हिं' : 'Narrated'}
                </span>
                {stamp && (
                  <span className="mewar-card__stamp" title={`Stamped ${stamp.score}/${stamp.total}`}>
                    <img src={iconStamp} alt="Stamped" width={14} height={14} />
                  </span>
                )}
              </div>
              <div className="mewar-card__body">
                <h3 className="mewar-card__title">{story.name}</h3>
                <p className="mewar-card__tale">{story.title}</p>
                <p className="mewar-card__meta">{story.panels} panels · quiz and stamp</p>
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}
