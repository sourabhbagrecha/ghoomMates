import iconSprout from '../../assets/icons/icon-sprout-primary.svg'
import iconTruck from '../../assets/icons/icon-truck-primary.svg'
import { SectionHeader } from '../../components/SectionHeader'
import { Skeleton } from '../../components/states/Skeleton'
import { useNavigate } from '../../hooks/navigation'
import { hospitalityApi } from '../../services/hospitalityService'
import { formatINR } from './hospitalityData'
import { GreenBadge, Photo } from './HospitalityParts'
import { useLoad } from './useLoad'
import './FarmToTableSection.css'

/**
 * Explore → Farm-to-table: Udaipur kitchens that cook a Mewari thali from nearby farms, greenest first. A squad's
 * booking tells them how many to cook for, which is how it cuts food miles and waste. Hides itself if the API is unreachable.
 */
export function FarmToTableSection() {
  const navigate = useNavigate()
  const { data, error } = useLoad(hospitalityApi.hosts, 'hosts')
  if (error && !data) return null

  return (
    <>
      <SectionHeader
        title="Farm-to-table"
        action={
          <button type="button" className="text-link" onClick={() => navigate('trip/explore/food')}>
            See all
          </button>
        }
      />
      {data && (
        <p className="farm-section__season">
          <img src={iconSprout} alt="" width={14} height={14} />
          <span>
            <strong>{data.season.season}</strong> · book a squad thali and the kitchen cooks to your head-count
          </span>
        </p>
      )}
      <div className="farm-section__row no-scrollbar" aria-busy={!data}>
        {data
          ? data.hosts.map((host) => (
              <article key={host.id} className="farm-tile">
                <button
                  type="button"
                  className="farm-tile__open"
                  aria-label={`Open ${host.name}, Green Host ${host.green.score}`}
                  onClick={() => navigate(`trip/explore/food/${host.id}`)}
                />
                <div className="farm-tile__cover">
                  <Photo src={host.image} alt="" width={220} height={118} />
                  <span className="farm-tile__badge">
                    <GreenBadge green={host.green} />
                  </span>
                </div>
                <div className="farm-tile__body">
                  <h3 className="farm-tile__title">{host.name}</h3>
                  <p className="farm-tile__meta">
                    {host.area} · {formatINR(host.pricePerThali)} a thali
                  </p>
                  <p className="farm-tile__special">{host.special.name}</p>
                  <p className="farm-tile__miles">
                    <img src={iconTruck} alt="" width={12} height={12} />
                    <span>
                      Food travels {host.sourcing.avgKm} km, not {host.sourcing.wholesaleKm}
                    </span>
                  </p>
                </div>
              </article>
            ))
          : [0, 1].map((i) => (
              <div key={i} className="farm-tile farm-tile--loading">
                <Skeleton variant="card" height={118} radius={0} />
                <div className="farm-tile__body">
                  <Skeleton width="70%" />
                  <Skeleton width="50%" />
                </div>
              </div>
            ))}
      </div>
    </>
  )
}
