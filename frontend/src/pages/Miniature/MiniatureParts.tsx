import iconCheck from '../../assets/figma/icon-check.svg'
import iconUsers from '../../assets/figma/icon-users-primary.svg'
import { iconUrl } from '../../assets/icons'
import { SectionHeader } from '../../components/SectionHeader'
import { Skeleton } from '../../components/states/Skeleton'
import type { Artwork, ArtworkGallery, ArtworkStyleId } from '../../services/artworksService'
import type { TripPhoto } from '../../services/tripsService'
import { COMMISSION, faceCount, STYLES, timeAgo } from './miniatureData'
import './MiniatureParts.css'

/** How many photos the strip shows before "See all" */
const STRIP_LIMIT = 24

type PhotoPickerProps = {
  /** Best group shots first */
  photos: TripPhoto[]
  selectedId: string | null
  expanded: boolean
  onExpand: (expanded: boolean) => void
  onSelect: (photoId: string) => void
}

/** Step 1: the trip's photos as a strip of tiles (or a grid), with the number of faces found in each. */
export function PhotoPicker({ photos, selectedId, expanded, onExpand, onSelect }: PhotoPickerProps) {
  const shown = expanded ? photos : photos.slice(0, STRIP_LIMIT)
  return (
    <section className="photo-picker">
      <SectionHeader
        title="Pick a squad photo"
        action={
          photos.length > STRIP_LIMIT ? (
            <button type="button" className="text-link" aria-expanded={expanded} onClick={() => onExpand(!expanded)}>
              {expanded ? 'Show fewer' : `See all ${photos.length}`}
            </button>
          ) : undefined
        }
      />
      <div className={`photo-picker__tiles${expanded ? ' photo-picker__tiles--grid' : ' no-scrollbar'}`} role="group" aria-label="Squad photo">
        {shown.map((photo, i) => {
          const selected = photo.id === selectedId
          const faces = faceCount(photo)
          return (
            <button
              key={photo.id}
              type="button"
              aria-pressed={selected}
              aria-label={`Photo ${i + 1} from ${photo.uploadedBy.name.split(' ')[0]}${faces > 1 ? `, ${faces} faces` : ''}`}
              className={`photo-picker__tile${selected ? ' photo-picker__tile--selected' : ''}`}
              onClick={() => onSelect(photo.id)}
            >
              <img src={photo.url} alt="" width={88} height={88} loading="lazy" />
              {faces > 1 && (
                <span className="photo-picker__faces">
                  <img src={iconUsers} alt="" width={10} height={10} />
                  {faces}
                </span>
              )}
              {selected && (
                <span className="photo-picker__check">
                  <img src={iconCheck} alt="" width={12} height={12} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Step 2: the four traditions, each with a sample painting and one line on where it comes from. */
export function StylePicker({ selected, onSelect }: { selected: ArtworkStyleId; onSelect: (id: ArtworkStyleId) => void }) {
  return (
    <section className="style-picker">
      <SectionHeader title="Choose a tradition" />
      <div className="style-picker__list" role="group" aria-label="Painting tradition">
        {STYLES.map((style) => {
          const isSelected = style.id === selected
          return (
            <button
              key={style.id}
              type="button"
              aria-pressed={isSelected}
              className={`list-card style-card${isSelected ? ' style-card--selected' : ''}`}
              onClick={() => onSelect(style.id)}
            >
              <img className="style-card__thumb" src={style.sample} alt="" width={112} height={84} loading="lazy" />
              <span className="style-card__text">
                <span className="style-card__name">{style.name}</span>
                <span className="style-card__tradition">{style.tradition}</span>
              </span>
              <span className="style-card__radio" aria-hidden="true">
                {isSelected && <img src={iconCheck} alt="" width={12} height={12} />}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** "Want the real thing?": the way from the AI keepsake to a real painter's income. */
export function CommissionCard() {
  return (
    <section className="card commission">
      <span className="commission__icon">
        <img src={iconUrl('brush', 'primary')} alt="" width={22} height={22} />
      </span>
      <div className="commission__text">
        <h2 className="commission__title">{COMMISSION.title}</h2>
        <p className="commission__body">{COMMISSION.text}</p>
        <a className="pill-button commission__link" href={COMMISSION.href}>
          {COMMISSION.action}
          <img src={iconUrl('brush', 'white')} alt="" width={14} height={14} />
        </a>
      </div>
    </section>
  )
}

type SquadGalleryProps = {
  gallery: ArtworkGallery | null
  failed: boolean
  /** The signed-in user's id, so their own paintings say "You" */
  youId: string | undefined
  openId: string | null
  onOpen: (artwork: Artwork) => void
  onRetry: () => void
}

/** Everything the squad has painted on this trip, newest first. */
export function SquadGallery({ gallery, failed, youId, openId, onOpen, onRetry }: SquadGalleryProps) {
  const items = gallery?.items ?? []
  return (
    <section className="gallery" aria-busy={!gallery && !failed}>
      <SectionHeader title="Squad gallery" action={items.length ? <span className="gallery__count">{items.length}</span> : undefined} />
      {failed ? (
        <p className="gallery__note">
          Couldn’t load the gallery.{' '}
          <button type="button" className="text-link" onClick={onRetry}>
            Try again
          </button>
        </p>
      ) : !gallery ? (
        <Skeleton variant="card" height={130} />
      ) : !items.length ? (
        <p className="gallery__note">Nothing painted yet. The first miniature is yours to make.</p>
      ) : (
        <ul className="gallery__grid">
          {items.map((artwork) => (
            <li key={artwork.id}>
              <button
                type="button"
                className={`gallery__tile${artwork.id === openId ? ' gallery__tile--open' : ''}`}
                aria-label={`${artwork.styleName} by ${artwork.createdBy.userId === youId ? 'you' : artwork.createdBy.name}`}
                onClick={() => onOpen(artwork)}
              >
                <img src={artwork.url} alt="" width={160} height={120} loading="lazy" />
                <span className="gallery__style">{artwork.styleName}</span>
                <span className="gallery__by">
                  {artwork.createdBy.userId === youId ? 'You' : artwork.createdBy.name.split(' ')[0]} · {timeAgo(artwork.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
