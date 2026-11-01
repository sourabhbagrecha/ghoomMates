import { useEffect, useRef } from 'react'
import iconBack from '../../assets/figma/icon-back-white.svg'
import iconCheck from '../../assets/figma/icon-check-white-bold.svg'
import iconChevronLeft from '../../assets/figma/icon-chevron-left-white.svg'
import iconChevronRight from '../../assets/figma/icon-chevron-right-white.svg'
import iconDownload from '../../assets/figma/icon-download-white.svg'
import iconFilm from '../../assets/figma/icon-film-white.svg'
import iconShare from '../../assets/figma/icon-share-white.svg'
import { Avatar } from '../../components/Avatar'
import { TopSafeArea } from '../../components/TopSafeArea'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { Toast } from '../../components/Toast'
import { tripActions, useTripStore } from './tripStore'
import { useToast } from '../../hooks/useToast'
import './PhotoViewerPage.css'

export function PhotoViewerPage({ index }: { index: number }) {
  const navigate = useNavigate()
  const { reelPicks } = useTripStore()
  const { trip, photos } = useActiveTrip()
  const [toast, showToast] = useToast()
  const touchX = useRef<number | null>(null)
  const total = photos?.items.length ?? 0
  const photo = photos?.items[index]
  const uploader = trip?.members.find((m) => m.userId === photo?.uploadedBy.userId)
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

  const share = async () => {
    if (!photo) return
    try {
      // Share the image itself where the browser can (phones), so it doesn't depend on an expiring link
      const blob = await fetch(photo.url).then((r) => r.blob())
      const file = new File([blob], `ghoommates-${photo.id}.jpg`, { type: blob.type || 'image/jpeg' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: trip?.name })
        return
      }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
    }
    await navigator.clipboard?.writeText(photo.url).catch(() => {})
    showToast('Link copied · works for 12 hours')
  }

  const download = async () => {
    if (!photo) return
    try {
      const blob = await fetch(photo.url).then((r) => r.blob())
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: `ghoommates-${photo.id}.${blob.type.split('/')[1] || 'jpg'}` })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      showToast('Downloaded')
    } catch {
      showToast('Download failed. Try again.')
    }
  }

  const when = photo
    ? new Date(photo.createdAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="viewer">
      <TopSafeArea />
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
        {photo && <img className="viewer__photo" src={photo.url} alt={`Trip photo ${index + 1}${photo.caption ? `: ${photo.caption}` : ''}`} />}
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
          <h1 className="viewer__caption">{photo?.caption || trip?.name || 'Trip photo'}</h1>
          <p className="viewer__time">{when}</p>
        </div>
        {photo && (
          <div className="viewer__faces">
            <p className="overline viewer__overline">Uploaded by</p>
            <ul className="viewer__tags no-scrollbar">
              <li className="viewer__tag">
                {uploader && <Avatar person={uploader.memberId} size={24} />}
                {uploader?.memberId === trip?.memberId ? 'You' : photo.uploadedBy.name.split(' ')[0]}
              </li>
            </ul>
          </div>
        )}
        <div className="viewer__actions">
          <button type="button" className="viewer__action" disabled={!photo} onClick={() => void share()}>
            <img src={iconShare} alt="" width={20} height={20} />
            Share
          </button>
          <button type="button" className="viewer__action" disabled={!photo} onClick={() => void download()}>
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
