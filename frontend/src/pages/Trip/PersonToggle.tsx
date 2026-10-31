import iconCheck from '../../assets/figma/icon-check.svg'
import { Avatar } from '../../components/Avatar'
import { PEOPLE, type PersonId } from '../../data/people'
import './PersonToggle.css'

type PersonToggleProps = {
  person: PersonId
  selected: boolean
  onClick: () => void
  /** Accessible name prefix, e.g. "Paid by" or "Going" */
  label: string
}

/** 44px avatar with name that toggles on and off (who’s going, paid by). */
export function PersonToggle({ person, selected, onClick, label }: PersonToggleProps) {
  const { name } = PEOPLE[person]

  return (
    <button
      type="button"
      className={`person-toggle${selected ? ' person-toggle--selected' : ''}`}
      aria-pressed={selected}
      aria-label={`${label}: ${name}`}
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
    </button>
  )
}
