import headerBg from '../../assets/figma/explore-header-bg.svg'
import { Avatar } from '../../components/Avatar'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import type { AppNotification } from '../../data/notifications'
import { PEOPLE } from '../../data/people'
import './NotificationsPage.css'

const GROUPS = [
  { id: 'today', label: 'Today' },
  { id: 'earlier', label: 'Earlier' },
] as const

type NotificationsPageProps = {
  notifications: AppNotification[]
  /** Marks one notification read, or all of them when no id is given */
  onMarkRead: (id?: string) => void
  onBack: () => void
}

export function NotificationsPage({ notifications, onMarkRead, onBack }: NotificationsPageProps) {
  const unread = notifications.filter((n) => n.unread).length

  return (
    <OnboardingLayout
      eyebrow={unread ? `${unread} new` : 'All caught up'}
      title="Notifications"
      onBack={onBack}
      headerBg={headerBg}
      headerHeight={170}
      headerRight={
        unread > 0 && (
          <button type="button" className="onboarding__header-link" onClick={() => onMarkRead()}>
            Mark all read
          </button>
        )
      }
      bodyClassName="notifications__body"
    >
      {GROUPS.map((group) => {
        const items = notifications.filter((n) => n.group === group.id)
        if (!items.length) return null
        return (
          <section key={group.id} className="notifications__group">
            <h2 className="overline">{group.label}</h2>
            <ul>
              {items.map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={() => onMarkRead(n.id)} />
              ))}
            </ul>
          </section>
        )
      })}
    </OnboardingLayout>
  )
}

function NotificationItem({ notification: n, onRead }: { notification: AppNotification; onRead: () => void }) {
  const name = n.from === 'ghoommate' ? 'GhoomMate' : PEOPLE[n.from].name

  return (
    <li className={`list-card notification${n.unread ? ' notification--unread' : ''}`}>
      {/* TODO: open the related trip screen as well as marking it read */}
      <button type="button" className="notification__main" onClick={onRead}>
        {n.from === 'ghoommate' ? <GhoomMateAvatar size={40} ring={2} /> : <Avatar person={n.from} size={40} />}
        <span className="notification__text">
          <span className="notification__message">
            <strong>{name}</strong> {n.message}
          </span>
          <span className="notification__meta">
            {n.time} · {n.trip}
          </span>
        </span>
      </button>
      {/* TODO: wire to UPI payment / the vote sheet */}
      {n.action && (
        <button type="button" className="pill-button" onClick={onRead}>
          {n.action}
        </button>
      )}
      {n.unread && <span className="notification__dot" aria-label="Unread" />}
    </li>
  )
}
