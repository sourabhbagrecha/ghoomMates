import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import headerBg from '../../assets/figma/photos-header-bg.svg'
import iconShare from '../../assets/figma/icon-share-white.svg'
import iconDownload from '../../assets/figma/icon-download-white.svg'
import { iconUrl } from '../../assets/icons'
import { Button } from '../../components/Button'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { Toast } from '../../components/Toast'
import { formatTripDates, useActiveTrip } from '../../data/activeTrip'
import { personOf } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import type { ImpactReport } from '../../services/impactService'
import type { TripDetail } from '../../services/tripsService'
import { FootprintSection } from './FootprintSection'
import { HowWeCount, KeptLocalSection, PledgesSection, QuietHoursSection, SwapsSection } from './ImpactSections'
import { KpiTiles } from './KpiTiles'
import { downloadSquadCard, renderSquadCard, shareSquadCard, type SquadCardData } from './squadCard'
import { impactStore, useImpact } from './useImpact'
import './ImpactPage.css'

/** What the shareable card shows, from the live report */
function cardData(report: ImpactReport, trip: TripDetail): SquadCardData {
  const dates = formatTripDates(trip)
  return {
    groupName: trip.groupName || trip.name,
    place: (trip.destination || trip.name).split(',')[0].trim(),
    dates: dates === 'Dates TBD' ? '' : dates,
    members: trip.members.map((m) => {
      const person = personOf(m.memberId)
      return { initial: person.initial, colour: person.color }
    }),
    squadSize: trip.members.length,
    kgPerPerson: report.footprint.perPersonKg,
    savedPct: report.footprint.savedPct,
    crowdHours: report.crowdSmart.crowdHoursAvoided,
    quietVisits: report.crowdSmart.quietVisits,
    keptPaise: report.local.keptPaise,
    keptPct: report.local.sharePct,
    hasSpend: report.local.expenseCount > 0,
    badge: { name: report.score.badge.name, level: report.score.badge.level },
    score: report.score.total,
  }
}

/** Whether the plan has any rides or timed heritage visits to count */
const planned = (report: ImpactReport) => report.footprint.days.some((d) => d.legs.length > 0) || report.crowdSmart.heritageStops > 0

/** GhoomMate's line at the top: the best swap, else what to do next */
function tipFor(report: ImpactReport): string {
  if (report.swaps[0]) return report.swaps[0].text
  return planned(report)
    ? 'Every ride is already light. Tick a pledge or two, then share the card.'
    : 'Add a few stops with places and times, and I’ll count the rides, the crowds and the rupees.'
}

