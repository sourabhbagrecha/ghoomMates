import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'
import headerBg from '../../assets/figma/photos-header-bg.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { PEOPLE } from '../../data/people'
import { INVITE } from './onboardingData'
import './InvitePage.css'

const listNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]

type InvitePageProps = {
  onBack: () => void
  onJoin: () => void
  onDecline: () => void
}

export function InvitePage({ onBack, onJoin, onDecline }: InvitePageProps) {
  return (
    <OnboardingLayout
      eyebrow={`${PEOPLE[INVITE.from].name} invited you`}
      title={`Join the ${INVITE.group}`}
      onBack={onBack}
      headerBg={headerBg}
      headerHeight={262}
      headerExtra={
        <div className="invite__squad">
          <AvatarStack people={INVITE.members} size={40} overlap={10} />
          <p>{listNames(INVITE.members.map((id) => PEOPLE[id].name))} are already in</p>
        </div>
      }
      bodyClassName="invite__body"
      actions={
        <>
          <Button variant="primary" onClick={onJoin}>
            Join the squad
          </Button>
          <Button variant="outline" onClick={onDecline}>
            Not now
          </Button>
        </>
      }
    >
      <article className="invite__trip">
        <div className="invite__cover">
          {/* The 220 × 118 placeholder scaled to the card width, as in Figma */}
          <img src={photoVagator} alt="" width={220} height={118} />
          <span className="invite__badge">{INVITE.badge}</span>
        </div>
        <h2 className="invite__name">{INVITE.trip}</h2>
        <ul className="invite__details">
          <li>
            <img src={iconCalendar} alt="" width={14} height={14} />
            {INVITE.dates}
          </li>
          <li>
            <img src={iconMapPin} alt="" width={14} height={14} />
            {INVITE.place}
          </li>
        </ul>
        <hr className="invite__divider" />
        <div className="invite__vibe">
          <div>
            <p className="overline">Squad vibe</p>
            <p className="invite__vibe-name">{INVITE.vibe}</p>
          </div>
          <span className="invite__match">{INVITE.match}% match</span>
        </div>
      </article>
      <GhoomMateTip>Your vibe fits right in. I’ll add your picks to the plan once you join!</GhoomMateTip>
    </OnboardingLayout>
  )
}
