import { useState } from 'react'
import headerBg from '../../assets/figma/photos-header-bg.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconLink from '../../assets/figma/icon-link-white.svg'
import iconQr from '../../assets/figma/icon-qr.svg'
import iconSettings from '../../assets/figma/icon-settings-primary.svg'
import { Avatar } from '../../components/Avatar'
import { InviteQr } from '../../components/InviteQr'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { Skeleton } from '../../components/states/Skeleton'
import { Toast } from '../../components/Toast'
import { useActiveTrip } from '../../data/activeTrip'
import { personOf } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import type { TripSummary } from '../../services/tripsService'
import { lastTripTab } from './lastTab'
import { formatINR } from './tripFormat'
import './MembersPage.css'

type Balance = { label: string; tone: 'settled' | 'incoming' | 'due' | 'neutral' }

/** Where you stand with one mate, from the suggested transfers */
function balanceFor(memberId: string, summary: TripSummary | null): Balance {
  if (!summary) return { label: '…', tone: 'neutral' }
  if (memberId === summary.memberId) return { label: 'That’s you', tone: 'neutral' }
  const due = summary.transfers.find((t) => t.fromMemberId === summary.memberId && t.toMemberId === memberId)
  const incoming = summary.transfers.find((t) => t.toMemberId === summary.memberId && t.fromMemberId === memberId)
  if (incoming) return { label: `${formatINR(incoming.amountPaise / 100)} to you`, tone: 'incoming' }
  if (due) return { label: `You owe ${formatINR(due.amountPaise / 100)}`, tone: 'due' }
  return { label: 'Settled', tone: 'settled' }
}

const joinedOn = (iso?: string) =>
  iso ? `Joined ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''

export function MembersPage() {
  const navigate = useNavigate()
  const { trip, summary } = useActiveTrip()
  const [toast, showToast] = useToast()
  const [showQr, setShowQr] = useState(false)
  const members = trip?.members ?? []

  const shareLink = async () => {
    if (!trip) return
    const text = `Join ${trip.groupName} on GhoomMates for ${trip.name}!`
    // The native share sheet on phones; copying works everywhere else
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.name, text, url: trip.inviteUrl })
        return
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
      }
    }
    navigator.clipboard?.writeText(trip.inviteUrl).catch(() => {})
    showToast('Invite link copied')
  }

  return (
    <>
      <OnboardingLayout
        eyebrow={trip ? `${trip.name} · ${members.length} ${members.length === 1 ? 'mate' : 'mates'}` : 'Squad'}
        title={trip?.groupName ?? 'Your squad'}
        onBack={() => navigate(`trip/${lastTripTab()}`)}
        headerBg={headerBg}
        headerHeight={262}
        headerExtra={
          <div className="members__invite">
            <button type="button" className="members__invite-button" disabled={!trip} onClick={() => void shareLink()}>
              <img src={iconLink} alt="" width={18} height={18} />
              Share invite link
            </button>
            <button
              type="button"
              className={`members__invite-button${showQr ? ' members__invite-button--on' : ''}`}
              aria-pressed={showQr}
              disabled={!trip}
              onClick={() => setShowQr((v) => !v)}
            >
              <img src={iconQr} alt="" width={18} height={18} />
              {showQr ? 'Hide QR' : 'Show QR'}
            </button>
          </div>
        }
        bodyClassName="members__body"
      >
        {showQr && trip && (
          <section className="card members__qr">
            <InviteQr value={trip.inviteUrl} className="members__qr-code" inkClassName="members__qr-ink" />
            <p className="members__qr-title">Scan to join the {trip.groupName}</p>
            <p className="members__qr-link">{trip.inviteUrl.replace(/^https?:\/\//, '')}</p>
          </section>
        )}

        <section className="card members__list">
          <h2 className="overline">The squad</h2>
          {!trip ? (
            <Skeleton variant="card" height={120} />
          ) : (
            <ul>
              {members.map((m) => {
                const balance = balanceFor(m.memberId, summary)
                return (
                  <li key={m.memberId} className="member">
                    <Avatar person={m.memberId} size={40} />
                    <div className="member__text">
                      <p className="member__name">
                        {m.memberId === trip.memberId ? m.name : personOf(m.memberId).name}
                        <span className="tag">{m.role === 'organiser' ? 'Organiser' : 'Mate'}</span>
                      </p>
                      <p className="member__meta">
                        {[m.persona, joinedOn(m.joinedAt)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className={`member__balance member__balance--${balance.tone}`}>
                      {balance.tone === 'settled' && <img src={iconCheck} alt="" width={12} height={12} />}
                      {balance.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {trip && members.length === 1 && (
            <p className="member__meta">Just you so far. Share the link or QR and mates join in one tap.</p>
          )}
        </section>

        <button type="button" className="list-card members__settings" onClick={() => navigate('trip/settings')}>
          <span className="members__settings-icon">
            <img src={iconSettings} alt="" width={20} height={20} />
          </span>
          <span className="members__settings-text">
            <span className="members__settings-title">Trip settings</span>
            <span className="members__settings-note">Name, dates, currency, notifications</span>
          </span>
          <img src={iconChevron} alt="" width={16} height={16} />
        </button>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
