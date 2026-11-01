import iconSprout from '../../assets/icons/icon-sprout-primary.svg'
import iconTruck from '../../assets/icons/icon-truck-primary.svg'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { useNavigate } from '../../hooks/navigation'
import { hospitalityApi, type HostCard, type Season } from '../../services/hospitalityService'
import { formatINR, percent } from './hospitalityData'
import { GreenBadge, Photo } from './HospitalityParts'
import { useLoad } from './useLoad'
import './FoodListPage.css'

/** #/trip/explore/food: the farm-to-table kitchens, with what is on the farms this month. */
export function FoodListPage() {
  const navigate = useNavigate()
  const { data, error, loading, reload } = useLoad(hospitalityApi.hosts, 'hosts')

  return (
    <OnboardingLayout
      eyebrow="Udaipur · Sample partners"
      title="Farm-to-table"
      subtitle="A Mewari thali for the whole squad, from farms around the lakes"
      onBack={() => navigate('trip/explore')}
      bodyClassName="food-list__body"
    >
      {error && !data ? (
        <ErrorState title="The kitchens didn’t load" text={error} onRetry={reload} retrying={loading} />
      ) : !data ? (
        <div className="food-list__loading" aria-busy="true" aria-label="Loading kitchens">
          <Skeleton variant="card" height={120} />
          <Skeleton variant="card" height={250} />
          <Skeleton variant="card" height={250} />
        </div>
      ) : (
        <>
          <SeasonCard season={data.season} />
          <SectionHeader title="Kitchens near the lakes" action={<span className="food-list__count">Greenest first</span>} />
          {data.hosts.map((host) => (
            <HostRow key={host.id} host={host} onOpen={() => navigate(`trip/explore/food/${host.id}`)} />
          ))}
          <GhoomMateTip>
            Book ahead and the kitchen cooks for your exact head-count, so nothing goes to waste and the farms get the order first.
          </GhoomMateTip>
          <p className="sample-note food-list__note">
            Sample partners: real places around Udaipur, fictional businesses. Prices and impact numbers are estimates.
          </p>
        </>
      )}
    </OnboardingLayout>
  )
}

function SeasonCard({ season }: { season: Season }) {
  return (
    <section className="card food-season" aria-label={`${season.monthName} on the farms`}>
      <Photo className="food-season__photo" src="/hospitality/thali.jpg" alt="A Mewari thali on a brass plate" width={329} height={110} />
      <p className="overline">{season.monthName} on the farms</p>
      <h2 className="food-season__title">{season.season}</h2>
      <p className="food-season__note">{season.note}</p>
      <ul className="food-season__fresh" aria-label="Fresh this month">
        {season.fresh.slice(0, 6).map((name) => (
          <li key={name} className="tag">
            {name.split(' (')[0]}
          </li>
        ))}
      </ul>
    </section>
  )
}

function HostRow({ host, onOpen }: { host: HostCard; onOpen: () => void }) {
  return (
    <article className="food-host">
      <button type="button" className="food-host__open" aria-label={`Open ${host.name}, Green Host ${host.green.score}, ${host.green.tier}`} onClick={onOpen} />
      <div className="food-host__cover">
        <Photo src={host.image} alt="" width={361} height={150} />
        <span className="food-host__badge">
          <GreenBadge green={host.green} />
        </span>
        <span className="food-host__tier">{host.green.tier}</span>
      </div>
      <div className="food-host__body">
        <div className="food-host__head">
          <div className="food-host__names">
            <h3 className="food-host__title">{host.name}</h3>
            <p className="food-host__meta">
              {host.kindLabel} · {host.area}
            </p>
          </div>
          <p className="food-host__price">
            {formatINR(host.pricePerThali)}
            <span> /thali</span>
          </p>
        </div>
        <ul className="food-host__facts">
          <li>
            <img src={iconSprout} alt="" width={14} height={14} />
            <span>
              <strong>{percent(host.sourcing.localShare)}</strong> from {host.sourcing.farms} partner farms
            </span>
          </li>
          <li>
            <img src={iconTruck} alt="" width={14} height={14} />
            <span>
              Food travels <strong>{host.sourcing.avgKm} km</strong>, not {host.sourcing.wholesaleKm}
            </span>
          </li>
        </ul>
        <p className="food-host__special">
          <span className="overline">Today’s special</span>
          <span>
            <strong>{host.special.name}</strong>
            {host.special.supply && ` · ${host.special.supply.ingredient.split(' (')[0]} from ${host.special.supply.village}`}
          </span>
        </p>
        <button type="button" className="pill-button food-host__cta" onClick={onOpen}>
          Reserve a squad thali
        </button>
      </div>
    </article>
  )
}
