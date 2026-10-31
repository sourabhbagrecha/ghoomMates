import { useEffect, useState } from 'react'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import headerBg from '../../assets/figma/photos-header-bg.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { Skeleton } from '../../components/states/Skeleton'
import { TextField } from '../../components/TextField'
import { activeTrip, formatTripDates, tripDay } from '../../data/activeTrip'
import { registerPeople } from '../../data/people'
import { tripCover } from '../../data/tripCover'
import { useNavigate } from '../../hooks/navigation'
import { getToken } from '../../services/authService'
import { hasOnboarded } from '../../services/onboardingStorage'
import { inviteCodeFrom, setPendingInvite } from '../../services/pendingInvite'
import { tripsApi, type InvitePreview } from '../../services/tripsService'
import { listNames } from '../Trip/tripFormat'
import './InvitePage.css'

/**
 * #/join/<code>: the screen an invite link opens. Shows the trip, then joins it (signing in first if needed).
 * #/join without a code asks for the link.
 */
export function JoinTripPage({ code }: { code?: string }) {
  const navigate = useNavigate()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [link, setLink] = useState('')

  useEffect(() => {
    if (!code) return
    // App keys this page by code, so a new code always starts from a fresh state
    let cancelled = false
    tripsApi
      .previewInvite(code)
      .then((p) => {
        if (cancelled) return
        registerPeople(p.members)
        setPreview(p)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [code])

  const back = () => navigate(getToken() && hasOnboarded() ? '' : 'welcome')

  if (!code) {
    const parsed = inviteCodeFrom(link)
    return (
      <OnboardingLayout
        eyebrow="Join a trip"
        title="Got an invite link?"
        subtitle="Paste the link (or code) a mate shared with you."
        onBack={back}
        headerBg={headerBg}
        actions={
          <Button variant="primary" disabled={!parsed} onClick={() => parsed && navigate(`join/${parsed}`, { replace: true })}>
            Find the trip
          </Button>
        }
      >
        <TextField
          label="Invite link or code"
          placeholder="localhost:5173/#/join/k7x2m9qp"
          value={link}
          autoFocus
          onChange={(e) => setLink(e.target.value)}
        />
      </OnboardingLayout>
    )
  }

  const join = async () => {
    // Not signed up yet: finish onboarding first, then come back to this invite
    if (!getToken() || !hasOnboarded()) {
      setPendingInvite(code)
      navigate(getToken() ? 'selfie' : 'sign-in')
      return
    }
    setJoining(true)
    setError(null)
    try {
      const trip = await tripsApi.join(code)
      setPendingInvite(null)
      activeTrip.open(trip.id, trip)
      void activeTrip.loadTrips()
      navigate('trip/members', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join this trip')
      setJoining(false)
    }
  }

  const open = () => {
    if (!preview) return
    setPendingInvite(null)
    activeTrip.open(preview.id)
    navigate('trip/itinerary', { replace: true })
  }

  const names = preview?.members.map((m) => m.name.split(' ')[0]) ?? []
  const days = preview ? tripDay(preview)?.total : null

  return (
    <OnboardingLayout
      eyebrow={preview?.invitedBy ? `${preview.invitedBy.name.split(' ')[0]} invited you` : 'You’re invited'}
      title={preview ? `Join the ${preview.groupName}` : error ? 'Invite not found' : 'Opening invite…'}
      onBack={back}
      headerBg={headerBg}
      headerHeight={262}
      headerExtra={
        preview && (
          <div className="invite__squad">
            <AvatarStack people={preview.members.map((m) => m.memberId)} size={40} overlap={10} />
            <p>
              {listNames(names)} {names.length === 1 ? 'is' : 'are'} already in
            </p>
          </div>
        )
      }
      bodyClassName="invite__body"
      actions={
        preview?.alreadyMember ? (
          <Button variant="primary" onClick={open}>
            You’re in · Open trip
          </Button>
        ) : (
          <>
            <Button variant="primary" disabled={!preview || joining} onClick={join}>
              {joining ? 'Joining…' : getToken() ? 'Join the squad' : 'Sign in to join'}
            </Button>
            <Button variant="outline" onClick={back}>
              Not now
            </Button>
          </>
        )
      }
    >
      {error && (
        <p className="invite__error" role="alert">
          {error}
        </p>
      )}
      {preview ? (
        <>
          <article className="invite__trip">
            <div className="invite__cover">
              <img src={tripCover(preview)} alt="" width={220} height={118} />
              <span className="invite__badge">
                {days ? `${days} days · ` : ''}
                {preview.members.length} {preview.members.length === 1 ? 'mate' : 'mates'}
              </span>
            </div>
            <h2 className="invite__name">{preview.name}</h2>
            <ul className="invite__details">
              <li>
                <img src={iconCalendar} alt="" width={14} height={14} />
                {formatTripDates(preview)}
              </li>
              {preview.destination && (
                <li>
                  <img src={iconMapPin} alt="" width={14} height={14} />
                  {preview.destination}
                </li>
              )}
            </ul>
          </article>
          <GhoomMateTip>Join and I’ll blend your vibe into the squad’s plan, and split every spend for you.</GhoomMateTip>
        </>
      ) : (
        !error && <Skeleton variant="card" height={260} />
      )}
    </OnboardingLayout>
  )
}
