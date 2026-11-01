import { useState, type CSSProperties, type ReactNode } from 'react'
import octopus from '../assets/figma/ghoommate-octopus.png'
import mascotWaving from '../assets/mascot/ghoommate-waving.webp'
import mascotStill from '../assets/mascot/ghoommate-still.png'
import iconMic from '../assets/figma/icon-mic.svg'
import { useVoice } from './voice/voiceContext'
import './GhoomMate.css'

/** Voice-first AI travel buddy. Floats bottom-right on every screen above the tab bar. */
export function GhoomMateFab() {
  const { open } = useVoice()

  return (
    <button type="button" className="ghoommate-fab" aria-label="Talk to GhoomMate" aria-haspopup="dialog" onClick={() => open()}>
      {/* Full-body waving mascot, free-standing; a still frame when motion is reduced */}
      <picture className="ghoommate-fab__mascot">
        <source srcSet={mascotStill} media="(prefers-reduced-motion: reduce)" />
        <img src={mascotWaving} alt="" width={84} height={88} />
      </picture>
      <span className="ghoommate-fab__mic">
        <img src={iconMic} alt="" width={14} height={14} />
      </span>
    </button>
  )
}

/** Contextual tip from GhoomMate, shown next to the FAB. */
export function GhoomMateSays({ children }: { children: ReactNode }) {
  const [minimized, setMinimized] = useState(false)
  if (minimized) return null

  return (
    <div className="ghoommate-says" role="status">
      <button
        type="button"
        className="ghoommate-says__close"
        aria-label="Minimize GhoomMate tip"
        onClick={() => setMinimized(true)}
      >
        ×
      </button>
      <p>{children}</p>
    </div>
  )
}

type GhoomMateAvatarProps = {
  size: number
  /** Yellow ring width; Figma uses 6 for the hero mascot and 2 for small ones */
  ring: number
  className?: string
}

/** The mascot in its sky-gradient circle, at any size. */
export function GhoomMateAvatar({ size, ring, className }: GhoomMateAvatarProps) {
  // Same proportions as the Figma mascot: image is 92% of the circle, nudged 5% down
  const image = Math.round(size * 0.92)
  const style = {
    '--size': `${size}px`,
    '--ring': `${ring}px`,
    '--image': `${image}px`,
    '--image-left': `${(size - image) / 2 - ring}px`,
    '--image-top': `${Math.round(size * 0.05) - ring}px`,
  } as CSSProperties

  return (
    <span className={`ghoommate-avatar${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
      <img src={octopus} alt="" />
    </span>
  )
}

/** Inline tip card with a small mascot, used inside screen bodies. */
export function GhoomMateTip({ children }: { children: ReactNode }) {
  return (
    <div className="ghoommate-tip">
      <GhoomMateAvatar size={36} ring={2} />
      <p>{children}</p>
    </div>
  )
}
