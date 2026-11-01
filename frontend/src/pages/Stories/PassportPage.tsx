import { useEffect } from 'react'
import headerBg from '../../assets/figma/photos-header-bg.svg'
import iconLandmark from '../../assets/icons/icon-landmark-primary.svg'
import iconTrophy from '../../assets/icons/icon-trophy-primary.svg'
import { Avatar, AvatarStack } from '../../components/Avatar'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import type { CatalogueItem, Stamp } from '../../services/storiesService'
import { StampSeal } from './StampSeal'
import { storiesStore, useStories } from './storiesStore'
import './PassportPage.css'

const GRADE_WORD = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' } as const

function Tile({ site, stamp, holders, onOpen }: { site: CatalogueItem; stamp: Stamp | undefined; holders: string[]; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`passport-tile${stamp ? ' passport-tile--stamped' : ''}`}
      aria-label={`${site.name}: ${stamp ? `stamped, ${stamp.score} of ${stamp.total}` : 'no stamp yet'}. Hear the story`}
      onClick={onOpen}
    >
      <span className="passport-tile__cover">
        {site.art ? <img src={site.art} alt="" width={111} height={111} loading="lazy" /> : <img className="passport-tile__mark" src={iconLandmark} alt="" width={30} height={30} />}
        {stamp && (
          <span className="passport-tile__seal">
            <StampSeal siteName={site.name} grade={stamp.grade} score={stamp.score} total={stamp.total} size={62} />
          </span>
        )}
      </span>
      <span className="passport-tile__name">{site.name}</span>
      <span className="passport-tile__meta">{stamp ? `${GRADE_WORD[stamp.grade]} · ${stamp.score}/${stamp.total}` : site.curated ? 'Hear the story' : 'Short story'}</span>
      {holders.length > 0 && (
        <span className="passport-tile__squad">
          <AvatarStack people={holders.slice(0, 4)} size={18} overlap={6} />
          {holders.length > 4 && <span className="passport-tile__more">+{holders.length - 4}</span>}
        </span>
      )}
    </button>
  )
}

/** Your Heritage Passport: every Udaipur site, stamped or not yet, and how the squad is doing */
export function PassportPage() {
  const navigate = useNavigate()
  const { trip } = useActiveTrip()
  const { catalogue, stamps, passport, squad, squadTripId } = useStories()
  const tripId = trip?.id ?? null

  useEffect(() => {
    if (tripId) void storiesStore.loadSquad(tripId)
  }, [tripId])

  const total = passport?.totalSites ?? catalogue.length
  const mine = stamps.size
  const board = squad && squadTripId === tripId ? squad : null
  const leaderboard = board?.leaderboard ?? []
  const leave = () => (window.history.length > 1 ? window.history.back() : navigate('trip/explore', { replace: true }))

  return (
    <OnboardingLayout
      eyebrow="Udaipur · Kaavad Tales"
      title="Heritage Passport"
      onBack={leave}
      headerBg={headerBg}
      headerHeight={240}
      bodyClassName="passport__body"
      headerExtra={
        <div className="passport__progress">
          <div className="passport__progress-text">
            <strong>{mine}</strong> of {total} stamps
            {board && ` · squad: ${leaderboard.filter((l) => l.stamped > 0).length} of ${board.squadSize} on the board`}
          </div>
          <div className="passport__bar" role="progressbar" aria-label="Stamps collected" aria-valuemin={0} aria-valuemax={total} aria-valuenow={mine}>
            <span style={{ width: `${total ? (mine / total) * 100 : 0}%` }} />
          </div>
        </div>
      }
    >
      <section className="card passport__page">
        <SectionHeader title="Your stamps" />
        <div className="passport__grid">
          {catalogue.map((site) => (
            <Tile
              key={site.siteId}
              site={site}
              stamp={stamps.get(site.siteId)}
              holders={board?.bySite[site.siteId] ?? []}
              onOpen={() => navigate(`trip/explore/story/${site.siteId}`)}
            />
          ))}
        </div>
      </section>

      {board && leaderboard.length > 0 && (
        <section className="passport__section">
          <SectionHeader title="Squad leaderboard" />
          <ol className="card passport__board">
            {leaderboard.map((row) => (
              <li key={row.memberId} className="passport__row">
                <span className="passport__rank">
                  {row.rank === 1 && row.stamped > 0 ? <img src={iconTrophy} alt="Leader" width={18} height={18} /> : row.rank}
                </span>
                <Avatar person={row.memberId} size={34} />
                <span className="passport__who">
                  <span className="passport__name">{row.memberId === trip?.memberId ? 'You' : row.name.split(' ')[0]}</span>
                  <span className="passport__sub">
                    {row.stamped} {row.stamped === 1 ? 'stamp' : 'stamps'} · {row.points} {row.points === 1 ? 'point' : 'points'}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card passport__how">
        <h2 className="overline">How it works</h2>
        <p>
          Open a story at the place, listen to the Kavadiya Bhat, then answer three questions. Everyone who listened gets the stamp: one phone can stamp the
          whole squad.
        </p>
      </section>
    </OnboardingLayout>
  )
}
