import { useState } from 'react'
import iconChevronDown from '../../assets/figma/icon-chevron-down-muted.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import iconTruck from '../../assets/icons/icon-truck-primary.svg'
import { Button } from '../../components/Button'
import { CoverLayout } from '../../components/CoverLayout'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { Toast } from '../../components/Toast'
import { activeTrip, useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { hospitalityApi, type FarmView, type HostDetail, type Reservation } from '../../services/hospitalityService'
import { DIET_LABELS, formatINR, GREEN_PART_NOTES, SLOT_LABELS } from './hospitalityData'
import { GreenBadge, Photo, ZeroWasteTip } from './HospitalityParts'
import { ReserveSheet } from './ReserveSheet'
import { useLoad } from './useLoad'
import './HostDetailPage.css'

/** #/trip/explore/food/<hostId>: one kitchen: its sourcing story, farms, this month's thali, and the squad's table. */
export function HostDetailPage({ hostId }: { hostId: string }) {
  const navigate = useNavigate()
  const { trip } = useActiveTrip()
  const host = useLoad(() => hospitalityApi.host(hostId), `host:${hostId}`)
  const tables = useLoad(
    () => (trip ? hospitalityApi.reservations(trip.id) : Promise.resolve({ items: [] as Reservation[], squad: null })),
    `tables:${trip?.id ?? ''}`,
  )
  const [sheetOpen, setSheetOpen] = useState(false)
  const [toast, showToast] = useToast()
  const back = () => navigate('trip/explore/food')

  if (!host.data) {
    return (
      <OnboardingLayout eyebrow="Farm-to-table" title={host.error ? 'Kitchen not found' : 'One moment…'} onBack={back} bodyClassName="food-detail__loading">
        {host.error ? (
          <ErrorState title="That kitchen didn’t load" text={host.error} onRetry={host.reload} retrying={host.loading} />
        ) : (
          <div aria-busy="true" aria-label="Loading the kitchen">
            <Skeleton variant="card" height={160} />
          </div>
        )}
      </OnboardingLayout>
    )
  }

  const h = host.data
  const mine = (tables.data?.items ?? []).filter((r) => r.hostId === h.id)

  const cancel = async (table: Reservation) => {
    try {
      await hospitalityApi.cancel(table.id)
      tables.reload()
      void activeTrip.loadItinerary()
      showToast(`Cancelled ${table.mealLabel.toLowerCase()} on ${table.dateLabel}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not cancel the table')
    }
  }

  return (
    <>
      <CoverLayout
        cover={h.image}
        onBack={back}
        overlay={
          <>
            <GreenBadge green={h.green} size="large" />
            <span className="tag">{h.kindLabel}</span>
          </>
        }
        bodyClassName="food-detail__body"
        actions={
          <>
            <p className="food-detail__price">{formatINR(h.pricePerThali)} a thali · estimate, paid at the table</p>
            <Button variant="primary" onClick={() => setSheetOpen(true)}>
              {mine.length ? 'Reserve another table' : 'Reserve a squad thali'}
            </Button>
          </>
        }
      >
        <section className="card food-detail__summary">
          <h1 className="food-detail__title">{h.name}</h1>
          <p className="food-detail__place">
            <img src={iconMapPin} alt="" width={14} height={14} />
            {h.area}, Udaipur
            <a className="text-link" href={h.directionsUrl} target="_blank" rel="noreferrer">
              Directions
            </a>
          </p>
          <p className="food-detail__tagline">{h.tagline}</p>
          <ul className="food-detail__highlights" aria-label="Highlights">
            {h.highlights.map((text) => (
              <li key={text} className="tag">
                {text}
              </li>
            ))}
          </ul>
        </section>

        {mine.length > 0 && <TablesCard tables={mine} onCancel={cancel} />}

        <GreenCard host={h} />

        <section className="card food-story">
          <h2 className="overline">Sourcing story</h2>
          <p className="food-story__text">{h.story}</p>
          <FoodMiles avgKm={h.sourcing.avgKm} wholesaleKm={h.sourcing.wholesaleKm} />
        </section>

        <section className="card food-farms" aria-label="Partner farms">
          <h2 className="overline">Partner farms · {h.farms.length}</h2>
          <ul className="food-farms__list">
            {h.farms.map((farm) => (
              <FarmRow key={farm.id} farm={farm} />
            ))}
          </ul>
          <p className="food-farms__legend">
            <span className="produce produce--fresh">Fresh now</span>
            <span className="produce produce--stored">Stored harvest</span>
            <span className="produce produce--off">Out of season</span>
          </p>
        </section>

        <section className="card food-thali">
          <h2 className="overline">{h.season.monthName} thali · {h.thali.title}</h2>
          <ol className="food-thali__dishes">
            {h.thali.dishes.map((dish) => (
              <li key={dish.id} className="food-thali__dish">
                <span className="tag">{SLOT_LABELS[dish.slot] ?? dish.slot}</span>
                <div className="food-thali__text">
                  <p className="food-thali__name">
                    {dish.name}
                    <span lang="hi">{dish.hindi}</span>
                    {dish.peak && <span className="food-thali__peak">At its best</span>}
                  </p>
                  <p className="food-thali__story">{dish.story}</p>
                  {dish.supply && (
                    <p className="food-thali__supply">
                      {dish.supply.ingredient.split(' (')[0]} from {dish.supply.farm} · {dish.supply.km} km
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <ZeroWasteTip>{h.thali.zeroWasteTip}</ZeroWasteTip>
        </section>

        <p className="sample-note food-detail__note">
          Sample partner: a real place in Udaipur, a fictional business. Prices and impact numbers are estimates.
        </p>
      </CoverLayout>

      {sheetOpen && (
        <ReserveSheet
          host={h}
          trip={trip}
          squad={tables.data?.squad ?? null}
          tables={mine}
          onClose={() => setSheetOpen(false)}
          onBooked={(message) => {
            setSheetOpen(false)
            tables.reload()
            void activeTrip.loadItinerary()
            showToast(message)
          }}
        />
      )}
      <Toast message={toast} />
    </>
  )
}

function TablesCard({ tables, onCancel }: { tables: Reservation[]; onCancel: (table: Reservation) => void }) {
  return (
    <section className="card food-tables" aria-label="Your squad’s tables here">
      <h2 className="overline">Your squad’s table</h2>
      <ul>
        {tables.map((table) => {
          const diets = (['jain', 'vegan'] as const).filter((d) => table.dietary[d] > 0).map((d) => `${table.dietary[d]} ${DIET_LABELS[d]}`)
          return (
            <li key={table.id} className="food-tables__row">
              <span className="food-tables__text">
                <strong>
                  {table.dateLabel} · {table.mealLabel}, {table.time}
                </strong>
                <span>
                  {table.headcount} guests{diets.length ? ` · ${diets.join(' · ')}` : ''}
                  {table.dayNumber ? ` · Day ${table.dayNumber} of your plan` : ''}
                </span>
              </span>
              <button type="button" className="text-link" onClick={() => onCancel(table)}>
                Cancel
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function GreenCard({ host }: { host: HostDetail }) {
  const { green } = host
  return (
    <section className="card green-card" aria-label="Green Host score">
      <div className="green-card__head">
        <span className="green-card__score" role="img" aria-label={`Green Host score ${green.score} out of 100`}>
          <strong>{green.score}</strong>
          <span>/100</span>
        </span>
        <div className="green-card__titles">
          <p className="overline">Green Host · {host.season.monthName}</p>
          <h2 className="green-card__tier">{green.tier}</h2>
          <p className="green-card__sub">Scored from four things you can check</p>
        </div>
      </div>
      <ul className="green-card__parts">
        {green.parts.map((part) => (
          <li key={part.id} className="green-card__part">
            <div className="green-card__row">
              <span className="green-card__label">{part.label}</span>
              <span className="green-card__points">
                {part.points}/{part.max}
              </span>
            </div>
            <span className="bar" role="progressbar" aria-label={part.label} aria-valuenow={part.value} aria-valuemin={0} aria-valuemax={100}>
              <span className="bar__fill bar__fill--green" style={{ width: `${Math.max(part.value, 3)}%` }} />
            </span>
            <p className="green-card__detail" title={GREEN_PART_NOTES[part.id]}>
              {part.detail}
            </p>
          </li>
        ))}
      </ul>
      {green.nextStep && (
        <p className="green-card__next">
          <strong>Next step</strong> {green.nextStep.text} (+{green.nextStep.points} points)
        </p>
      )}
    </section>
  )
}

/** Two bars on one scale: how far this kitchen's food travels against buying it all wholesale */
function FoodMiles({ avgKm, wholesaleKm }: { avgKm: number; wholesaleKm: number }) {
  return (
    <div className="miles" role="group" aria-label={`Food miles: ${avgKm} km here against about ${wholesaleKm} km from the wholesale market`}>
      <p className="miles__title">
        <img src={iconTruck} alt="" width={14} height={14} />
        Average food miles per kilo
      </p>
      <div className="miles__row">
        <span className="miles__label">Here</span>
        <span className="bar">
          <span className="bar__fill bar__fill--green" style={{ width: `${Math.max(3, (avgKm / wholesaleKm) * 100)}%` }} />
        </span>
        <span className="miles__km">{avgKm} km</span>
      </div>
      <div className="miles__row">
        <span className="miles__label">Wholesale</span>
        <span className="bar">
          <span className="bar__fill bar__fill--muted" style={{ width: '100%' }} />
        </span>
        <span className="miles__km">~{wholesaleKm} km</span>
      </div>
      <p className="miles__note">The wholesale figure is our assumption for produce arriving through the mandi chain.</p>
    </div>
  )
}

function FarmRow({ farm }: { farm: FarmView }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="food-farm">
      <button type="button" className="food-farm__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Photo className="food-farm__photo" src={farm.image} alt="" width={52} height={52} kind="farm" />
        <span className="food-farm__text">
          <strong>{farm.name}</strong>
          <span>
            {farm.village} · {farm.km} km{farm.organic ? ' · Organic' : ''}
          </span>
        </span>
        <img className={`food-farm__chevron${open ? ' food-farm__chevron--open' : ''}`} src={iconChevronDown} alt="" width={16} height={16} />
      </button>
      <ul className="food-farm__produce" aria-label={`${farm.name} grows`}>
        {farm.produce.map((item) => (
          <li key={item.id} className={`produce produce--${item.status}`}>
            {item.name.split(' (')[0]}
          </li>
        ))}
      </ul>
      {open && (
        <p className="food-farm__story">
          {farm.story} <em>{farm.practice}.</em>
        </p>
      )}
    </li>
  )
}

