import './Toast.css'

/** Ink pill under the status bar. Always rendered so screen readers hear each new message. */
export function Toast({ message }: { message: string | null }) {
  return (
    <div className="trip-toast" role="status" aria-live="polite">
      {message && <p className="trip-toast__message">{message}</p>}
    </div>
  )
}
