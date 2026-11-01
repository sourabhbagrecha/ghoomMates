import { useState } from 'react'
import iconSparkles from '../../assets/figma/icon-sparkles-primary.svg'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { Skeleton } from '../../components/states/Skeleton'
import { hospitalityApi, type Forecast, type Menu, type MenuDish } from '../../services/hospitalityService'
import { dayName, formatKg, percent, SLOT_LABELS } from './hospitalityData'
import { Stepper, ZeroWasteTip } from './HospitalityParts'

/** "Hariyali Dhani (makki, greens) · Kailashpuri Desi Dairy (dahi) · mandi (jaggery)" for one dish */
function suppliers(dish: MenuDish) {
  const groups = new Map<string, string[]>()
  for (const item of dish.ingredients) {
    const who = item.farm ? item.farm.name : 'the mandi'
    groups.set(who, [...(groups.get(who) ?? []), item.name.split(' (')[0].toLowerCase()])
  }
  return [...groups].map(([who, items]) => `${who} (${items.join(', ')})`).join(' · ')
}

/** Asks Gemini (via the API) for a seasonal farm-to-table menu for a day's covers and diets; falls back to the curated one. */
export function MenuCard({ hostId, forecast }: { hostId: string; forecast: Forecast }) {
  const days = forecast.days.slice(0, 4)
  const [dayIndex, setDayIndex] = useState(Math.min(1, days.length - 1))
  const day = days[dayIndex]
  // Until the host changes the number, the covers follow the forecast
  const [custom, setCustom] = useState<number | null>(null)
  const covers = custom ?? day.covers
  const [menu, setMenu] = useState<Menu | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickDay = (index: number) => {
    setDayIndex(index)
    setCustom(null)
    setMenu(null)
    setError(null)
  }

  const draft = async () => {
    setBusy(true)
    setError(null)
    try {
      setMenu(await hospitalityApi.menu({ hostId, date: day.date, covers }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft the menu')
    } finally {
      setBusy(false)
    }
  }

  const jain = day.diets.total.jain
  const vegan = day.diets.total.vegan
  const when = dayName(day.date, forecast.from, day.label).toLowerCase()

  return (
    <section className="card menu-card" aria-label="Menu generator">
      <div className="menu-card__head">
        <span className="menu-card__icon">
          <img src={iconSparkles} alt="" width={20} height={20} />
        </span>
        <div>
          <h2 className="menu-card__title">Draft the thali with Gemini</h2>
          <p className="menu-card__sub">A seasonal Mewari menu for your covers and diets, with the farm behind each ingredient</p>
        </div>
      </div>

      <div className="menu-card__chips" role="group" aria-label="Day">
        {days.map((d, i) => (
          <Chip key={d.date} selected={i === dayIndex} onClick={() => pickDay(i)}>
            {dayName(d.date, forecast.from, d.label)}
          </Chip>
        ))}
      </div>

      <div className="menu-card__row">
        <p className="menu-card__row-text">
          <strong>Covers</strong>
          <span>
            {jain > 0 || vegan > 0
              ? `Includes ${[jain && `${jain} Jain`, vegan && `${vegan} vegan`].filter(Boolean).join(' and ')} on ${when}`
              : `All standard thalis on ${when}`}
          </span>
        </p>
        <Stepper value={covers} min={1} max={400} step={5} label="covers" onChange={setCustom} />
      </div>

      <Button variant="primary" disabled={busy} onClick={draft}>
        {busy ? 'Planning the thali…' : menu ? 'Draft again' : 'Draft menu with Gemini'}
      </Button>

      {error && (
        <p className="menu-card__error" role="alert">
          {error}
        </p>
      )}

      {busy && (
        <div className="menu-card__busy" role="status" aria-live="polite">
          <GhoomMateAvatar size={36} ring={2} />
          <div className="menu-card__busy-lines">
            <p>GhoomMate is planning {when}’s thali. This takes about ten seconds.</p>
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </div>
        </div>
      )}

      {menu && !busy && <MenuResult menu={menu} />}
    </section>
  )
}

function MenuResult({ menu }: { menu: Menu }) {
  return (
    <div className="menu-result">
      <div className="menu-result__head">
        <h3 className="menu-result__title">{menu.title}</h3>
        <span className={`tag menu-result__source menu-result__source--${menu.source}`}>{menu.source === 'gemini' ? 'Gemini' : 'Hand-written'}</span>
      </div>
      <p className="menu-result__intro">{menu.intro}</p>
      {menu.source === 'curated' && (
        <p className="menu-result__fallback">Gemini couldn’t answer just now, so this is our hand-written {menu.season.toLowerCase()} thali.</p>
      )}
      <ol className="menu-result__dishes">
        {menu.dishes.map((dish) => (
          <li key={dish.id} className="menu-result__dish">
            <p className="menu-result__name">
              <span className="tag">{SLOT_LABELS[dish.slot] ?? dish.slot}</span>
              {dish.name}
              <span lang="hi">{dish.hindi}</span>
            </p>
            <p className="menu-result__story">{dish.story}</p>
            <p className="menu-result__from">From {suppliers(dish)}</p>
            {dish.dietNotes.map((note) => (
              <p key={note} className="menu-result__diet">
                {note}
              </p>
            ))}
          </li>
        ))}
      </ol>
      <p className="menu-result__totals">
        <strong>{formatKg(menu.totalKg)}</strong> of ingredients for {menu.covers} covers · {percent(menu.localShare)} from partner farms
      </p>
      <ZeroWasteTip>{menu.zeroWasteTip}</ZeroWasteTip>
    </div>
  )
}
