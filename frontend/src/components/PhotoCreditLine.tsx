import { useNavigate } from '../hooks/navigation'
import './PhotoCreditLine.css'

/** One quiet line under a screen that shows Wikimedia Commons photos: where they come from, and where the credits are */
export function PhotoCreditLine({ from }: { from: string }) {
  const navigate = useNavigate()
  return (
    <p className="photo-credit">
      Photos from Wikimedia Commons, credited to their authors.{' '}
      <button type="button" className="text-link photo-credit__link" onClick={() => navigate(`profile/credits?from=${from}`)}>
        See credits
      </button>
    </p>
  )
}
