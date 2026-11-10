/**
 * Calls `load` every `ms` while the tab is visible, and once more when a hidden tab comes back. A forgotten background
 * tab sends no requests, so it does not keep the Cloud Run instance (billed while up, for the voice worker) awake.
 * Returns a function that stops it.
 */
export function refreshWhileVisible(load: () => void, ms: number): () => void {
  const timer = window.setInterval(() => {
    if (!document.hidden) load()
  }, ms)
  const onVisibility = () => {
    if (!document.hidden) load()
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
