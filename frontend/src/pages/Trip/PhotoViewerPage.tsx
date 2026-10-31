import { useEffect, useRef } from 'react'
import iconBack from '../../assets/figma/icon-back-white.svg'
import iconCheck from '../../assets/figma/icon-check-white-bold.svg'
import iconChevronLeft from '../../assets/figma/icon-chevron-left-white.svg'
import iconChevronRight from '../../assets/figma/icon-chevron-right-white.svg'
import iconDownload from '../../assets/figma/icon-download-white.svg'
import iconFilm from '../../assets/figma/icon-film-white.svg'
import iconShare from '../../assets/figma/icon-share-white.svg'
import { Avatar } from '../../components/Avatar'
import { StatusBar } from '../../components/StatusBar'
import { PEOPLE } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { Toast } from '../../components/Toast'
import { PHOTO_DETAILS, VIEWER_PHOTOS } from './tripDetailData'
import { tripActions, useTripStore } from './tripStore'
import { useToast } from '../../hooks/useToast'
import './PhotoViewerPage.css'

export function PhotoViewerPage({ index }: { index: number }) {
  const navigate = useNavigate()
  const { reelPicks } = useTripStore()
  const [toast, showToast] = useToast()
  const touchX = useRef<number | null>(null)
  const total = VIEWER_PHOTOS.length
  const detail = PHOTO_DETAILS[index]
  const inReel = reelPicks.includes(index)
  const hasPrev = index > 0
  const hasNext = index < total - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 0) navigate(`trip/photos/view/${index - 1}`, { replace: true })
      if (e.key === 'ArrowRight' && index < total - 1) navigate(`trip/photos/view/${index + 1}`, { replace: true })
      if (e.key === 'Escape') navigate('trip/photos')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, total, navigate])

  // Replace, so Back leaves the viewer instead of stepping through every photo
  const go = (i: number) => navigate(`trip/photos/view/${i}`, { replace: true })

  return (
    <div className="viewer">
      <StatusBar />
      <div className="viewer__top-bar">
        <button type="button" className="viewer__icon-button" onClick={() => navigate('trip/photos')} aria-label="Back to photos">
          <img src={iconBack} alt="" width={20} height={20} />
        </button>
        <p className="viewer__counter" aria-live="polite">
          {index + 1} of {total}
        </p>
        <span className="viewer__spacer" />
      </div>

      <div
        className="viewer__stage"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (dx > 50 && hasPrev) go(index - 1)
          if (dx < -50 && hasNext) go(index + 1)
        }}
      >
        <img className="viewer__photo" src={VIEWER_PHOTOS[index]} alt={`Trip photo ${index + 1}: ${detail.caption}`} />
        <button
          type="button"
          className="viewer__nav viewer__nav--prev"
          onClick={() => go(index - 1)}
          disabled={!hasPrev}
          aria-label="Previous photo"
        >
          <img src={iconChevronLeft} alt="" width={22} height={22} />
        </button>
        <button
          type="button"
          className="viewer__nav viewer__nav--next"
          onClick={() => go(index + 1)}
          disabled={!hasNext}
          aria-label="Next photo"
        >
          <img src={iconChevronRight} alt="" width={22} height={22} />
        </button>
      </div>

      <div className="viewer__info">
        <div>
          <h1 className="viewer__caption">{detail.caption}</h1>
          <p className="viewer__time">{detail.time}</p>
        </div>
        <div className="viewer__faces">
          <p className="overline viewer__overline">In this photo</p>
          <ul className="viewer__tags no-scrollbar">
            {detail.people.map((id) => (
              <li key={id} className="viewer__tag">
                <Avatar person={id} size={24} />
                {PEOPLE[id].name}
              </li>
            ))}
          </ul>
        </div>
        <div className="viewer__actions">
          {/* TODO: native share sheet */}
          <button type="button" className="viewer__action" onClick={() => showToast('Share link copied')}>
            <img src={iconShare} alt="" width={20} height={20} />
            Share
          </button>
          {/* TODO: download the original from storage */}
          <button type="button" className="viewer__action" onClick={() => showToast('Saved to your phone')}>
            <img src={iconDownload} alt="" width={20} height={20} />
            Download
          </button>
          <button
            type="button"
            className={`viewer__action${inReel ? ' viewer__action--on' : ''}`}
            aria-pressed={inReel}
            onClick={() => {
              tripActions.toggleReelPick(index)
              showToast(inReel ? 'Removed from your next reel' : 'Added to your next reel')
            }}
          >
            <img src={inReel ? iconCheck : iconFilm} alt="" width={20} height={20} />
            {inReel ? 'In reel' : 'Add to reel'}
          </button>
        </div>
      </div>
      <span className="home-indicator home-indicator--light" aria-hidden="true" />
      <Toast message={toast} />
    </div>
  )
}
