import './TopSafeArea.css'

/**
 * Top margin of every screen: 24px, or the height of the phone's own status bar
 * when the app runs full-screen on a notched phone (`--top-inset`).
 */
export function TopSafeArea() {
  return <div className="top-safe-area" aria-hidden="true" />
}
