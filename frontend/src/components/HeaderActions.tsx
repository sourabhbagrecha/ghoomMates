import type { ReactNode } from 'react'
import iconBell from '../assets/figma/icon-bell-white.svg'
import iconQr from '../assets/figma/icon-qr.svg'
import { PEOPLE } from '../data/people'
import { useNavigate } from '../hooks/navigation'
import './HeaderActions.css'

/** Header buttons: a frosted action (QR invite by default) and the profile avatar. */
export function HeaderActions({ leading }: { leading?: ReactNode }) {
  const navigate = useNavigate()

  return (
    <div className="header-actions">
      {leading ?? (
        <button type="button" className="header-actions__button" aria-label="Show invite QR code">
          <img src={iconQr} alt="" width={20} height={20} />
        </button>
      )}
      <button type="button" className="header-actions__profile" aria-label="Your profile" onClick={() => navigate('profile')}>
        {PEOPLE.you.initial}
      </button>
    </div>
  )
}

/** Bell with an unread count, used as the `leading` action on Home. */
export function NotificationsButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <button
      type="button"
      className="header-actions__button"
      onClick={onClick}
      aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
    >
      <img src={iconBell} alt="" width={20} height={20} />
      {unread > 0 && <span className="header-actions__badge">{unread}</span>}
    </button>
  )
}
