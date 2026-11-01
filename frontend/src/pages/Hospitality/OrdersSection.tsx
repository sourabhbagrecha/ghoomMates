import iconWhatsapp from '../../assets/icons/icon-message-circle-white.svg'
import iconStore from '../../assets/icons/icon-store-primary.svg'
import { SectionHeader } from '../../components/SectionHeader'
import type { FarmOrder, Forecast, PlanItem } from '../../services/hospitalityService'
import { formatKg, percent } from './hospitalityData'
import { Photo } from './HospitalityParts'

const REASONS: Record<NonNullable<PlanItem['reason']>, string> = {
  'out-of-season': 'Out of season on the farms',
  'no-partner': 'No partner farm grows this yet',
  pantry: 'Pantry item',
}

/**
 * The week's shopping list, one card per partner farm, with a button that opens WhatsApp with the order already written.
 * Ghoomates never sends it: the host picks the contact and taps send.
 */
export function OrdersSection({ forecast }: { forecast: Forecast }) {
  const { procurement: plan } = forecast
  return (
    <>
      <SectionHeader
        title="Farm orders"
        action={
          <span className="host-dash__meta">
            {formatKg(plan.totalKg)} · {percent(plan.localShare)} from farms
          </span>
        }
      />
      {plan.farms.map((order) => (
        <FarmOrderCard key={order.farmId} order={order} />
      ))}
      {plan.market.length > 0 && (
        <article className="card order order--market">
          <header className="order__head">
            <span className="order__photo order__photo--icon" aria-hidden="true">
              <img src={iconStore} alt="" width={22} height={22} />
            </span>
            <div className="order__names">
              <h3 className="order__title">Still from the mandi</h3>
              <p className="order__meta">No partner farm supplies these this week</p>
            </div>
          </header>
          <ul className="order__items">
            {plan.market.map((item) => (
              <li key={`${item.ingredientId}-${item.reason}`} className="order__item">
                <span className="order__name">
                  {item.name}
                  {item.reason && <span className="order__reason">{REASONS[item.reason]}</span>}
                </span>
                <strong className="order__kg">{formatKg(item.orderKg)}</strong>
              </li>
            ))}
          </ul>
        </article>
      )}
      <p className="sample-note host-dash__note">Each button opens WhatsApp with the order written out. Nothing is sent from Ghoomates.</p>
    </>
  )
}

function FarmOrderCard({ order }: { order: FarmOrder }) {
  return (
    <article className="card order">
      <header className="order__head">
        <Photo className="order__photo" src={`/hospitality/farms/${order.farmId}.jpg`} alt="" width={44} height={44} kind="farm" />
        <div className="order__names">
          <h3 className="order__title">{order.name}</h3>
          <p className="order__meta">
            {order.village} · {order.km} km{order.organic ? ' · Organic' : ''}
          </p>
        </div>
        <p className="order__total">{formatKg(order.totalKg)}</p>
      </header>
      <ul className="order__items">
        {order.items.map((item) => (
          <li key={item.ingredientId} className="order__item">
            <span className="order__name">
              {item.name}
              {item.squadKg > 0 && <span className="order__squad">+{formatKg(item.squadKg)} for squads</span>}
            </span>
            <strong className="order__kg">{formatKg(item.orderKg)}</strong>
          </li>
        ))}
      </ul>
      <a className="pill-button order__send" href={order.whatsapp.url} target="_blank" rel="noreferrer">
        <img src={iconWhatsapp} alt="" width={14} height={14} />
        Send order on WhatsApp
      </a>
    </article>
  )
}
