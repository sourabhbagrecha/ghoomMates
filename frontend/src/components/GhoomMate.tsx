import type { ReactNode } from 'react'
import octopus from '../assets/figma/ghoommate-octopus.png'
import iconMic from '../assets/figma/icon-mic.svg'
import './GhoomMate.css'

/** Voice-first AI travel buddy. Floats bottom-right on every screen above the tab bar. */
export function GhoomMateFab() {
  return (
    <button type="button" className="ghoommate-fab" aria-label="Talk to GhoomMate">
      <span className="ghoommate-fab__bubble">
        <img className="ghoommate-fab__mascot" src={octopus} alt="" width={64} height={64} />
      </span>
      <span className="ghoommate-fab__mic">
        <img src={iconMic} alt="" width={14} height={14} />
      </span>
    </button>
  )
}

/** Contextual tip from GhoomMate, shown next to the FAB. */
export function GhoomMateSays({ children }: { children: ReactNode }) {
  return (
    <div className="ghoommate-says" role="status">
      <p>{children}</p>
    </div>
  )
}
