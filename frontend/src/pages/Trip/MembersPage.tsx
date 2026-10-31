import { useState } from 'react'
import headerBg from '../../assets/figma/photos-header-bg.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconLink from '../../assets/figma/icon-link-white.svg'
import iconQr from '../../assets/figma/icon-qr.svg'
import iconSettings from '../../assets/figma/icon-settings-primary.svg'
import { Avatar } from '../../components/Avatar'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { PEOPLE, SQUAD, type PersonId } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { Toast } from '../../components/Toast'
import { DUES, INCOMING, INVITE_LINK, MEMBERS, TRIP_DEPOSIT, TRIP_INFO } from './tripDetailData'
import { useTripStore } from './tripStore'
import { useToast } from '../../hooks/useToast'
import './MembersPage.css'

type Balance = { label: string; tone: 'settled' | 'incoming' | 'due' | 'neutral' }

function balanceFor(id: PersonId, settled: boolean): Balance {
  if (id === 'you') return { label: 'That’s you', tone: 'neutral' }
  const due = DUES.find((d) => d.to === id)
  const incoming = INCOMING.find((d) => d.from === id)
  if (settled || (!due && !incoming)) return { label: 'Settled', tone: 'settled' }
  if (incoming) return { label: `${incoming.amount} to you`, tone: 'incoming' }
  return { label: `You owe ${due?.amount}`, tone: 'due' }
}

export function MembersPage() {
  const navigate = useNavigate()
  const { tripName, settledVia } = useTripStore()
  const [toast, showToast] = useToast()
  const [showQr, setShowQr] = useState(false)

  const copyLink = () => {
    // TODO: generate a per-trip invite link on the server
    navigator.clipboard?.writeText(INVITE_LINK).catch(() => {})
    showToast('Invite link copied')
  }

  return (
    <>
      <OnboardingLayout
        eyebrow={`${tripName} · ${SQUAD.length} mates`}
        title={TRIP_INFO.group}
        onBack={() => navigate('trip/itinerary')}
        headerBg={headerBg}
        headerHeight={262}
        headerExtra={
          <div className="members__invite">
            <button type="button" className="members__invite-button" onClick={copyLink}>
              <img src={iconLink} alt="" width={18} height={18} />
              Copy invite link
            </button>
            <button
              type="button"
              className={`members__invite-button${showQr ? ' members__invite-button--on' : ''}`}
              aria-pressed={showQr}
              onClick={() => setShowQr((v) => !v)}
            >
              <img src={iconQr} alt="" width={18} height={18} />
              {showQr ? 'Hide QR' : 'Show QR'}
            </button>
          </div>
        }
        bodyClassName="members__body"
      >
        {showQr && (
          <section className="card members__qr">
            <InviteQr />
            <p className="members__qr-title">Scan to join the {TRIP_INFO.group}</p>
            <p className="members__qr-link">{INVITE_LINK.replace('https://', '')}</p>
          </section>
        )}

        <section className="card members__list">
          <h2 className="overline">The squad</h2>
          <ul>
            {MEMBERS.map((m) => {
              const balance = balanceFor(m.id, !!settledVia)
              return (
                <li key={m.id} className="member">
                  <Avatar person={m.id} size={40} />
                  <div className="member__text">
                    <p className="member__name">
                      {PEOPLE[m.id].name}
                      <span className="tag">{m.role}</span>
                    </p>
                    <p className="member__meta">
                      {m.vibe} ·{' '}
                      {m.depositPaid ? (
                        `${TRIP_DEPOSIT} deposit paid`
                      ) : (
                        <span className="member__pending">Deposit pending</span>
                      )}
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

const QR_SIZE = 25

/** Placeholder QR: finder squares plus a fixed pseudo-random pattern. */
function InviteQr() {
  // TODO: render a real QR code for the invite link
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= QR_SIZE - 8 && y < 8) || (x < 8 && y >= QR_SIZE - 8)
  const cells: [number, number][] = []
  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      if (!inFinder(x, y) && (x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0) cells.push([x, y])
    }
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} rx={1.5} className="members__qr-ink" />
      <rect x={x + 1} y={y + 1} width={5} height={5} rx={1} className="members__qr-paper" />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.6} className="members__qr-ink" />
    </g>
  )

  return (
    <svg className="members__qr-code" viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} width={168} height={168} role="img" aria-label="Invite QR code">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} className="members__qr-ink" />
      ))}
      {finder(0, 0)}
      {finder(QR_SIZE - 7, 0)}
      {finder(0, QR_SIZE - 7)}
    </svg>
  )
}
