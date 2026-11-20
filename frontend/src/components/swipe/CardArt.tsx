import type { ReactNode } from 'react'
import type { CardPlace } from '../../data/taste'
import { ICON_ON_TONE, safeIcon, type ResolvedArt } from './art'
import { rupees } from './motion'

type CardArtProps = {
  art: ResolvedArt
  /** hero: the big top of a swipe card · band: a short strip above the options of the other formats */
  size: 'hero' | 'band'
  /** Overline and title laid over a photo's scrim (hero photos only) */
  caption?: ReactNode
  onPhotoError?: () => void
  /** Stamps and other overlays */
  children?: ReactNode
}

/** The top of a card: a credited photo, or a gradient in the axis colour with a big icon. */
export function CardArt({ art, size, caption, onPhotoError, children }: CardArtProps) {
  if (art.kind === 'illustrated') {
    const iconSize = size === 'hero' ? 88 : 44
    return (
      <div className={`swipe-art swipe-art--${size} swipe-art--illustrated swipe-art--${art.tone}`}>
        <span className="swipe-art__ring" aria-hidden="true">
          <img src={safeIcon(art.icon, ICON_ON_TONE[art.tone])} alt="" width={iconSize} height={iconSize} draggable={false} />
        </span>
        {children}
      </div>
    )
  }

  const credit = art.credit ? `Photo: ${art.credit}${art.license ? ` · ${art.license}` : ''}` : null
  return (
    <div className={`swipe-art swipe-art--${size} swipe-art--photo`}>
      <img className="swipe-art__photo" src={art.src} alt={art.alt} draggable={false} decoding="async" onError={onPhotoError} />
      {(caption || credit) && <span className="swipe-art__scrim" aria-hidden="true" />}
      {(caption || credit) && (
        <div className="swipe-art__caption">
          {caption}
          {credit &&
            (art.source ? (
              <a className="swipe-art__credit" href={art.source} target="_blank" rel="noreferrer" draggable={false}>
                {credit}
              </a>
            ) : (
              <p className="swipe-art__credit">{credit}</p>
            ))}
        </div>
      )}
      {children}
    </div>
  )
}

/** “Old city · 05:30 PM · 1 hr · ₹700 · ★ 4.6”, then the one-line pitch */
export function PlaceLine({ place }: { place: CardPlace }) {
  const meta = [
    place.area,
    place.startTime,
    place.duration,
    typeof place.priceRupees === 'number' ? rupees(place.priceRupees) : undefined,
    typeof place.rating === 'number' ? `★ ${place.rating.toFixed(1)}` : undefined,
  ].filter(Boolean)
  if (!meta.length && !place.pitch) return null
  return (
    <>
      {meta.length > 0 && <p className="swipe-card__meta">{meta.join(' · ')}</p>}
      {place.pitch && <p className="swipe-card__pitch">{place.pitch}</p>}
    </>
  )
}
