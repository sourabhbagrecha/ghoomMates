import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconRadar from '../../assets/icons/icon-radar-primary.svg'
import { useNavigate } from '../../hooks/navigation'
import './PartnerTools.css'

/** Settings card for site managers and city partners: the way into the Heritage Ops console */
export function PartnerTools() {
  const navigate = useNavigate()
  return (
    <section className="card partner-tools" aria-labelledby="partner-tools-title">
      <h2 id="partner-tools-title" className="overline">
        Partner tools
      </h2>
      <button type="button" className="partner-tools__row" onClick={() => navigate('ops')}>
        <span className="partner-tools__icon" aria-hidden="true">
          <img src={iconRadar} alt="" width={20} height={20} />
        </span>
        <span className="partner-tools__text">
          <span className="partner-tools__title">Heritage Ops console</span>
          <span className="partner-tools__label">Tomorrow’s crowds from squads’ plans, and advisories to ease them</span>
        </span>
        <img src={iconChevron} alt="" width={16} height={16} />
      </button>
    </section>
  )
}
