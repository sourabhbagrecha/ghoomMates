import { useState } from 'react'
import iconRefresh from '../../assets/figma/icon-refresh-sky.svg'
import iconShare from '../../assets/figma/icon-share-white.svg'
import iconSwap from '../../assets/figma/icon-swap-primary.svg'
import iconTrash from '../../assets/figma/icon-trash-muted.svg'
import { Button, LinkButton } from '../../components/Button'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { tripDayLabel } from '../../data/activeTrip'
import { splitSlotStops, type DraftPlan, type DraftStop } from '../../services/tripsService'
import { TAG_PHOTOS } from '../Trip/tripDetailData'
import './DraftStep.css'

type DraftDay = DraftPlan['days'][number]

type DraftStepProps = {
  tripName: string
  /** e.g. "Sat 12 – Wed 16 Dec" */
  dates: string
  startDate: string | null
  /** e.g. "4 mates · ₹10–20k each" */
  summary: string
  plan: DraftPlan
  sharing: boolean
  error: string | null
  onBack: () => void
  onEditDetails: () => void
  /** Asks GhoomMate for a fresh take on one day (0-based) */
  onRegenerateDay: (index: number) => Promise<DraftDay | null>
  /** The picked stops per day, saved as the trip's itinerary */
  onShare: (days: { title: string; stops: DraftStop[] }[]) => void
}

/** Slot key for a stop: which day, which position in that day */
const slotKey = (day: number, index: number) => `${day}-${index}`

/** "Sat, 12 Dec" → "Sat 12" for the day pills */
const shortDay = (startDate: string | null, n: number) =>
  startDate ? tripDayLabel(startDate, n).replace(',', '').replace(/ \w+$/, '') : `Day ${n}`

/** "For Aarav · Meera" when GhoomMate planned the stop for specific mates */
const forLabel = (stop: DraftStop) => (stop.forMembers?.length ? `For ${stop.forMembers.join(' · ')}` : null)