/** Draws the Squad Impact Card whenever the numbers change, and keeps the PNG ready so sharing is instant */
function useSquadCard(report: ImpactReport | null, trip: TripDetail | null) {
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null)
  const urlRef = useRef<string | null>(null)
  const key = useMemo(
    () => (report && trip ? JSON.stringify(cardData(report, trip)) : null),
    [report, trip],
  )

  useEffect(() => {
    if (!key) return
    let cancelled = false
    // A short pause so a quick run of ride switches draws the card once
    const timer = window.setTimeout(() => {
      renderSquadCard(JSON.parse(key) as SquadCardData)
        .then((blob) => {
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          if (urlRef.current) URL.revokeObjectURL(urlRef.current)
          urlRef.current = url
          setCard({ blob, url })
        })
        .catch(() => {
          // The card is a bonus: the page works without it
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [key])

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )
  return card
}

export function ImpactPage() {
  const navigate = useNavigate()
  const { trip } = useActiveTrip()
  const { report, loading, error, saveError, reload } = useImpact(trip?.id ?? null)
  const [toast, showToast] = useToast()
  const card = useSquadCard(report, trip)

  // A failed ride switch or pledge puts things back and says so
  useEffect(() => {
    if (saveError && trip) {
      showToast('Couldn’t save that. Try again?')
      impactStore.clearSaveError(trip.id)
    }
  }, [saveError, trip, showToast])

  const share = useCallback(async () => {
    if (!card || !report || !trip) return
    const kg = report.footprint.perPersonKg
    const text = `${trip.groupName}: ${report.score.badge.name} on Ghoomates. ${kg} kg CO₂e each, ${report.crowdSmart.crowdHoursAvoided} crowd-hours dodged, and ${report.local.sharePct}% of our spend stayed local.`
    const result = await shareSquadCard(card.blob, text, `${trip.groupName} · Squad Impact`)
    if (result === 'saved') showToast('Card saved to your device')
  }, [card, report, trip, showToast])

  const download = () => {
    if (!card) return
    downloadSquadCard(card.blob)
    showToast('Card saved to your device')
  }

  const back = () => navigate('trip/itinerary')
  const badge = report?.score.badge
  const score = report?.score.total ?? 0

  return (
    <>
      <OnboardingLayout
        eyebrow={`${trip?.groupName ?? 'Your squad'} · Green trip`}
        title="Squad impact"
        onBack={back}
        headerBg={headerBg}
        headerHeight={262}
        bodyClassName="impact__body"
        headerExtra={
          error && !report ? undefined : (
          <div className="impact-hero" style={{ '--score': score } as CSSProperties}>
            {report && badge ? (
              <>
                <div className="impact-hero__ring" role="img" aria-label={`Green Trip score ${score} out of 100`}>
                  <span className="impact-hero__score">{score}</span>
                </div>
                <div className="impact-hero__text">
                  <p className="impact-hero__eyebrow">Squad badge</p>
                  <p className="impact-hero__badge">
                    <img src={iconUrl('award', 'white')} alt="" width={18} height={18} />
                    {badge.name}
                  </p>
                  <p className="impact-hero__next">
                    {badge.next ? `${badge.next.toGo} ${badge.next.toGo === 1 ? 'point' : 'points'} to ${badge.next.name}` : 'The top badge. The city thanks you.'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <Skeleton variant="circle" width={56} />
                <div className="impact-hero__text">
                  <Skeleton width={90} height={11} />
                  <Skeleton width={150} height={20} />
                </div>
              </>
            )}
          </div>
          )
        }
        actions={
          <Button variant="primary" disabled={!card} onClick={() => void share()}>
            <img src={iconShare} alt="" width={18} height={18} className="impact__share-icon" />
            {card || !report ? 'Share our impact card' : 'Drawing your card…'}
          </Button>
        }
      >
        {!trip || (!report && !error) ? (
          <div className="impact__loading" aria-busy="true" aria-label="Counting your green trip">
            <Skeleton variant="card" height={150} />
            <Skeleton variant="card" height={260} />
            <Skeleton variant="card" height={200} />
          </div>
        ) : !report ? (
          <ErrorState
            title="Couldn’t count your green trip"
            text="Check your connection and give it another go."
            onRetry={() => void reload()}
            retrying={loading}
          />
        ) : (
          <>
            <section className="card impact-kpis" aria-label="Your squad’s impact in three numbers">
              <KpiTiles report={report} />
            </section>
            <GhoomMateTip>{tipFor(report)}</GhoomMateTip>
            <FootprintSection report={report} tripId={trip.id} startDate={trip.startDate} />
            {(planned(report) || report.swaps.length > 0) && <SwapsSection swaps={report.swaps} tripId={trip.id} />}
            <QuietHoursSection crowd={report.crowdSmart} squad={report.squad.size} />
            <KeptLocalSection local={report.local} />
            <PledgesSection pledges={report.pledges} tripId={trip.id} me={trip.memberId} />
            <section className="card squad-card">
              <div className="impact-head">
                <span className="impact-head__icon">
                  <img src={iconUrl('share-2', 'primary')} alt="" width={20} height={20} />
                </span>
                <div className="impact-head__text">
                  <h2 className="impact-head__title">Squad Impact Card</h2>
                  <p className="impact-head__sub">Made for your story, group chat or the fridge door</p>
                </div>
              </div>
              {card ? (
                <img className="squad-card__preview" src={card.url} alt={`${trip.groupName}’s Squad Impact Card: ${report.score.badge.name}, ${report.footprint.perPersonKg} kg CO2e each, ${report.crowdSmart.crowdHoursAvoided} crowd-hours avoided, ${report.local.sharePct}% of spend kept local`} width={1080} height={1350} />
              ) : (
                <Skeleton variant="card" height={380} radius={16} />
              )}
              <button type="button" className="pill-button squad-card__download" disabled={!card} onClick={download}>
                <img src={iconDownload} alt="" width={14} height={14} />
                Save as image
              </button>
            </section>
            <HowWeCount method={report.method} />
          </>
        )}
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
