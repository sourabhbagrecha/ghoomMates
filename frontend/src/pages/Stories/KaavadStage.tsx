import { useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import iconEye from '../../assets/icons/icon-eye-sky.svg'
import iconLandmark from '../../assets/icons/icon-landmark-primary.svg'
import type { StoryPanel } from '../../services/storiesService'
import type { Copy } from './storiesData'
import './Kaavad.css'

type KaavadStageProps = {
  siteName: string
  panels: StoryPanel[]
  /** The panel on show */
  index: number
  /** The painted doors have swung open */
  open: boolean
  /** A retelling is on its way: the panels stay, dimmed */
  busy?: boolean
  /** The words around the story, in its language */
  copy: Copy
  onOpen: () => void
  /** Swipes and arrow keys */
  onStep: (direction: 1 | -1) => void
}

/** The painted art of a panel, or a patterned panel with the site's mark when it has none (or can't be loaded) */
function PanelArt({ panel, index, count, copy }: { panel: StoryPanel; index: number; count: number; copy: Copy }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`kaavad__art${panel.art && !failed ? '' : ' kaavad__art--plain'}`}>
      {panel.art && !failed ? (
        <img src={panel.art} alt="" width={640} height={400} loading={index === 0 ? 'eager' : 'lazy'} onError={() => setFailed(true)} />
      ) : (
        <img className="kaavad__art-mark" src={iconLandmark} alt="" width={44} height={44} />
      )}
      <span className="kaavad__count">{copy.panelOf(index + 1, count)}</span>
    </div>
  )
}

/**
 * The Kaavad: a painted wooden shrine whose doors swing open and whose panels unfold one by one. Panels stack in one
 * grid cell, so the shrine keeps the height of the tallest, and fold in 3D (a plain fade with reduced motion).
 */
export function KaavadStage({ siteName, panels, index, open, busy = false, copy, onOpen, onStep }: KaavadStageProps) {
  const touch = useRef<number | null>(null)

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') onStep(1)
    if (event.key === 'ArrowLeft') onStep(-1)
  }
  const onTouchStart = (event: TouchEvent) => {
    touch.current = event.touches[0].clientX
  }
  const onTouchEnd = (event: TouchEvent) => {
    if (touch.current === null) return
    const moved = event.changedTouches[0].clientX - touch.current
    touch.current = null
    if (Math.abs(moved) > 48) onStep(moved < 0 ? 1 : -1)
  }

  return (
    <div className={`kaavad${open ? ' kaavad--open' : ''}${busy ? ' kaavad--busy' : ''}`}>
      <div className="kaavad__frame">
        <div
          className="kaavad__stage"
          role="group"
          aria-roledescription="carousel"
          aria-label={`${siteName}, a story in ${panels.length} panels`}
          tabIndex={open ? 0 : -1}
          onKeyDown={onKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          aria-busy={busy}
        >
          {panels.map((panel, i) => (
            <article
              key={i}
              className="kaavad__panel"
              data-state={!open ? 'future' : i < index ? 'past' : i > index ? 'future' : 'current'}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${panels.length}`}
              aria-hidden={!open || i !== index}
              inert={!open || i !== index}
            >
              <PanelArt panel={panel} index={i} count={panels.length} copy={copy} />
              <div className="kaavad__body">
                <h2 className="kaavad__heading">{panel.heading}</h2>
                <p className="kaavad__text">{panel.text}</p>
                <p className="kaavad__look">
                  <img src={iconEye} alt="" width={16} height={16} />
                  <span>
                    <span className="kaavad__look-label">{copy.lookFor}</span>
                    {panel.lookFor}
                  </span>
                </p>
              </div>
            </article>
          ))}

          <span className="kaavad__door kaavad__door--left" aria-hidden="true" />
          <span className="kaavad__door kaavad__door--right" aria-hidden="true" />
          <button
            type="button"
            className="kaavad__plaque"
            onClick={onOpen}
            disabled={open}
            aria-hidden={open}
            aria-label={`Open the Kaavad: ${siteName}`}
          >
            <span className="kaavad__plaque-over">Kaavad Tales</span>
            <span className="kaavad__plaque-title">{siteName}</span>
            <span className="kaavad__plaque-hint">{copy.tapToOpen}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