export function DraftStep({ tripName, dates, startDate, summary, plan, sharing, error, onBack, onEditDetails, onRegenerateDay, onShare }: DraftStepProps) {
  const [days, setDays] = useState(plan.days)
  const [dayIndex, setDayIndex] = useState(0)
  // How many times each slot has been swapped, and which slots were removed
  const [swaps, setSwaps] = useState<Record<string, number>>({})
  const [removed, setRemoved] = useState<string[]>([])
  const [lastRemoved, setLastRemoved] = useState<{ key: string; title: string } | null>(null)
  const [regenerating, setRegenerating] = useState<number | null>(null)

  const day = days[dayIndex] ?? days[0]
  const pick = (key: string, options: DraftStop[]) => options[(swaps[key] ?? 0) % options.length]
  const stops = day.slots.map((options, i) => ({ key: slotKey(dayIndex, i), options })).filter(({ key }) => !removed.includes(key))

  const swap = (key: string) => setSwaps((s) => ({ ...s, [key]: (s[key] ?? 0) + 1 }))

  const remove = (key: string, title: string) => {
    setRemoved((r) => [...r, key])
    setLastRemoved({ key, title })
  }

  const undo = () => {
    if (!lastRemoved) return
    setRemoved((r) => r.filter((k) => k !== lastRemoved.key))
    setLastRemoved(null)
  }

  const regenerate = async () => {
    const index = dayIndex
    setRegenerating(index)
    setLastRemoved(null)
    const fresh = await onRegenerateDay(index)
    if (fresh) {
      const prefix = `${index}-`
      setDays((all) => all.map((d, i) => (i === index ? fresh : d)))
      setSwaps((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith(prefix))))
      setRemoved((r) => r.filter((k) => !k.startsWith(prefix)))
    }
    setRegenerating(null)
  }

  const share = () =>
    onShare(
      days.map((d, i) => ({
        title: d.title,
        stops: d.slots.flatMap((options, j) => {
          const key = slotKey(i, j)
          if (removed.includes(key)) return []
          return options[0]?.split ? splitSlotStops(options) : [pick(key, options)]
        }),
      })),
    )

  const isRegenerating = regenerating === dayIndex

  return (
    <OnboardingLayout
      eyebrow={`Draft plan · ${dates}`}
      title={tripName}
      subtitle={`${days.length} ${days.length === 1 ? 'day' : 'days'} · ${summary}`}
      onBack={onBack}
      bodyClassName="create-draft__body"
      actions={
        <>
          <Button variant="primary" className="create-draft__share" disabled={sharing} onClick={share}>
            <img src={iconShare} alt="" width={18} height={18} />
            {sharing ? 'Saving the plan…' : 'Share with squad'}
          </Button>
          <LinkButton onClick={onEditDetails}>Edit details</LinkButton>
        </>
      }
    >
      <div className="create-draft__days" role="group" aria-label="Day">
        {days.map((_, i) => {
          const active = i === dayIndex
          return (
            <button
              key={i}
              type="button"
              className={`create-draft__day${active ? ' create-draft__day--active' : ''}`}
              aria-pressed={active}
              aria-label={`Day ${i + 1}, ${tripDayLabel(startDate, i + 1)}`}
              onClick={() => {
                setDayIndex(i)
                setLastRemoved(null)
              }}
            >
              <span className="create-draft__day-number">Day {i + 1}</span>
              <span className="create-draft__day-date">{shortDay(startDate, i + 1)}</span>
            </button>
          )
        })}
      </div>

      <div className="create-draft__day-header">
        <div className="create-draft__day-heading">
          <p className="overline">
            Day {dayIndex + 1} · {tripDayLabel(startDate, dayIndex + 1)}
          </p>
          <h2 className="create-draft__day-title">{day.title}</h2>
        </div>
        <button type="button" className="create-draft__regenerate" disabled={regenerating !== null} onClick={() => void regenerate()}>
          <img className={isRegenerating ? 'create-draft__spin' : undefined} src={iconRefresh} alt="" width={14} height={14} />
          {isRegenerating ? 'Regenerating…' : 'Regenerate this day'}
        </button>
      </div>

      <div className="create-draft__status" role="status">
        {lastRemoved && (
          <>
            Removed {lastRemoved.title}
            <button type="button" className="text-link" onClick={undo}>
              Undo
            </button>
          </>
        )}
        {error}
      </div>

      {stops.length > 0 ? (
        <ol className={`create-draft__stops${isRegenerating ? ' create-draft__stops--loading' : ''}`} aria-busy={isRegenerating}>
          {stops.map(({ key, options }) => {
            const stop = pick(key, options)
            if (options[0].split) {
              return (
                <li key={key} className="list-card create-stop">
                  <img className="create-stop__photo" src={TAG_PHOTOS[stop.tag] ?? TAG_PHOTOS.Chill} alt="" width={52} height={52} />
                  <div className="create-stop__info">
                    <p className="create-stop__meta">
                      <span className="create-stop__time">{stop.time}</span>
                      <span className="tag">Split up</span>
                    </p>
                    <ul className="create-stop__split">
                      {options.map((o, i) => (
                        <li key={i}>
                          <h3 className="create-stop__title">{o.title}</h3>
                          {forLabel(o) && <p className="create-stop__for">{forLabel(o)}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="create-stop__actions">
                    <button
                      type="button"
                      className="create-stop__action"
                      aria-label={`Remove the split plan at ${stop.time}`}
                      disabled={isRegenerating}
                      onClick={() => remove(key, options.map((o) => o.title).join(' / '))}
                    >
                      <img src={iconTrash} alt="" width={16} height={16} />
                    </button>
                  </div>
                </li>
              )
            }
            return (
              <li key={key} className="list-card create-stop">
                <img className="create-stop__photo" src={TAG_PHOTOS[stop.tag] ?? TAG_PHOTOS.Chill} alt="" width={52} height={52} />
                <div className="create-stop__info">
                  <p className="create-stop__meta">
                    <span className="create-stop__time">{stop.time}</span>
                    <span className="tag">{stop.tag}</span>
                  </p>
                  <h3 className="create-stop__title">{stop.title}</h3>
                  {forLabel(stop) && <p className="create-stop__for">{forLabel(stop)}</p>}
                </div>
                <div className="create-stop__actions">
                  <button
                    type="button"
                    className="create-stop__action"
                    aria-label={`Swap ${stop.title}`}
                    disabled={options.length < 2 || isRegenerating}
                    onClick={() => swap(key)}
                  >
                    <img src={iconSwap} alt="" width={16} height={16} />
                  </button>
                  <button
                    type="button"
                    className="create-stop__action"
                    aria-label={`Remove ${stop.title}`}
                    disabled={isRegenerating}
                    onClick={() => remove(key, stop.title)}
                  >
                    <img src={iconTrash} alt="" width={16} height={16} />
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="create-draft__empty">
          <p className="create-draft__empty-title">A free day!</p>
          <p className="create-draft__empty-text">Keep it lazy, or regenerate it for fresh ideas.</p>
        </div>
      )}

      {plan.fairness && plan.fairness.members.length > 1 && (
        <section className="create-draft__fairness" aria-label="How the plan suits each mate">
          <p className="overline">Everyone’s covered</p>
          <ul className="create-draft__fairness-list">
            {plan.fairness.members.map((m) => (
              <li key={m.name}>
                <span className="create-draft__fairness-name">{m.name}</span>
                <span className="create-draft__fairness-score">{Math.round(m.score * 100)}% match</span>
                {m.spotlights > 0 && <span className="create-draft__fairness-spots">{m.spotlights} picked for them</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <GhoomMateTip>{plan.tip || 'Swap or remove anything, then share it with the squad.'}</GhoomMateTip>
    </OnboardingLayout>
  )
}
