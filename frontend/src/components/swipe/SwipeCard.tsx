import { useId, useState, type CSSProperties, type Ref } from 'react'
import type { Card, Reply } from '../../data/taste'
import { resolveArt } from './art'
import { CardArt, PlaceLine } from './CardArt'
import { BestWorstFace, MultiFace, PickFace, SpectrumFace, ThisOrThatFace } from './faces'
import type { Exit } from './motion'
import type { CataloguePhoto } from './QuizStack'
import type { useDrag } from './useDrag'

type SwipeCardProps = {
  card: Card
  /** 0 is the top card; 1 and 2 peek out behind it */
  depth: number
  photoFor?: (experienceId: string) => CataloguePhoto | undefined
  /** Top card only */
  cardRef?: Ref<HTMLElement>
  drag?: ReturnType<typeof useDrag>
  onReply?: (reply: Reply, exit: Exit) => void
}

const ignore = () => {}

/** One card of the stack: art on top, then the prompt and the answer area for its format. */
export function SwipeCard({ card, depth, photoFor, cardRef, drag, onReply = ignore }: SwipeCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const promptId = useId()
  const top = depth === 0
  const hero = card.format === 'swipe'
  // This-or-that's two halves are its art
  const art = card.format === 'this-or-that' ? undefined : resolveArt(card, photoFor, photoFailed)
  const captioned = hero && art?.kind === 'photo'
  const pitch = card.place?.pitch ?? (hero ? card.options[0]?.detail : undefined)
  const face = { card, promptId, onReply }

  const headline = (
    <>
      <p className="overline swipe-card__topic">{card.topic}</p>
      <h2 id={promptId} className="swipe-card__prompt">
        {card.prompt}
      </h2>
    </>
  )

  return (
    <section
      ref={cardRef}
      className={`swipe-card swipe-card--${card.format}`}
      style={{ '--depth': depth, zIndex: 3 - depth } as CSSProperties}
      data-depth={depth}
      aria-label={card.prompt}
      aria-hidden={top ? undefined : true}
      inert={!top}
      {...(top ? drag : undefined)}
    >
      {art && (
        <CardArt
          art={art}
          size={hero ? 'hero' : 'band'}
          caption={captioned ? <div className="swipe-art__headline">{headline}</div> : undefined}
          onPhotoError={() => setPhotoFailed(true)}
        >
          {hero && (
            <>
              <span className="swipe-stamp swipe-stamp--yes" aria-hidden="true">
                Yes
              </span>
              <span className="swipe-stamp swipe-stamp--nope" aria-hidden="true">
                Nope
              </span>
              <span className="swipe-stamp swipe-stamp--love" aria-hidden="true">
                Must-do
              </span>
            </>
          )}
        </CardArt>
      )}
      {/* A photo swipe card with its title on the photo and nothing else to say is all photo */}
      {(!captioned || card.hint || card.place || pitch) && (
        <div className={`swipe-card__body${hero ? '' : ' swipe-card__body--fill'}`}>
          <div className="swipe-card__head">
            {!captioned && headline}
            {card.hint && <p className="swipe-card__hint">{card.hint}</p>}
            {card.place ? <PlaceLine place={{ ...card.place, pitch }} /> : pitch && <p className="swipe-card__pitch">{pitch}</p>}
          </div>
          {card.format === 'this-or-that' && <ThisOrThatFace {...face} />}
          {card.format === 'pick' && <PickFace {...face} />}
          {card.format === 'multi' && <MultiFace {...face} />}
          {card.format === 'best-worst' && <BestWorstFace {...face} />}
          {card.format === 'spectrum' && <SpectrumFace {...face} />}
        </div>
      )}
    </section>
  )
}
