import { iconUrl } from '../../assets/icons'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { festivalForSite, festivalLine, quieterLine } from './eventsLogic'
import { useEventList } from './useEventList'
import './FestivalLine.css'

const iconPartyPopper = iconUrl('party-popper', 'primary')

/**
 * On CrowdPulse's selected site: when a festival touches it today or tomorrow, or on a day of the squad's trip, a badge and
 * one line ("Jagannath Rath Yatra: very heavy crowds at Jagdish Temple, 2–7:30 PM") that opens the plan-around view.
 * Renders nothing otherwise, or if the calendar can't be loaded.
 */
export function FestivalLine({ siteId }: { siteId: string }) {
  const navigate = useNavigate()
  const { trip } = useActiveTrip()
  const { list, today } = useEventList()
  const found = list ? festivalForSite(list.items, siteId, today, trip) : null
  if (!found) return null

  const { item, site, when, dayNumber } = found
  const quiet = quieterLine(site)
  const badge = when === 'today' ? 'Festival today' : when === 'tomorrow' ? 'Festival tomorrow' : `Day ${dayNumber} of your trip`

  return (
    <div className="festival-line" role="note">
      <span className="festival-line__badge">
        <img src={iconPartyPopper} alt="" width={12} height={12} />
        {badge}
      </span>
      <p className="festival-line__text">{festivalLine(item.name, site)}</p>
      {quiet && <p className="festival-line__quiet">{quiet}</p>}
      <button type="button" className="text-link" onClick={() => navigate(`trip/explore/events?e=${item.id}`)}>
        Plan around it
      </button>
    </div>
  )
}
