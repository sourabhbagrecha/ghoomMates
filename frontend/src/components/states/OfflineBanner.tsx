import { useEffect, useState } from 'react'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconWifiOff from '../../assets/figma/icon-wifi-off-white.svg'
import './OfflineBanner.css'

type Connection = 'online' | 'offline' | 'back'

const BACK_ONLINE_MS = 2500

type OfflineBannerProps = {
  /** Renders a static banner in the flow instead of following the connection (states gallery) */
  preview?: 'offline' | 'back'
}

/**
 * Ink pill under the status bar while the device is offline, then a short “Back online”.
 * Render once inside the device frame.
 */
export function OfflineBanner({ preview }: OfflineBannerProps) {
  const [live, setLive] = useState<Connection>(() => (navigator.onLine ? 'online' : 'offline'))
  const connection = preview ?? live

  useEffect(() => {
    if (preview) return
    let timer: number | undefined
    const goOffline = () => {
      window.clearTimeout(timer)
      setLive('offline')
    }
    const goOnline = () => {
      window.clearTimeout(timer)
      // Only celebrate if we were actually offline
      setLive((current) => (current === 'offline' ? 'back' : current))
      timer = window.setTimeout(() => setLive('online'), BACK_ONLINE_MS)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      window.clearTimeout(timer)
    }
  }, [preview])

  return (
    <div className={`offline-banner${preview ? ' offline-banner--inline' : ''}`} role="status" aria-live="polite">
      {connection === 'offline' && (
        <p className="offline-banner__pill">
          <img src={iconWifiOff} alt="" width={16} height={16} />
          You’re offline. Changes will sync when you’re back.
        </p>
      )}
      {connection === 'back' && (
        <p className="offline-banner__pill">
          <img src={iconCheck} alt="" width={14} height={14} />
          Back online
        </p>
      )}
    </div>
  )
}
