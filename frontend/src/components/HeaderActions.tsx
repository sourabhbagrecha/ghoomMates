import iconQr from '../assets/figma/icon-qr.svg'
import { PEOPLE } from '../data/people'
import './HeaderActions.css'

export function HeaderActions() {
  return (
    <div className="header-actions">
      <button type="button" className="header-actions__qr" aria-label="Show invite QR code">
        <img src={iconQr} alt="" width={20} height={20} />
      </button>
      <button type="button" className="header-actions__profile" aria-label="Your profile">
        {PEOPLE.you.initial}
      </button>
    </div>
  )
}
