import iconCheck from '../../assets/figma/icon-check.svg'
import { Avatar } from '../../components/Avatar'
import { personOf, type PersonId } from '../../data/people'
import './PersonToggle.css'

type PersonToggleProps = {
  person: PersonId
  selected: boolean
  onClick: () => void
  /** Accessible name prefix, e.g. "Paid by" or "Going" */
  label: string
  disabled?: boolean
  /** Small line under the name, e.g. "No selfie"; also read out after the name */
  hint?: string
}

/** 44px avatar with name that toggles on and off (who’s going, paid by). */
export function PersonToggle({ person, selected, onClick, label, disabled, hint }: PersonToggleProps) {
  const { name } = personOf(person)

  return (
    <button
      type="button"
      className={`person-toggle${selected ? ' person-toggle--selected' : ''}`}
      aria-pressed={selected}
      aria-label={`${label}: ${name}${hint ? `, ${hint.toLowerCase()}` : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="person-toggle__ring">
        <Avatar person={person} size={44} />
        {selected && (
          <span className="person-toggle__check">
            <img src={iconCheck} alt="" width={10} height={10} />
          </span>
        )}
      </span>
      <span className="person-toggle__name">{name}</span>
      {hint && <span className="person-toggle__hint">{hint}</span>}
    </button>
  )
}
