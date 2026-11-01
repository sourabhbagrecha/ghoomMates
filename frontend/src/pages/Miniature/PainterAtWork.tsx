import { useEffect, useState } from 'react'
import { iconUrl } from '../../assets/icons'
import { MiniatureFrame } from './MiniatureFrame'
import { DID_YOU_KNOW, painterLines, type StyleCard } from './miniatureData'
import './PainterAtWork.css'

const LINE_SECONDS = 3
const FACT_SECONDS = 7
/** After this long the painter admits it is slow, careful work */
const SLOW_AFTER = 30

/** "The painter is at work": the photo inside its frame is brushed over with colour while the picture renders. */
export function PainterAtWork({ photoUrl, style }: { photoUrl: string; style: StyleCard }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const facts = DID_YOU_KNOW.filter((fact) => !fact.only || fact.only === style.id)
  const fact = facts[Math.floor(seconds / FACT_SECONDS) % facts.length]
  const lines = painterLines(style)
  const line = seconds >= SLOW_AFTER ? 'Still painting. Fine work takes a moment…' : lines[Math.floor(seconds / LINE_SECONDS) % lines.length]
  // Eases towards the end without ever claiming to be done
  const progress = Math.round(92 * (1 - Math.exp(-seconds / 14)))

  return (
    <section className="painter" aria-busy="true" aria-label={`Painting your ${style.name}`}>
      {/* Flattens the colour layer into a few bands of paint, so the photo reads as gouache while it is "painted" */}
      <svg className="painter__defs" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="painter-gouache" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="1.1" />
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues="0 0.125 0.25 0.375 0.5 0.625 0.75 0.875 1" />
            <feFuncG type="discrete" tableValues="0 0.125 0.25 0.375 0.5 0.625 0.75 0.875 1" />
            <feFuncB type="discrete" tableValues="0 0.125 0.25 0.375 0.5 0.625 0.75 0.875 1" />
          </feComponentTransfer>
        </filter>
      </svg>
      <MiniatureFrame variant="ornate" label={style.name} className="painter__frame">
        <div className="painter__stage">
          <img className="painter__sketch" src={photoUrl} alt="" />
          <img className="painter__colour" src={photoUrl} alt="" />
          <span className="painter__edge" aria-hidden="true" />
          <span className="painter__brush" aria-hidden="true">
            <img src={iconUrl('brush', 'white')} alt="" width={18} height={18} />
          </span>
        </div>
      </MiniatureFrame>
      <h2 className="painter__line" aria-live="polite">
        {line}
      </h2>
      <div className="painter__track" role="progressbar" aria-label="Painting in progress">
        <span className="painter__fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="painter__hint">The painter is at work · about 20 seconds</p>
      <aside className="painter__fact">
        <p className="overline">Did you know</p>
        <p key={fact.text} className="painter__fact-text">
          {fact.text}
        </p>
      </aside>
    </section>
  )
}
