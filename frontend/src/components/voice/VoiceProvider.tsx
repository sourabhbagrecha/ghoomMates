import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from '../../hooks/navigation'
import { VoiceContext } from './voiceContext'
import { VoiceOverlay } from './VoiceOverlay'
import './VoiceProvider.css'

type Notice = { message: string; action?: { label: string; route: string } }

/**
 * Hosts the GhoomMate voice overlay for the whole app. Render it inside the device frame
 * (and inside NavigateContext) so the overlay covers the screen and voice actions can navigate.
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  // Each open gets a new session id so the overlay remounts with fresh state and timers
  const [session, setSession] = useState<{ id: number; prompt?: string } | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)

  const open = useCallback((prompt?: string) => {
    if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement
    setSession((s) => ({ id: (s?.id ?? 0) + 1, prompt }))
  }, [])

  const close = useCallback(() => {
    setSession(null)
    const target = returnFocus.current
    returnFocus.current = null
    // The trigger may have unmounted if the action navigated away
    window.setTimeout(() => {
      if (target?.isConnected) target.focus()
    }, 0)
  }, [])

  const notify = useCallback((next: Notice) => {
    window.clearTimeout(noticeTimer.current)
    setNotice(next)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000)
  }, [])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const api = useMemo(() => ({ open }), [open])
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
                  navigate(action.route)
                }}
              >
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
      {session && (
        <VoiceOverlay key={session.id} prompt={session.prompt} onClose={close} onNotify={notify} />
      )}
    </VoiceContext.Provider>
  )
}
