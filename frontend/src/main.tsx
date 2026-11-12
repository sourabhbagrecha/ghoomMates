import './services/legacyStorage'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Each deploy replaces the files in /assets, so a tab opened before it can't load the previous build's lazy chunks
// (voice, reel player, photo tools). Reload once to pick up the new build; not when offline, and at most once a minute.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'ghoommates:chunk-reload'
  try {
    if (!navigator.onLine || Date.now() - Number(sessionStorage.getItem(KEY)) < 60_000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
