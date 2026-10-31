import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { RoomAudioRenderer, RoomContext } from '@livekit/components-react'
import { ParticipantKind, Room, RoomEvent } from 'livekit-client'
import { activeTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { ApiRequestError } from '../../services/tripsService'
import { voiceApi } from '../../services/voiceService'
import { VoiceContext, type Notice } from './voiceContext'
import { VoiceOverlay } from './VoiceOverlay'
import './VoiceProvider.css'

export type VoiceErrorKind = 'disabled' | 'network' | 'napping' | 'dropped' | 'failed'
export type VoiceError = { kind: VoiceErrorKind; detail?: string }

export type VoiceConnection =
  | { status: 'idle' }
  /** Opened outside a trip: GhoomMate needs a trip to work on */
  | { status: 'no-trip' }
  /** Asking the backend for a session token */
  | { status: 'starting' }
  /** Joining the LiveKit room */
  | { status: 'connecting' }
  /** In the room; the agent may still be on its way */
  | { status: 'live' }
  | { status: 'error'; error: VoiceError }

export type VoicePrompt = { text: string; n: number }

type Session = { id: number; room: Room; tripId: string | null }

// The agent worker normally joins in 1–3s; past this it’s almost certainly not running
const AGENT_TIMEOUT_MS = 12_000

/** The open trip, but only while you’re inside it (#/trip/…); Home and planning screens have none */
const currentTripId = () => {
  const { tripId } = activeTrip.get()
  return tripId && /^#\/trip(\/|$)/.test(window.location.hash) ? tripId : null
}

function sessionError(err: unknown): VoiceError {
  if (err instanceof ApiRequestError) {
    if (err.status === 503 || err.code === 'VOICE_DISABLED') return { kind: 'disabled', detail: err.code }
    if (err.status === 0) return { kind: 'network' }
    return { kind: 'failed', detail: `${err.code}: ${err.message}` }
  }
  return { kind: 'failed', detail: err instanceof Error ? err.message : undefined }
}

const newRoom = () => new Room({ adaptiveStream: false, dynacast: false })

const hasAgent = (room: Room) => [...room.remoteParticipants.values()].some((p) => p.kind === ParticipantKind.AGENT)

/**
 * Hosts GhoomMate for the whole app. Render it inside the device frame (and inside NavigateContext) so the
 * overlay covers the screen and voice actions can navigate. The LiveKit room lives here, not in the overlay,
 * so the call survives a `navigate` from the agent.
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [conn, setConn] = useState<VoiceConnection>({ status: 'idle' })
  const [micBlocked, setMicBlocked] = useState(false)
  const [prompt, setPrompt] = useState<VoicePrompt | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const nextId = useRef(0)
  const returnFocus = useRef<HTMLElement | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)

  const open = useCallback((text?: string) => {
    if (text) setPrompt((p) => ({ text, n: (p?.n ?? 0) + 1 }))
    // Already open (e.g. a voice button behind the sheet): just pass the new prompt along
    if (sessionRef.current) return
    if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement
    nextId.current += 1
    const tripId = currentTripId()
    const next: Session = { id: nextId.current, room: newRoom(), tripId }
    sessionRef.current = next
    setSession(next)
    setMicBlocked(false)
    setConn(tripId ? { status: 'starting' } : { status: 'no-trip' })
  }, [])

  const close = useCallback(() => {
    sessionRef.current = null
    setSession(null)
    setConn({ status: 'idle' })
    setPrompt(null)
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

  // Session → room → mic. Each attempt gets a fresh Room (LiveKit’s hooks tear down their stream
  // handlers on disconnect); closing or retrying disconnects the old one.
  useEffect(() => {
    if (!session?.tripId) return
    const { room, tripId } = session
    let cancelled = false
    void (async () => {
      setConn({ status: 'starting' })
      let token
      try {
        token = await voiceApi.createSession(tripId)
      } catch (err) {
        if (!cancelled) setConn({ status: 'error', error: sessionError(err) })
        return
      }
      if (cancelled) return
      setConn({ status: 'connecting' })
      try {
        await room.connect(token.serverUrl, token.participantToken)
      } catch (err) {
        if (!cancelled) setConn({ status: 'error', error: { kind: 'network', detail: err instanceof Error ? err.message : undefined } })
        return
      }
      if (cancelled) {
        void room.disconnect()
        return
      }
      setConn({ status: 'live' })
      // We’re past the tap that opened the sheet, so the browser may still block playback; the overlay offers a button
      room.startAudio().catch(() => {})
      try {
        await room.localParticipant.setMicrophoneEnabled(true)
      } catch {
        // Denied or no mic: typing still works
        if (!cancelled) setMicBlocked(true)
      }
    })()
    return () => {
      cancelled = true
      void room.disconnect()
    }
  }, [session])

  // In the room but no agent joined: the worker isn’t running (or LiveKit can’t dispatch it)
  useEffect(() => {
    if (conn.status !== 'live' || !session) return
    const { room } = session
    if (hasAgent(room)) return
    const timer = window.setTimeout(() => {
      if (!hasAgent(room)) setConn({ status: 'error', error: { kind: 'napping' } })
    }, AGENT_TIMEOUT_MS)
    const onJoined = () => {
      if (hasAgent(room)) window.clearTimeout(timer)
    }
    room.on(RoomEvent.ParticipantConnected, onJoined)
    return () => {
      window.clearTimeout(timer)
      room.off(RoomEvent.ParticipantConnected, onJoined)
    }
  }, [conn.status, session])

  // The call dropped by itself (network, token expiry, server ended the room)
  useEffect(() => {
    if (!session) return
    const { room } = session
    const onDisconnected = () =>
      setConn((c) => (c.status === 'live' ? { status: 'error', error: { kind: 'dropped' } } : c))
    room.on(RoomEvent.Disconnected, onDisconnected)
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected)
    }
  }, [session])

  const retry = useCallback(() => {
    const current = sessionRef.current
    if (!current) return
    const next = { ...current, room: newRoom() }
    sessionRef.current = next
    setMicBlocked(false)
    setSession(next)
  }, [])

  const retryMic = useCallback(() => {
    const room = sessionRef.current?.room
    if (!room) return
    room.localParticipant
      .setMicrophoneEnabled(true)
      .then(() => setMicBlocked(false))
      .catch(() => setMicBlocked(true))
  }, [])

  const openTrips = useCallback(() => {
    close()
    navigate('')
  }, [close, navigate])

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
        <RoomContext.Provider value={session.room}>
          <RoomAudioRenderer />
          <VoiceOverlay
            key={session.id}
            conn={conn}
            micBlocked={micBlocked}
            prompt={prompt}
            onClose={close}
            onRetry={retry}
            onRetryMic={retryMic}
            onOpenTrips={openTrips}
          />
        </RoomContext.Provider>
      )}
    </VoiceContext.Provider>
  )
}
