import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { RoomAudioRenderer, RoomContext } from '@livekit/components-react'
import { createLocalAudioTrack, ParticipantKind, Room, RoomEvent } from 'livekit-client'
import { activeTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { ApiRequestError } from '../../services/tripsService'
import { voiceApi } from '../../services/voiceService'
import { VoiceOverlay } from './VoiceOverlay'

export type VoiceErrorKind = 'disabled' | 'network' | 'napping' | 'dropped' | 'failed'
export type VoiceError = { kind: VoiceErrorKind; detail?: string }

export type VoiceConnection =
  | { status: 'idle' }
  /** Opened outside a trip: GhoomMate needs a trip to work on */
  | { status: 'no-trip' }
  /** Asking the backend for a session token; `slow` once it's been a while (the server's worker is still starting) */
  | { status: 'starting'; slow?: boolean }
  /** Joining the LiveKit room */
  | { status: 'connecting' }
  /** In the room; the agent may still be on its way */
  | { status: 'live' }
  | { status: 'error'; error: VoiceError }

export type VoicePrompt = { text: string; n: number }

type Session = { id: number; room: Room; tripId: string | null }

// The agent worker normally joins in 1–3s; past this it’s almost certainly not running
const AGENT_TIMEOUT_MS = 12_000
// Past this the session request is waiting on a cold server whose voice worker is still starting (up to ~25 s), so the
// overlay says so
const SLOW_START_MS = 3000

/** The open trip, but only while you’re inside it (#/trip/…); Home and planning screens have none */
const currentTripId = () => {
  const { tripId } = activeTrip.get()
  return tripId && /^#\/trip(\/|$)/.test(window.location.hash) ? tripId : null
}

function sessionError(err: unknown): VoiceError {
  if (err instanceof ApiRequestError) {
    if (err.code === 'VOICE_AGENT_WAKING') return { kind: 'napping', detail: err.code }
    if (err.status === 503 || err.code === 'VOICE_DISABLED') return { kind: 'disabled', detail: err.code }
    if (err.status === 0) return { kind: 'network' }
    return { kind: 'failed', detail: `${err.code}: ${err.message}` }
  }
  return { kind: 'failed', detail: err instanceof Error ? err.message : undefined }
}

const newRoom = () => new Room({ adaptiveStream: false, dynacast: false })

const hasAgent = (room: Room) => [...room.remoteParticipants.values()].some((p) => p.kind === ParticipantKind.AGENT)

/** What VoiceProvider calls on the loaded call: open GhoomMate (optionally asking `prompt`), or tuck it into the pill */
export type VoiceCallHandle = { open: (prompt?: string) => void; minimize: () => void }

type VoiceCallProps = {
  ref: Ref<VoiceCallHandle>
  /** Takes the open() that arrived while this module was still loading, if any */
  takePending: () => { prompt?: string } | null
}

/**
 * The GhoomMate call: the LiveKit room, the mic and the overlay. VoiceProvider loads this module (and LiveKit with it)
 * as its own chunk, so the app's first load doesn't carry it. The room lives here, not in the overlay, so the call
 * survives a `navigate` from the agent.
 */
export function VoiceCall({ ref, takePending }: VoiceCallProps) {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [conn, setConn] = useState<VoiceConnection>({ status: 'idle' })
  const [micBlocked, setMicBlocked] = useState(false)
  const [prompt, setPrompt] = useState<VoicePrompt | null>(null)
  // Tucked into a pill at the top while you look at a screen; the call keeps going
  const [minimized, setMinimized] = useState(false)
  const sessionRef = useRef<Session | null>(null)
  const nextId = useRef(0)
  const returnFocus = useRef<HTMLElement | null>(null)

  const open = useCallback((text?: string) => {
    if (text) setPrompt((p) => ({ text, n: (p?.n ?? 0) + 1 }))
    setMinimized(false)
    // Already open (e.g. a voice button behind the sheet, or the octopus while minimised): pass the prompt along
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
    setMinimized(false)
    setConn({ status: 'idle' })
    setPrompt(null)
    const target = returnFocus.current
    returnFocus.current = null
    // The trigger may have unmounted if the action navigated away
    window.setTimeout(() => {
      if (target?.isConnected) target.focus()
    }, 0)
  }, [])

  const minimize = useCallback(() => setMinimized(true), [])
  const expand = useCallback(() => setMinimized(false), [])

  useImperativeHandle(ref, () => ({ open, minimize }), [open, minimize])

  // The tap that loaded this module
  useEffect(() => {
    const first = takePending()
    if (first) open(first.prompt)
  }, [open, takePending])

  // Session → room → mic. Each attempt gets a fresh Room (LiveKit’s hooks tear down their stream
  // handlers on disconnect); closing or retrying disconnects the old one.
  useEffect(() => {
    if (!session?.tripId) return
    const { room, tripId } = session
    let cancelled = false
    // Open the mic while the token and connection are set up, rather than after (it can take a moment)
    const mic = createLocalAudioTrack().catch(() => null)
    const dropMic = () => void mic.then((track) => track?.stop())
    // The session request stays open for the whole call (see voiceApi.startSession); this ends it
    const hold = new AbortController()
    void (async () => {
      setConn({ status: 'starting' })
      const slow = window.setTimeout(() => {
        if (!cancelled) setConn((c) => (c.status === 'starting' ? { status: 'starting', slow: true } : c))
      }, SLOW_START_MS)
      let token
      try {
        const held = await voiceApi.startSession(tripId, hold.signal)
        token = held.session
        // The server let go mid-call: the agent stops getting CPU, so the call is over
        void held.released.then(() => {
          if (!cancelled) setConn((c) => (c.status === 'error' ? c : { status: 'error', error: { kind: 'dropped' } }))
        })
      } catch (err) {
        dropMic()
        if (!cancelled) setConn({ status: 'error', error: sessionError(err) })
        return
      } finally {
        window.clearTimeout(slow)
      }
      if (cancelled) return dropMic()
      setConn({ status: 'connecting' })
      try {
        await room.connect(token.serverUrl, token.participantToken)
      } catch (err) {
        dropMic()
        if (!cancelled) setConn({ status: 'error', error: { kind: 'network', detail: err instanceof Error ? err.message : undefined } })
        return
      }
      if (cancelled) {
        dropMic()
        void room.disconnect()
        return
      }
      setConn({ status: 'live' })
      // We’re past the tap that opened the sheet, so the browser may still block playback; the overlay offers a button
      room.startAudio().catch(() => {})
      const track = await mic
      if (cancelled) return track?.stop()
      try {
        // Denied or no mic: typing still works
        if (!track) throw new Error('No microphone')
        await room.localParticipant.publishTrack(track)
      } catch {
        track?.stop()
        if (!cancelled) setMicBlocked(true)
      }
    })()
    return () => {
      cancelled = true
      hold.abort()
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

  if (!session) return null
  return (
    <RoomContext.Provider value={session.room}>
      <RoomAudioRenderer />
      <VoiceOverlay
        key={session.id}
        conn={conn}
        micBlocked={micBlocked}
        prompt={prompt}
        minimized={minimized}
        onMinimize={minimize}
        onExpand={expand}
        onClose={close}
        onRetry={retry}
        onRetryMic={retryMic}
        onOpenTrips={openTrips}
      />
    </RoomContext.Provider>
  )
}
