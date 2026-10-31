import iconStarOutline from '../../assets/figma/icon-star-outline.svg'
import iconStar from '../../assets/figma/icon-star.svg'
import './StarRating.css'

type StarRatingProps = {
  value: number
  size: number
  label: string
  /** Omit for a read-only rating */
  onChange?: (stars: number) => void
}

/** Five stars; interactive when `onChange` is given (same pattern as the Itinerary feedback stars). */
export function StarRating({ value, size, label, onChange }: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5]

  if (!onChange) {
    return (
      <span className="star-rating" role="img" aria-label={`${label}: ${value} out of 5`}>
        {stars.map((s) => (
          <img key={s} src={s <= value ? iconStar : iconStarOutline} alt="" width={size} height={size} />
        ))}
      </span>
    )
  }

  return (
    <span className="star-rating" role="radiogroup" aria-label={label}>
      {stars.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          aria-label={`${s} star${s > 1 ? 's' : ''}`}
          onClick={() => onChange(s)}
        >
          <img src={s <= value ? iconStar : iconStarOutline} alt="" width={size} height={size} />
        </button>
      ))}
    </span>
  )
}
