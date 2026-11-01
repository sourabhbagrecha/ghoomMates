import { iconUrl } from '../../assets/icons'
import { useNavigate } from '../../hooks/navigation'
import { STYLES } from './miniatureData'
import './MiniatureEntry.css'

/** The Photos tab's way in to Squad Miniature (#/trip/photos/miniature). */
export function MiniatureEntry() {
  const navigate = useNavigate()

  return (
    <button type="button" className="list-card miniature-entry" onClick={() => navigate('trip/photos/miniature')}>
      <span className="miniature-entry__art">
        <img src={STYLES[0].sample} alt="" width={96} height={72} loading="lazy" />
        <span className="miniature-entry__badge">New</span>
      </span>
      <span className="miniature-entry__text">
        <span className="miniature-entry__title">Paint us as a Mewar miniature</span>
        <span className="miniature-entry__hint">Turn a squad photo into a painting in Udaipur’s royal tradition</span>
      </span>
      <span className="pill-button miniature-entry__go">
        <img src={iconUrl('brush', 'white')} alt="" width={14} height={14} />
        Paint
      </span>
    </button>
  )
}
