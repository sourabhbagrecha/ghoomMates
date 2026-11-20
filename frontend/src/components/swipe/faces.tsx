// The answer area of each non-swipe card format. Each face keeps its own picks and calls onReply once.
import { useEffect, useRef, useState } from 'react'
import iconCheck from '../../assets/figma/icon-check.svg'
import type { Card, CardOption, Reply } from '../../data/taste'
import { Button } from '../Button'
import { safeIcon } from './art'
import { PICKED_MS, type Exit } from './motion'

export type FaceProps = {
  card: Card
  /** id of the card's prompt, to label the answer group */
  promptId: string
  onReply: (reply: Reply, exit: Exit) => void
}

const LIFT: Exit = { kind: 'lift' }

/** Runs one delayed callback at a time and drops it if the card goes away first */
function useLater() {
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, ms)
  }
}

/** 3 options in a row, 4 in a 2 × 2, 5–7 in rows of three (compact, without the detail line) */
const columnsFor = (count: number) => (count === 4 || count <= 2 ? 2 : 3)

type ChoiceTileProps = {
  option: CardOption
  selected: boolean
  multi: boolean
  compact: boolean
  onClick: () => void
}

/** OptionTile’s look (line icon over a short label, primary with a check when picked) plus the option’s detail line */
function ChoiceTile({ option, selected, multi, compact, onClick }: ChoiceTileProps) {
  const state = multi ? { 'aria-pressed': selected } : { role: 'radio', 'aria-checked': selected }
  const iconSize = compact ? 24 : 28
  return (
    <button
      type="button"
      className={`swipe-tile${selected ? ' swipe-tile--selected' : ''}${compact ? ' swipe-tile--compact' : ''}`}
      onClick={onClick}
      {...state}
    >
      {selected && <img className="swipe-tile__check" src={iconCheck} alt="" width={12} height={12} />}
      <img src={safeIcon(option.icon, selected ? 'white' : 'primary')} alt="" width={iconSize} height={iconSize} draggable={false} />
      <span className="swipe-tile__label">{option.label}</span>
      {!compact && option.detail && <span className="swipe-tile__detail">{option.detail}</span>}
    </button>
  )
}

/** Two halves: tap one (or drag the card toward it, handled by the stack) */
export function ThisOrThatFace({ card, promptId, onReply }: FaceProps) {
  const [chosen, setChosen] = useState<string | null>(null)
  const later = useLater()
  const choose = (option: CardOption) => {
    if (chosen) return
    setChosen(option.id)
    later(() => onReply({ kind: 'choose', optionIds: [option.id] }, LIFT), PICKED_MS)
  }

  return (
    <div className="swipe-tot" role="radiogroup" aria-labelledby={promptId}>
      {card.options.slice(0, 2).map((option, i) => {
        const half = i === 0 ? 'a' : 'b'
        const state = chosen === option.id ? ' swipe-half--chosen' : chosen ? ' swipe-half--passed' : ''
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={chosen === option.id}
            data-half={half}
            className={`swipe-half swipe-half--${half}${state}`}
            onClick={() => choose(option)}
          >
            {/* The first half is deep blue (white icon), the second sunshine yellow (primary icon) */}
            <img src={safeIcon(option.icon, half === 'a' ? 'white' : 'primary')} alt="" width={40} height={40} draggable={false} />
            <span className="swipe-half__label">{option.label}</span>
            {option.detail && <span className="swipe-half__detail">{option.detail}</span>}
          </button>
        )
      })}
      <span className="swipe-tot__or" aria-hidden="true">
        or
      </span>
    </div>
  )
}

/** Pick one of 3–5: the tile shows as picked for a moment, then the card moves on */
export function PickFace({ card, promptId, onReply }: FaceProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const later = useLater()
  const columns = columnsFor(card.options.length)
  const compact = card.options.length > 4
  const pick = (option: CardOption) => {
    if (picked) return
    setPicked(option.id)
    later(() => onReply({ kind: 'choose', optionIds: [option.id] }, LIFT), PICKED_MS)
  }

  return (
    <div className="swipe-face__scroll">
      <div className={`swipe-grid swipe-grid--${columns}`} role="radiogroup" aria-labelledby={promptId}>
        {card.options.map((option) => (
          <ChoiceTile key={option.id} option={option} selected={picked === option.id} multi={false} compact={compact} onClick={() => pick(option)} />
        ))}
      </div>
    </div>
  )
}

/** Pick any of 3–7, then Done. An exclusive option (“None, I’m easy”) clears the rest and is cleared by them. */
export function MultiFace({ card, promptId, onReply }: FaceProps) {
  const [picked, setPicked] = useState<string[]>([])
  const columns = columnsFor(card.options.length)
  const compact = card.options.length > 4
  const exclusive = new Set(card.options.filter((o) => o.exclusive).map((o) => o.id))

  const toggle = (option: CardOption) =>
    setPicked((prev) => {
      if (prev.includes(option.id)) return prev.filter((id) => id !== option.id)
      if (option.exclusive) return [option.id]
      return [...prev.filter((id) => !exclusive.has(id)), option.id]
    })

  const done = () => {
    const optionIds = card.options.filter((o) => picked.includes(o.id)).map((o) => o.id)
    if (optionIds.length) onReply({ kind: 'choose', optionIds }, LIFT)
  }

  return (
    <>
      <div className="swipe-face__scroll">
        <div className={`swipe-grid swipe-grid--${columns}`} role="group" aria-labelledby={promptId}>
          {card.options.map((option) => (
            <ChoiceTile key={option.id} option={option} selected={picked.includes(option.id)} multi compact={compact} onClick={() => toggle(option)} />
          ))}
        </div>
      </div>
      <div className="swipe-card__actions">
        <Button variant="primary" disabled={!picked.length} onClick={done}>
          Done
        </Button>
      </div>
    </>
  )
}

