import type { ReactNode } from 'react'
import iconBell from '../assets/figma/icon-bell-white.svg'
import iconQr from '../assets/figma/icon-qr.svg'
import { useNavigate } from '../hooks/navigation'
import { displayName, useProfileStore } from '../pages/Profile/profileStore'
import { getStoredUser } from '../services/authService'
import './HeaderActions.css'

/** Header buttons: a frosted action (QR invite by default, opens the squad's invite on Members) and your profile avatar. */
export function HeaderActions({ leading }: { leading?: ReactNode }) {
  const navigate = useNavigate()
  const profile = useProfileStore()
  // Same avatar on every screen: the photo you picked in Edit profile, else your Google photo, else your initial
  const picture = profile.photo ?? getStoredUser()?.picture ?? null
  const initial = displayName(profile).trim().charAt(0).toUpperCase()

  return (
    <div className="header-actions">
      {leading ?? (
        <button type="button" className="header-actions__button" aria-label="Show invite QR code" onClick={() => navigate('trip/members')}>
          <img src={iconQr} alt="" width={20} height={20} />
        </button>
      )}
      <button type="button" className="header-actions__profile" aria-label="Your profile" onClick={() => navigate('profile')}>
        {picture ? <img src={picture} alt="" className="header-actions__profile-img" /> : initial}
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
