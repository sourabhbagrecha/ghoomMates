import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from '../../hooks/navigation'
import type { VoiceCall as VoiceCallComponent, VoiceCallHandle } from './VoiceCall'
import { VoiceContext, type Notice } from './voiceContext'
import './VoiceProvider.css'

// The call (LiveKit, the mic and the overlay) is its own chunk: about a quarter of the app's JavaScript, which no screen
// needs to first paint. It loads once the browser is idle after start-up, or on the first open() if that comes sooner.
const loadCall = () => import('./VoiceCall')

/**
 * Hosts GhoomMate for the whole app. Render it inside the device frame (and inside NavigateContext) so the
 * overlay covers the screen and voice actions can navigate.
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const [Call, setCall] = useState<typeof VoiceCallComponent | null>(null)
  const call = useRef<VoiceCallHandle>(null)
  // An open() made before the call module arrived; VoiceCall takes it when it mounts
  const pending = useRef<{ prompt?: string } | null>(null)
  const loading = useRef(false)
  const takePending = useCallback(() => {
    const first = pending.current
    pending.current = null
    return first
  }, [])

  const notify = useCallback((next: Notice) => {
    window.clearTimeout(noticeTimer.current)
    setNotice(next)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000)
  }, [])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const load = useCallback(() => {
    if (loading.current) return
    loading.current = true
    loadCall().then(
      (module) => setCall(() => module.VoiceCall),
      () => {
        // Offline, most likely: let the next open() try again
        loading.current = false
        if (!pending.current) return
        pending.current = null
        notify({ message: 'Couldn’t reach GhoomMate. Check your connection and try again.' })
      },
    )
  }, [notify])

  const open = useCallback(
    (prompt?: string) => {
      if (call.current) return call.current.open(prompt)
      pending.current = { prompt }
      load()
    },
    [load],
  )

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 2000))
    idle(() => load())
  }, [load])

  const api = useMemo(() => ({ open, notify }), [open, notify])
  const action = notice?.action

  return (
    <VoiceContext.Provider value={api}>
      {children}
      <div className="voice-notice" role="status" aria-live="polite">
        {notice && (
          <div className="voice-notice__pill">
            <p className="voice-notice__message">{notice.message}</p>
            {action && (
              <button
                type="button"
                className="voice-notice__action"
                onClick={() => {
                  setNotice(null)
                  call.current?.minimize()
                  navigate(action.route)
                }}
              >
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
      {Call && <Call ref={call} takePending={takePending} />}
    </VoiceContext.Provider>
  )
}
