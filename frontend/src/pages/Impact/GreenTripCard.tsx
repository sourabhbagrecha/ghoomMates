import { iconUrl } from '../../assets/icons'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import { Skeleton } from '../../components/states/Skeleton'
import { useNavigate } from '../../hooks/navigation'
import type { ItineraryDay } from '../../services/tripsService'
import { planSignature } from './impactData'
import { KpiTiles } from './KpiTiles'
import { useImpact } from './useImpact'
import './GreenTripCard.css'

/**
 * Itinerary tab: the squad's Green Trip in three numbers (footprint per person, crowd-hours avoided, ₹ kept local),
 * its badge, and a way into the full page (`#/trip/itinerary/impact`). Refreshes when the plan changes.
 */
export function GreenTripCard({ tripId, days }: { tripId: string; days: ItineraryDay[] }) {
  const navigate = useNavigate()
  const { report, loading, error, reload } = useImpact(tripId, planSignature(days))

  if (!report) {
    return error ? (
      <section className="card green-card">
        <div className="green-card__head">
          <span className="green-card__icon">
            <img src={iconUrl('leaf', 'primary')} alt="" width={20} height={20} />
          </span>
          <div className="green-card__title">
            <p className="overline">Green trip</p>
            <h2 className="green-card__heading">Couldn’t count it just now</h2>
          </div>
          <button type="button" className="pill-button" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      </section>
    ) : (
      <section className="card green-card" aria-busy={loading} aria-label="Counting your green trip">
        <div className="green-card__head">
          <Skeleton variant="card" width={36} height={36} radius={14} />
          <div className="green-card__title">
            <Skeleton width={70} height={11} />
            <Skeleton width={150} height={16} />
          </div>
        </div>
        <Skeleton variant="card" height={104} radius={14} />
      </section>
    )
  }

  const empty = report.footprint.days.length === 0 && report.local.expenseCount === 0
  return (
    <section className="card green-card">
      <div className="green-card__head">
        <span className="green-card__icon">
          <img src={iconUrl('leaf', 'primary')} alt="" width={20} height={20} />
        </span>
        <div className="green-card__title">
          <p className="overline">Green trip</p>
          <h2 className="green-card__heading">Squad impact</h2>
        </div>
        {!empty && (
          <span className="green-card__badge">
            <img src={iconUrl('award', 'primary')} alt="" width={12} height={12} />
            {report.score.badge.name}
          </span>
        )}
      </div>
      {empty ? (
        <p className="green-card__empty">
          Add a few stops and log what you spend. GhoomMate counts the footprint, the crowds you dodge and the money that stays local.
        </p>
      ) : (
        <KpiTiles report={report} />
      )}
      <p className="green-card__foot">
        <span className="text-link">{empty ? 'How Green trip works' : 'See the full impact'}</span>
        <img src={iconChevron} alt="" width={16} height={16} />
      </p>
      <button type="button" className="green-card__open" aria-label="Open Green trip impact" onClick={() => navigate('trip/itinerary/impact')} />
    </section>
  )
}
