import { useId, type CSSProperties, type ReactNode } from 'react'
import { Button, LinkButton } from '../../components/Button'
import { colourValue, isLightColour } from './profileStore'
import './ProfileParts.css'

type ProfileAvatarProps = {
  name: string
  colour: string
  photo: string | null
  size: number
  /** Yellow ring, as on the header profile button; otherwise a white border */
  ring?: boolean
}

/** Your avatar in your chosen colour: photo if you added one, else your initial. */
export function ProfileAvatar({ name, colour, photo, size, ring }: ProfileAvatarProps) {
  const style = { '--size': `${size}px`, background: colourValue(colour) } as CSSProperties
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <span
      className={`profile-avatar${ring ? ' profile-avatar--ring' : ''}${isLightColour(colour) ? ' profile-avatar--light' : ''}`}
      style={style}
    >
      {photo ? <img src={photo} alt="" /> : <span aria-hidden="true">{initial}</span>}
    </span>
  )
}

/** On/off switch (same look as Trip settings). */
export function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`profile-switch${on ? ' profile-switch--on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="profile-switch__knob" />
    </button>
  )
}

type ConfirmBoxProps = {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/** Inline “are you sure?” step for destructive actions: outline confirm, never red. */
export function ConfirmBox({ title, children, confirmLabel, onConfirm, onCancel }: ConfirmBoxProps) {
  const titleId = useId()

  return (
    <div className="profile-confirm" role="group" aria-labelledby={titleId}>
      <p id={titleId} className="profile-confirm__title">
        {title}
      </p>
      <p className="profile-confirm__text">{children}</p>
      <Button variant="outline" onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <LinkButton onClick={onCancel} autoFocus>
        Cancel
      </LinkButton>
    </div>
  )
}