/** MaxDiff: a thumbs-up for the best and a thumbs-down for the worst, on two different options */
export function BestWorstFace({ card, promptId, onReply }: FaceProps) {
  const [best, setBest] = useState<string>()
  const [worst, setWorst] = useState<string>()

  const pickBest = (id: string) => {
    if (best === id) return setBest(undefined)
    setBest(id)
    if (worst === id) setWorst(undefined)
  }
  const pickWorst = (id: string) => {
    if (worst === id) return setWorst(undefined)
    setWorst(id)
    if (best === id) setBest(undefined)
  }

  return (
    <>
      <div className="swipe-face__scroll">
        <ul className="swipe-bw" aria-labelledby={promptId}>
          {card.options.map((option) => {
            const isBest = best === option.id
            const isWorst = worst === option.id
            return (
              <li key={option.id} className={`swipe-bw__row${isBest ? ' swipe-bw__row--best' : ''}${isWorst ? ' swipe-bw__row--worst' : ''}`}>
                <img src={safeIcon(option.icon, 'primary')} alt="" width={22} height={22} draggable={false} />
                <span className="swipe-bw__text">
                  <span className="swipe-bw__label">{option.label}</span>
                  {isBest && <span className="swipe-bw__tag swipe-bw__tag--best">Best</span>}
                  {isWorst && <span className="swipe-bw__tag swipe-bw__tag--worst">Worst</span>}
                  {option.detail && <span className="swipe-bw__detail">{option.detail}</span>}
                </span>
                <button
                  type="button"
                  className="swipe-bw__toggle swipe-bw__toggle--best"
                  aria-label={`Best: ${option.label}`}
                  aria-pressed={isBest}
                  onClick={() => pickBest(option.id)}
                >
                  <img src={safeIcon('thumbs-up', isBest ? 'white' : 'primary')} alt="" width={20} height={20} draggable={false} />
                </button>
                <button
                  type="button"
                  className="swipe-bw__toggle swipe-bw__toggle--worst"
                  aria-label={`Worst: ${option.label}`}
                  aria-pressed={isWorst}
                  onClick={() => pickWorst(option.id)}
                >
                  <img src={safeIcon('thumbs-down', isWorst ? 'white' : 'primary')} alt="" width={20} height={20} draggable={false} />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="swipe-card__actions">
        <Button
          variant="primary"
          disabled={!best || !worst}
          onClick={() => best && worst && onReply({ kind: 'best-worst', best, worst }, LIFT)}
        >
          Lock it in
        </Button>
      </div>
    </>
  )
}

/** A 5-stop slider from the left pole to the right; the current stop shows big above it */
export function SpectrumFace({ card, promptId, onReply }: FaceProps) {
  const stops = card.options
  const [index, setIndex] = useState(Math.floor((stops.length - 1) / 2))
  const stop = stops[index]
  if (!stop) return null
  const first = stops[0]
  const last = stops[stops.length - 1]

  return (
    <>
      <div className="swipe-face__scroll swipe-spectrum">
        {/* The slider announces the stop itself (aria-valuetext), so this big echo is for the eyes only */}
        <div className="swipe-spectrum__now" aria-hidden="true">
          <span className="swipe-spectrum__icon">
            <img src={safeIcon(stop.icon, 'primary')} alt="" width={32} height={32} draggable={false} />
          </span>
          <span className="swipe-spectrum__label">{stop.label}</span>
          <span className="swipe-spectrum__detail">{stop.detail ?? ' '}</span>
        </div>
        <div className="swipe-spectrum__slider">
          <div className="swipe-spectrum__ticks" aria-hidden="true">
            {stops.map((s, i) => (
              <span key={s.id} className={i === index ? 'swipe-spectrum__tick--on' : undefined} />
            ))}
          </div>
          <input
            className="swipe-range"
            type="range"
            min={0}
            max={stops.length - 1}
            step={1}
            value={index}
            aria-labelledby={promptId}
            aria-valuetext={stop.label}
            onChange={(e) => setIndex(Number(e.target.value))}
          />
        </div>
        <div className="swipe-spectrum__poles" aria-hidden="true">
          <span>{first.label}</span>
          <span>{last.label}</span>
        </div>
      </div>
      <div className="swipe-card__actions">
        <Button variant="primary" onClick={() => onReply({ kind: 'choose', optionIds: [stop.id] }, LIFT)}>
          Lock it in
        </Button>
      </div>
    </>
  )
}
