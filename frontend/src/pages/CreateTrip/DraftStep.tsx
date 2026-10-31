import { useEffect, useRef, useState } from 'react'
import iconRefresh from '../../assets/figma/icon-refresh-sky.svg'
import iconShare from '../../assets/figma/icon-share-white.svg'
import iconSwap from '../../assets/figma/icon-swap-primary.svg'
import iconTrash from '../../assets/figma/icon-trash-muted.svg'
import { Button, LinkButton } from '../../components/Button'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { DRAFT, DRAFT_DAYS, formatDay, formatDayShort, type DraftStop } from './createTripData'
import './DraftStep.css'

const REGENERATE_MS = 900

type DraftStepProps = {
  tripName: string
  /** e.g. "4 mates · ₹10–20k each" */
  summary: string
  onBack: () => void
  onEditDetails: () => void
  onShare: () => void
}

/** Slot key for a stop: which day, which position in that day */
const slotKey = (dayId: string, index: number) => `${dayId}-${index}`

export function DraftStep({ tripName, summary, onBack, onEditDetails, onShare }: DraftStepProps) {
  const [dayId, setDayId] = useState(DRAFT_DAYS[0].id)
  // How many times each slot has been swapped, and which slots were removed
  const [swaps, setSwaps] = useState<Record<string, number>>({})
  const [removed, setRemoved] = useState<string[]>([])
  const [lastRemoved, setLastRemoved] = useState<{ key: string; title: string } | null>(null)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const regenerateTimer = useRef<number>(undefined)

  useEffect(() => () => window.clearTimeout(regenerateTimer.current), [])

  const day = DRAFT_DAYS.find((d) => d.id === dayId) ?? DRAFT_DAYS[0]
  const dayIndex = DRAFT_DAYS.indexOf(day)

  const pick = (key: string, options: DraftStop[]) => options[(swaps[key] ?? 0) % options.length]

  const stops = day.stops
    .map((options, i) => ({ key: slotKey(day.id, i), options }))
    .filter(({ key }) => !removed.includes(key))

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

  // TODO: ask GhoomMate for a fresh day; for now every slot moves on to its next option
  const regenerate = () => {
    const id = day.id
    setRegenerating(id)
    setLastRemoved(null)
    window.clearTimeout(regenerateTimer.current)
    regenerateTimer.current = window.setTimeout(() => {
      const keys = day.stops.map((_, i) => slotKey(id, i))
      setSwaps((s) => Object.fromEntries([...Object.entries(s), ...keys.map((k) => [k, (s[k] ?? 0) + 1])]))
      setRemoved((r) => r.filter((k) => !keys.includes(k)))
      setRegenerating(null)
    }, REGENERATE_MS)
  }

  const isRegenerating = regenerating === day.id

  return (
    <OnboardingLayout
      eyebrow={`Draft plan · ${DRAFT.dates}`}
      title={tripName}
      subtitle={`${DRAFT_DAYS.length} days · ${summary}`}
      onBack={onBack}
      bodyClassName="create-draft__body"
      actions={
        <>
          <Button variant="primary" className="create-draft__share" onClick={onShare}>
            <img src={iconShare} alt="" width={18} height={18} />
            Share with squad
          </Button>
          <LinkButton onClick={onEditDetails}>Edit details</LinkButton>
        </>
      }
    >
      <div className="create-draft__days" role="group" aria-label="Day">
        {DRAFT_DAYS.map((d, i) => {
          const active = d.id === day.id
          return (
            <button
              key={d.id}
              type="button"
              className={`create-draft__day${active ? ' create-draft__day--active' : ''}`}
              aria-pressed={active}
              aria-label={`Day ${i + 1}, ${formatDay(d.date)}`}
              onClick={() => {
                setDayId(d.id)
                setLastRemoved(null)
              }}
            >
              <span className="create-draft__day-number">Day {i + 1}</span>
              <span className="create-draft__day-date">{formatDayShort(d.date)}</span>
            </button>
          )
        })}
      </div>

      <div className="create-draft__day-header">
        <div className="create-draft__day-heading">
          <p className="overline">
            Day {dayIndex + 1} · {formatDay(day.date)}
          </p>
          <h2 className="create-draft__day-title">{day.title}</h2>
        </div>
        <button type="button" className="create-draft__regenerate" disabled={isRegenerating} onClick={regenerate}>
          <img
            className={isRegenerating ? 'create-draft__spin' : undefined}
            src={iconRefresh}
            alt=""
            width={14}
            height={14}
          />
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
      </div>

      {stops.length > 0 ? (
        <ol className={`create-draft__stops${isRegenerating ? ' create-draft__stops--loading' : ''}`} aria-busy={isRegenerating}>
          {stops.map(({ key, options }) => {
            const stop = pick(key, options)
            return (
              <li key={key} className="list-card create-stop">
                <img className="create-stop__photo" src={stop.photo} alt="" width={52} height={52} />
                <div className="create-stop__info">
                  <p className="create-stop__meta">
                    <span className="create-stop__time">{stop.time}</span>
                    <span className="tag">{stop.tag}</span>
                  </p>
                  <h3 className="create-stop__title">{stop.title}</h3>
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

      <GhoomMateTip>{DRAFT.tip}</GhoomMateTip>
    </OnboardingLayout>
  )
}
