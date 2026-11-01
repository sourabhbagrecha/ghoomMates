import { useEffect, useId, useState } from 'react'
import { iconUrl } from '../../assets/icons'
import { Chip } from '../../components/Chip'
import { makersApi, type Craft, type ItemSize, type PriceCheck } from '../../services/makersService'
import { formatINR } from '../Trip/tripFormat'
import { VERDICT_TONE } from './makersData'
import './PriceChecker.css'

const SIZE_LABEL: Record<ItemSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' }

/** ₹300 to ₹800 → "₹300–800" */
const shortRange = (min: number, max: number) => `${formatINR(min)}–${formatINR(max).slice(1)}`

/** Round to a figure people say out loud, like the server does */
const niceRound = (n: number) => {
  const step = n < 500 ? 10 : n < 5000 ? 50 : n < 25000 ? 100 : 500
  return Math.round(n / step) * step
}

/**
 * Is that quote fair? Pick the craft and the size, type what the seller asked, and the server compares it with the
 * usual range for a handmade piece (estimates) and suggests what to offer.
 */
export function PriceChecker({ crafts, defaultCraftId }: { crafts: Craft[]; defaultCraftId: string }) {
  const headingId = useId()
  const [craftId, setCraftId] = useState(defaultCraftId)
  const [size, setSize] = useState<ItemSize>('medium')
  const [digits, setDigits] = useState('')
  const [antique, setAntique] = useState(false)
  const [result, setResult] = useState<PriceCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [failed, setFailed] = useState(false)

  const craft = crafts.find((c) => c.id === craftId) ?? crafts[0]
  const band = craft.prices.find((p) => p.size === size) ?? craft.prices[0]
  const quoted = Number(digits)

  // Check as they type, once they pause
  useEffect(() => {
    if (!quoted) return
    let stale = false
    const timer = window.setTimeout(() => {
      setChecking(true)
      makersApi
        .priceCheck({ craftId: craft.id, size, quoted, antique })
        .then((check) => {
          if (stale) return
          setResult(check)
          setFailed(false)
        })
        .catch(() => !stale && setFailed(true))
        .finally(() => !stale && setChecking(false))
    }, 350)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [craft.id, size, quoted, antique])

  // What is on screen follows the quote box: an emptied box clears the answer, and an old answer fades until the new one lands
  const shown = quoted ? result : null
  const outdated = shown !== null && (shown.quoted !== quoted || shown.craftId !== craft.id || shown.size !== size || Boolean(shown.antiqueNote) !== antique)

  const tryExample = () => {
    if (crafts.some((c) => c.id === 'miniature')) {
      // The classic: an “antique” miniature at a tourist price
      setCraftId('miniature')
      setSize('medium')
      setDigits('2500')
      setAntique(true)
    } else {
      setDigits(String(niceRound(band.max * 2.5)))
    }
  }

  return (
    <section className="card price-checker" aria-labelledby={headingId}>
      <div className="price-checker__head">
        <span className="price-checker__icon">
          <img src={iconUrl('scale', 'primary')} alt="" width={20} height={20} />
        </span>
        <div className="price-checker__titles">
          <h2 id={headingId} className="overline">
            Fair-price checker
          </h2>
          <p className="price-checker__lead">Quoted a price? See if it’s fair before you pay.</p>
        </div>
      </div>

      {crafts.length > 1 && (
        <div className="price-checker__crafts no-scrollbar">
          {crafts.map((c) => (
            <Chip key={c.id} selected={c.id === craft.id} onClick={() => setCraftId(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="price-checker__sizes" role="radiogroup" aria-label="Size of the piece">
        {craft.prices.map((p) => (
          <button
            key={p.size}
            type="button"
            role="radio"
            aria-checked={p.size === size}
            className={`price-checker__size${p.size === size ? ' price-checker__size--selected' : ''}`}
            onClick={() => setSize(p.size)}
          >
            <span className="price-checker__size-name">{SIZE_LABEL[p.size]}</span>
            <span className="price-checker__size-range">{shortRange(p.min, p.max)}</span>
          </button>
        ))}
      </div>
      <p className="price-checker__item">{band.item}</p>

      <label className="price-checker__quote">
        <span className="price-checker__label">Their quote</span>
        <span className="price-checker__input">
          <span aria-hidden="true">₹</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            placeholder="2,500"
            value={digits ? Number(digits).toLocaleString('en-IN') : ''}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 7).replace(/^0+/, ''))}
          />
        </span>
      </label>
      <div className="price-checker__toggles">
        <Chip selected={antique} onClick={() => setAntique((v) => !v)}>
          They called it an antique
        </Chip>
      </div>

      <div className="price-checker__answer" aria-live="polite">
        {quoted > 0 && failed && <p className="price-checker__note">Couldn’t check right now. Give it a moment and try again.</p>}
        {!(quoted > 0 && failed) && shown && <PriceResult result={shown} checking={checking || outdated} />}
        {!(quoted > 0 && failed) && !shown && (
          <button type="button" className="text-link price-checker__example" onClick={tryExample}>
            {crafts.some((c) => c.id === 'miniature') ? 'Try a classic: ₹2,500 “antique” miniature' : `Try a typical tourist quote: ${formatINR(niceRound(band.max * 2.5))}`}
          </button>
        )}
      </div>
      <p className="price-checker__fineprint">
        Ranges are estimates for a handmade piece bought straight from the maker. {craft.priceNote}
      </p>
    </section>
  )
}

function PriceResult({ result, checking }: { result: PriceCheck; checking: boolean }) {
  const tone = VERDICT_TONE[result.verdict]
  return (
    <div className={`price-result price-result--${tone}${checking ? ' price-result--checking' : ''}`}>
      <div className="price-result__head">
        <span className="price-result__chip">
          <span className="price-result__dot" aria-hidden="true" />
          {result.headline}
        </span>
        {result.multiple > 1 && <span className="price-result__multiple">{result.multiple}× the fair top</span>}
      </div>
      <p className="price-result__advice">{result.advice}</p>
      <RangeBar result={result} />
      {result.counter !== null && (
        <dl className="price-result__moves">
          <div>
            <dt>Offer</dt>
            <dd>{formatINR(result.counter)}</dd>
          </div>
          <div>
            <dt>Pay no more than</dt>
            <dd>{formatINR(result.walkAway)}</dd>
          </div>
        </dl>
      )}
      {result.antiqueNote && (
        <p className="price-result__antique">
          <strong>About “antique”</strong>
          {result.antiqueNote}
        </p>
      )}
    </div>
  )
}

/** The fair range as a band on a track, with a marker where the quote falls */
function RangeBar({ result }: { result: PriceCheck }) {
  const top = Math.max(result.quoted, result.fair.max) * 1.12
  const at = (n: number) => `${Math.min(100, (n / top) * 100)}%`
  return (
    <div className="range-bar">
      <div
        className="range-bar__scale"
        role="img"
        aria-label={`Fair range ${formatINR(result.fair.min)} to ${formatINR(result.fair.max)}. Their quote is ${formatINR(result.quoted)}.`}
      >
        <span className="range-bar__fair" style={{ left: at(result.fair.min), width: `${((result.fair.max - result.fair.min) / top) * 100}%` }} />
        <span className="range-bar__marker" style={{ left: at(result.quoted) }} />
      </div>
      <p className="range-bar__labels">
        <span>Fair {shortRange(result.fair.min, result.fair.max)}</span>
        <strong>Quote {formatINR(result.quoted)}</strong>
      </p>
    </div>
  )
}
