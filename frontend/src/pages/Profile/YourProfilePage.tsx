import { useEffect } from 'react'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconHelp from '../../assets/figma/icon-help-circle-primary.svg'
import iconPencil from '../../assets/figma/icon-pencil-primary.svg'
import iconSettings from '../../assets/figma/icon-settings-primary.svg'
import iconSettingsWhite from '../../assets/figma/icon-settings-white.svg'
import iconSparkles from '../../assets/figma/icon-sparkles-primary-20.svg'
import { AvatarStack } from '../../components/Avatar'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { Toast } from '../../components/Toast'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { ACCOUNT, BADGES, PLACES, PLACE_STATUS, SQUAD_SCORES, SQUADS, STATS } from './profileData'
import { ProfileAvatar } from './ProfileParts'
import { currentVibe, displayName, profileActions, useProfileStore } from './profileStore'
import { VibeLegend, VibeWeb } from './VibeWeb'
import './YourProfilePage.css'

const MENU = [
  { icon: iconPencil, title: 'Edit profile', detail: 'Photo, name, colour and selfie', to: 'profile/edit' },
  { icon: iconSparkles, title: 'Retake vibe quiz', detail: '8 quick cards · about a minute', to: 'quiz' },
  { icon: iconSettings, title: 'Settings', detail: 'Account, notifications and privacy', to: 'profile/settings' },
  { icon: iconHelp, title: 'Help & FAQ', detail: 'Splits, UPI, face match and more', to: 'profile/help' },
]

export function YourProfilePage() {
  const navigate = useNavigate()
  const profile = useProfileStore()
  const vibe = currentVibe()
  const [toast, showToast] = useToast()
  const name = displayName(profile)
  const earned = BADGES.filter((b) => b.earned).length

  // Confirmation from the screen we came back from (edit profile, vibe quiz)
  useEffect(() => {
    const notice = profileActions.takeNotice()
    if (notice) showToast(notice)
  }, [showToast])

  return (
    <>
      <OnboardingLayout
        eyebrow="Account"
        title="Your profile"
        onBack={() => navigate('')}
        headerRight={
          <button
            type="button"
            className="your-profile__header-button"
            aria-label="Settings"
            onClick={() => navigate('profile/settings')}
          >
            <img src={iconSettingsWhite} alt="" width={20} height={20} />
          </button>
        }
        bodyClassName="your-profile__body"
      >
        <section className="card your-profile__card" aria-label="About you">
          <ProfileAvatar name={name} colour={profile.colour} photo={profile.photo} size={88} ring />
          <div className="your-profile__identity">
            <h2 className="your-profile__name">{name}</h2>
            <p className="your-profile__handle">{profile.username}</p>
            <p className="your-profile__since">{ACCOUNT.memberSince}</p>
          </div>
          <span className="your-profile__persona">{vibe.persona}</span>
          <dl className="your-profile__stats">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className="pill-button your-profile__edit" onClick={() => navigate('profile/edit')}>
            Edit profile
          </button>
        </section>

        <SectionHeader
          title="Your vibe"
          action={
            <button type="button" className="text-link" onClick={() => navigate('quiz')}>
              Retake quiz
            </button>
          }
        />
        <section className="card your-profile__vibe">
          <div className="your-profile__vibe-main">
            <VibeWeb you={vibe.scores} squad={SQUAD_SCORES} />
            <div className="your-profile__vibe-info">
              <p className="overline">Your spiderweb</p>
              <h3 className="your-profile__vibe-persona">{vibe.persona}</h3>
              <VibeLegend />
            </div>
          </div>
          <ul className="your-profile__traits" aria-label="Your top traits">
            {vibe.traits.map((t) => (
              <li key={t.title} className="tag">
                {t.title}
              </li>
            ))}
          </ul>
        </section>

        <SectionHeader
          title="Places visited"
          action={<span className="your-profile__section-meta">{PLACES.length} places</span>}
        />
        <ul className="your-profile__places no-scrollbar">
          {PLACES.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="your-profile__place"
                onClick={() => navigate(p.route)}
                aria-label={`${p.name}, ${p.when}, ${PLACE_STATUS[p.status]}`}
              >
                <img className="your-profile__place-photo" src={p.photo} alt="" width={128} height={84} />
                <span className="your-profile__place-body">
                  <span className="your-profile__place-name">{p.name}</span>
                  <span className="your-profile__place-meta">{p.when}</span>
                  <span className={p.status === 'now' ? 'your-profile__now' : 'tag'}>{PLACE_STATUS[p.status]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <SectionHeader
          title="Travel badges"
          action={
            <span className="your-profile__section-meta">
              {earned} of {BADGES.length} earned
            </span>
          }
        />
        <ul className="your-profile__badges">
          {BADGES.map((b) => (
            <li key={b.id} className={`list-card your-profile__badge${b.earned ? '' : ' your-profile__badge--locked'}`}>
              <span className="your-profile__badge-icon">
                <img src={b.icon} alt="" width={20} height={20} />
              </span>
              <span className="your-profile__badge-text">
                <strong>{b.title}</strong>
                <span>{b.earned ? b.detail : `Locked · ${b.detail}`}</span>
              </span>
            </li>
          ))}
        </ul>

        <SectionHeader title="Your squads" />
        <ul className="your-profile__squads">
          {SQUADS.map((s) => (
            <li key={s.id} className="list-card your-profile__squad">
              <AvatarStack people={s.members} size={26} overlap={9} />
              <span className="your-profile__row-text">
                <strong>{s.name}</strong>
                <span>{s.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <nav aria-label="Profile options">
          <ul className="your-profile__menu">
            {MENU.map((m) => (
              <li key={m.to}>
                <button type="button" className="list-card your-profile__menu-row" onClick={() => navigate(m.to)}>
                  <span className="your-profile__menu-icon">
                    <img src={m.icon} alt="" width={20} height={20} />
                  </span>
                  <span className="your-profile__row-text">
                    <strong>{m.title}</strong>
                    <span>{m.detail}</span>
                  </span>
                  <img src={iconChevron} alt="" width={16} height={16} />
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
