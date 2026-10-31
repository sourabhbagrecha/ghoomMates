import type { CSSProperties } from 'react'
import ellipse1 from '../../assets/figma/welcome-ellipse-1.svg'
import ellipse2 from '../../assets/figma/welcome-ellipse-2.svg'
import ellipse3 from '../../assets/figma/welcome-ellipse-3.svg'
import dot from '../../assets/figma/welcome-dot.svg'
import iconCamera from '../../assets/figma/icon-camera-sky-18.svg'
import iconMap from '../../assets/figma/icon-map-primary-18.svg'
import iconZap from '../../assets/figma/icon-zap-18.svg'
import { Button } from '../../components/Button'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { StatusBar } from '../../components/StatusBar'
import './WelcomePage.css'

// Tilted feature "stickers" around the mascot; box = rotated bounding box from Figma
const STICKERS = [
  { title: 'Day 2 planned', sub: 'by your squad’s vibe', icon: iconMap, tile: 'var(--color-yellow)', box: [14, 132.65, 170.11, 65.09], rotate: -6 },
  { title: 'Found Kabir', sub: 'in 186 pics', icon: iconCamera, tile: 'var(--color-tint)', box: [242.98, 262, 134.31, 61.33], rotate: 6 },
  { title: 'Settled in 1 tap', sub: '3 dues → 1 UPI', icon: iconZap, tile: 'var(--color-primary)', box: [22, 342.09, 145, 57.79], rotate: -4 },
]

type WelcomePageProps = {
  onGetStarted: () => void
  onHaveInvite: () => void
}

export function WelcomePage({ onGetStarted, onHaveInvite }: WelcomePageProps) {
  return (
    <div className="welcome">
      <div className="welcome__canvas">
        <img className="welcome__ellipse" src={ellipse1} alt="" width={280} height={280} style={{ left: 190, top: -80 }} />
        <img className="welcome__ellipse" src={ellipse2} alt="" width={220} height={220} style={{ left: -90, top: 560 }} />
        <img className="welcome__ellipse" src={ellipse3} alt="" width={120} height={120} style={{ left: 300, top: 410 }} />
        <StatusBar />

        <p className="welcome__wordmark">
          <img src={dot} alt="" width={10} height={10} />
          Ghoomate
        </p>

        <GhoomMateAvatar size={200} ring={6} className="welcome__mascot" />

        {STICKERS.map(({ title, sub, icon, tile, box: [left, top, width, height], rotate }) => (
          <div key={title} className="welcome__sticker-box" style={{ left, top, width, height }} aria-hidden="true">
            <div className="welcome__sticker" style={{ '--rotate': `${rotate}deg`, '--tile': tile } as CSSProperties}>
              <span className="welcome__sticker-icon">
                <img src={icon} alt="" width={18} height={18} />
              </span>
              <span className="welcome__sticker-text">
                <strong>{title}</strong>
                <span>{sub}</span>
              </span>
            </div>
          </div>
        ))}

        <div className="welcome__headline">
          <h1>Trips with your squad, sorted.</h1>
          <p>Plan together, share every pic and split every rupee, with GhoomMate by your side.</p>
          <span className="welcome__dots" aria-hidden="true">
            <span className="welcome__dot--active" />
            <span />
            <span />
          </span>
        </div>

        <div className="welcome__actions">
          <Button variant="highlight" onClick={onGetStarted}>
            Get started
          </Button>
          <Button variant="glass" onClick={onHaveInvite}>
            I have an invite link
          </Button>
          <p className="welcome__terms">By continuing you agree to our Terms and Privacy Policy</p>
          <span className="home-indicator home-indicator--light" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
