import iconSparkles from '../../assets/figma/icon-sparkles-primary.svg'
import iconStar from '../../assets/figma/icon-star-small.svg'
import './StopWhy.css'

/*
 * Why a stop is on the plan, shared by the Itinerary timeline, the create-trip draft and the stop page.
 * The why line only ever credits fans ("Riya’s must-do"); who said no is never shown.
 */

/** Small muted line with a sparkle: "Riya’s must-do", "Everyone’s in · 4 of 4 liked" */
export function WhyLine({ why, clamp = false }: { why: string | null | undefined; clamp?: boolean }) {
  if (!why) return null
  return (
    <p className={`why-line${clamp ? ' why-line--clamp' : ''}`}>
      <img className="why-line__icon" src={iconSparkles} alt="" width={12} height={12} />
      <span className="why-line__text">{why}</span>
    </p>
  )
}

/** "For Riya · Kabir": who GhoomMate planned the stop for */
export function ForChip({ label }: { label: string | null }) {
  return label ? <span className="for-chip">{label}</span> : null
}

/** A split slot: this stop runs at the same time as another option for other mates */
export function SplitTag() {
  return <span className="split-tag">Split</span>
}

/** A stop from a trip card someone loved */
export function MustDoStar() {
  return <img className="must-do-star" src={iconStar} alt="Must-do" title="Must-do" width={12} height={12} />
}
