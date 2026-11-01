import { OnboardingLayout } from '../../components/OnboardingLayout'
import { useNavigate } from '../../hooks/navigation'
import { EXPERIENCE_PHOTOS } from '../Explore/experiencePhotos'
import './PhotoCreditsPage.css'

/** Where this screen was opened from (Explore, Plan, Settings), so Back returns there */
function backTo() {
  const from = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('from')
  return from && /^[\w-]+(\/[\w-]+)*$/.test(from) ? from : 'profile/settings'
}

// The same photo can sit in two galleries; it is credited once
const PHOTOS = [...new Map(Object.values(EXPERIENCE_PHOTOS).flat().map((photo) => [photo.source, photo])).values()].sort(
  (a, b) => a.credit.localeCompare(b.credit) || a.alt.localeCompare(b.alt),
)

/** Every Wikimedia Commons photo the app shows, with its author and licence (also in frontend/PHOTO_CREDITS.md) */
export function PhotoCreditsPage() {
  const navigate = useNavigate()
  return (
    <OnboardingLayout
      eyebrow="Profile · About"
      title="Photo credits"
      subtitle="Places and experiences are shown with photos from Wikimedia Commons."
      onBack={() => navigate(backTo())}
      bodyClassName="credits__body"
    >
      <p className="credits__intro">
        Every photo is CC0, public domain, CC BY or CC BY-SA, and stays with its author. Tap one to see it on Commons.
        Makers, hosts and the people in the squad photos are sample or AI-generated and not real individuals.
      </p>
      <ul className="credits__list">
        {PHOTOS.map((photo) => (
          <li key={photo.source} className="list-card credits__row">
            <a className="credits__link" href={photo.source} target="_blank" rel="noreferrer">
              <span className="credits__alt">{photo.alt}</span>
              <span className="credits__meta">
                {photo.credit} · {photo.license}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </OnboardingLayout>
  )
}
