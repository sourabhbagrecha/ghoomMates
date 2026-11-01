import { useEffect } from 'react'
import iconUsers from '../../assets/figma/icon-users-primary.svg'
import iconRecycle from '../../assets/icons/icon-recycle-primary.svg'
import iconSprout from '../../assets/icons/icon-sprout-primary.svg'
import iconTruck from '../../assets/icons/icon-truck-primary.svg'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { useEntryRoute, useNavigate } from '../../hooks/navigation'
import { hospitalityApi, type Forecast, type HostCard } from '../../services/hospitalityService'
import { DemandCard } from './DemandCard'
import { formatKg, percent, rememberHost, recalledHost } from './hospitalityData'
import { GreenBadge } from './HospitalityParts'
import { MenuCard } from './MenuCard'
import { OrdersSection } from './OrdersSection'
import { useLoad } from './useLoad'
import { WasteCard } from './WasteCard'
import './HostDashboardPage.css'

const REFRESH_MS = 30_000
const DEFAULT_HOST = 'kesar-pol-haveli'

/**
 * #/host[/<hostId>]: the kitchen's side of Ghoommates. Squad bookings and a walk-in baseline become the week's covers,
 * a farm order, a menu and a leftover log. Any signed-in user can open any sample kitchen, so a demo can switch between them.
 */
export function HostDashboardPage({ hostId }: { hostId?: string }) {
  const navigate = useNavigate()
  const back = useEntryRoute('host', 'profile')
  const list = useLoad(hospitalityApi.hosts, 'hosts')
  const hosts = list.data?.hosts ?? []
  const wanted = hostId ?? recalledHost() ?? DEFAULT_HOST
  // A route or a remembered id that no longer exists falls back to the first kitchen
  const current: HostCard | undefined = hosts.find((h) => h.id === wanted) ?? hosts[0]
  const id = current?.id ?? null

  const forecast = useLoad(() => hospitalityApi.forecast(id!), id && `forecast:${id}`)
  const waste = useLoad(() => hospitalityApi.waste(id!), id && `waste:${id}`)

  useEffect(() => {
    if (id) rememberHost(id)
  }, [id])

  // New bookings from squads show up without a pull-to-refresh
  const reloadForecast = forecast.reload
  useEffect(() => {
    if (!id) return
    const timer = window.setInterval(reloadForecast, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [id, reloadForecast])

  const pick = (next: string) => {
    if (next !== id) navigate(`host/${next}`, { replace: true })
  }

  const f = forecast.data && forecast.data.host.id === id ? forecast.data : null

  return (
    <OnboardingLayout
      eyebrow="Partner tools · Sample partner"
      title="Host kitchen"
      onBack={() => navigate(back)}
      headerHeight={250}
      headerExtra={
        <div className="host-dash__picker no-scrollbar" role="group" aria-label="Choose a kitchen">
          {hosts.length
            ? hosts.map((host) => (
                <Chip key={host.id} variant="onDark" selected={host.id === id} onClick={() => pick(host.id)}>
                  {host.name}
                </Chip>
              ))
            : [0, 1, 2].map((i) => <span key={i} className="host-dash__picker-skeleton" aria-hidden="true" />)}
        </div>
      }
      bodyClassName="host-dash__body"
    >
      {list.error && !list.data ? (
        <ErrorState title="The kitchens didn’t load" text={list.error} onRetry={list.reload} retrying={list.loading} />
      ) : !current ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="card host-dash__intro" aria-label="Kitchen">
            <div className="host-dash__intro-text">
              <h2 className="host-dash__name">{current.name}</h2>
              <p className="host-dash__where">
                {current.kindLabel} · {current.area}
              </p>
              {f && (
                <p className="host-dash__where">
                  {f.days[0].label} to {f.days[f.days.length - 1].label}
                </p>
              )}
            </div>
            <GreenBadge green={(f ?? current).green} />
          </section>

          {forecast.error && !f ? (
            <ErrorState title="Couldn’t load the week" text={forecast.error} onRetry={forecast.reload} retrying={forecast.loading} />
          ) : !f ? (
            <DashboardSkeleton />
          ) : (
            <>
              <Kpis forecast={f} />
              {/* Keyed by kitchen so the picked day, the drafted menu and the stepper start fresh for each one */}
              <DemandCard key={current.id} forecast={f} />
              <OrdersSection forecast={f} />
              <MenuCard key={current.id} hostId={current.id} forecast={f} />
              <WasteCard key={current.id} hostId={current.id} trend={waste.data} onLogged={(trend) => waste.setData(trend)} />
              <p className="sample-note host-dash__note">
                Sample partner. Squad bookings are real; walk-ins, food miles and waste avoided are estimates (see the module doc for the assumptions).
              </p>
            </>
          )}
        </>
      )}
    </OnboardingLayout>
  )
}

function DashboardSkeleton() {
  return (
    <div className="host-dash__loading" aria-busy="true" aria-label="Loading the kitchen’s week">
      <div className="host-dash__kpis">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="card" height={104} />
        ))}
      </div>
      <Skeleton variant="card" height={220} />
      <Skeleton variant="card" height={160} />
    </div>
  )
}

function Kpis({ forecast: f }: { forecast: Forecast }) {
  const tiles = [
    {
      id: 'covers',
      icon: iconUsers,
      label: 'Covers · 7 days',
      value: f.totals.covers.toLocaleString('en-IN'),
      sub: `${f.totals.booked} from squads · ${f.totals.walkIn} walk-ins (est.)`,
      highlight: f.totals.booked > 0,
    },
    {
      id: 'local',
      icon: iconSprout,
      label: 'Local sourcing',
      value: percent(f.procurement.localShare),
      sub: `${formatKg(f.procurement.localKg)} of ${formatKg(f.procurement.totalKg)} from partner farms`,
      highlight: false,
    },
    {
      id: 'miles',
      icon: iconTruck,
      label: 'Food miles saved',
      value: `${f.foodMiles.savedPercent}%`,
      sub: `${f.foodMiles.avgKm} km a kilo, not ${f.foodMiles.baselineKm} · ${f.foodMiles.co2eSavedKg} kg CO₂e (est.)`,
      highlight: false,
    },
    {
      id: 'waste',
      icon: iconRecycle,
      label: 'Waste avoided',
      value: formatKg(f.waste.avoidedKg),
      sub: `${f.waste.overproductionKg} kg squads cooked to count · ${f.waste.spoilageKg} kg ordered to forecast (est.)`,
      highlight: false,
    },
  ]
  return (
    <section className="host-dash__kpis" aria-label="This week at a glance">
      {tiles.map((tile) => (
        <article key={tile.id} className={`card kpi${tile.highlight ? ' kpi--lit' : ''}`}>
          <span className="kpi__icon">
            <img src={tile.icon} alt="" width={18} height={18} />
          </span>
          <p className="overline kpi__label">{tile.label}</p>
          <p className="kpi__value">{tile.value}</p>
          <p className="kpi__sub">{tile.sub}</p>
        </article>
      ))}
    </section>
  )
}
