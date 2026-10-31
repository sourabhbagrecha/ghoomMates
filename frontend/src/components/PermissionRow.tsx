import iconCheck from '../assets/figma/icon-check-success.svg'
import './PermissionRow.css'

type PermissionRowProps = {
  icon: string
  title: string
  description: string
  allowed: boolean
  onAllow: () => void
}

/** Explains one device permission, with an “Allow” pill that turns into “Allowed”. */
export function PermissionRow({ icon, title, description, allowed, onAllow }: PermissionRowProps) {
  return (
    <div className="permission-row">
      <span className="permission-row__icon">
        <img src={icon} alt="" width={22} height={22} />
      </span>
      <div className="permission-row__text">
        <p className="permission-row__title">{title}</p>
        <p className="permission-row__description">{description}</p>
      </div>
      {allowed ? (
        <span className="permission-row__allowed">
          <img src={iconCheck} alt="" width={14} height={14} />
          Allowed
        </span>
      ) : (
        <button type="button" className="permission-row__allow" onClick={onAllow} aria-label={`Allow ${title}`}>
          Allow
        </button>
      )}
    </div>
  )
}
