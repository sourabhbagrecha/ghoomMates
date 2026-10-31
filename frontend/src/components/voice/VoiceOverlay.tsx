import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import {
  useAudioPlayback,
  useLocalParticipant,
  useMultibandTrackVolume,
  useRoomContext,
  useTranscriptions,
  useVoiceAssistant,
} from '@livekit/components-react'
import { LocalAudioTrack } from 'livekit-client'
import iconSend from '../../assets/figma/icon-arrow-white.svg'
import iconBrain from '../../assets/figma/icon-brain-ink.svg'
import iconBrainPrimary from '../../assets/figma/icon-brain-primary.svg'
import iconHistory from '../../assets/figma/icon-history-ink.svg'
import iconHistoryWhite from '../../assets/figma/icon-history-white.svg'
import iconClose from '../../assets/figma/icon-x-ink.svg'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { Button, LinkButton } from '../Button'
import { GhoomMateAvatar } from '../GhoomMate'
import { ErrorState } from '../states/ErrorState'
import { TextField } from '../TextField'
import { ErrorBoundary } from '../states/ErrorBoundary'
import { ChatHistory } from './ChatHistory'
import { GhoomMateCard } from './GhoomMateCard'
import { useGhoomMateUi } from './useGhoomMateUi'
import type { VoiceConnection, VoiceErrorKind, VoicePrompt } from './VoiceProvider'
import '../Chip.css'
import './VoiceOverlay.css'

type Phase = 'no-trip' | 'waking' | 'listening' | 'thinking' | 'speaking' | 'error'

const STATUS: Record<Phase, string> = {
  'no-trip': 'Open a trip first',
  waking: 'Waking GhoomMate…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'GhoomMate’s talking…',
  error: 'Uh-oh',
}

const ERRORS: Record<VoiceErrorKind, { title: string; text: string }> = {
  disabled: {
    title: 'Voice isn’t set up on the server',
    text: 'GhoomMate needs the LiveKit keys on the backend. Everything else still works, mate.',
  },
  network: { title: 'Can’t reach GhoomMate', text: 'Check your connection and give it another go.' },
  napping: { title: 'GhoomMate is napping', text: 'Is the agent worker running? Give it a nudge, then try again.' },
  dropped: { title: 'Lost GhoomMate', text: 'The call dropped. Want to reconnect?' },
  failed: { title: 'GhoomMate tripped up', text: 'Something went wrong starting the chat. Give it another go?' },
}

const SUGGESTIONS = ['What should I do here?', 'Plan my day tomorrow', 'Add ₹250 lunch, split with everyone', 'Who owes what?', 'Make a reel']

/** How long a "Memory updated" chip stays up */
const MEMORY_CHIP_MS = 8000
const WAVE_BARS = 9
const DOCK_BARS = 5
/** Bottom bars the minimised pill sits above: the tab bar and the screens' pinned action footers */
const BOTTOM_BARS = '.tab-bar, .cover-layout__actions, .onboarding__actions, .home__actions'
const DOCK_GAP = 12
/** With no bottom bar, clear of the home indicator */
const DOCK_BOTTOM_PLAIN = 30
const QUIET = 0.18
const CHAT_TOPIC = 'lk.chat'

type VoiceOverlayProps = {
  conn: VoiceConnection
  micBlocked: boolean
  /** Asked through `useVoice().open(prompt)`; sent once GhoomMate is listening */
  prompt: VoicePrompt | null
  /** Tucked into a pill at the top so the screen behind is usable; the call keeps going */
  minimized: boolean
  onMinimize: () => void
  onExpand: () => void
  onClose: () => void
  onRetry: () => void
  onRetryMic: () => void
  onOpenTrips: () => void
}

/**
 * GhoomMate’s voice sheet: live agent state, transcript, and whatever card the agent puts on screen. Going to a
 * screen (a card tap, or the agent opening one) minimises it to a pill so you can look around mid-conversation;
 * a new card, an error or a tap on the pill brings it back.
 */
export function VoiceOverlay({
  conn,
  micBlocked,
  prompt,
  minimized,
  onMinimize,
  onExpand,
  onClose,
  onRetry,
  onRetryMic,
  onOpenTrips,
}: VoiceOverlayProps) {
  const room = useRoomContext()
  const navigate = useNavigate()
  const { trip } = useActiveTrip()
  const { state: agentState, audioTrack, agent } = useVoiceAssistant()
  const { microphoneTrack, localParticipant } = useLocalParticipant()
  const transcriptions = useTranscriptions()
  const { canPlayAudio, startAudio } = useAudioPlayback(room)
  const ui = useGhoomMateUi(room, agent?.identity, { minimize: onMinimize, expand: onExpand })

  const micTrack = microphoneTrack?.track instanceof LocalAudioTrack ? microphoneTrack.track : undefined
  const agentLevels = useMultibandTrackVolume(audioTrack, { bands: WAVE_BARS, updateInterval: 60 })
  const micLevels = useMultibandTrackVolume(micTrack, { bands: WAVE_BARS, updateInterval: 60 })

  const [typingChosen, setTyping] = useState(false)
  // The sheet shows this trip's earlier chats instead of the live one
  const [showHistory, setShowHistory] = useState(false)
  // The memory update whose chip has timed out; a newer one shows again
  const [memorySeenAt, setMemorySeenAt] = useState(0)
  const [draft, setDraft] = useState('')
  const [typed, setTyped] = useState<{ text: string; at: number } | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const sentPrompt = useRef(0)
  // Typed (or a tapped suggestion) before GhoomMate was up; sent as soon as it's listening, like `prompt`
  const [queued, setQueued] = useState<VoicePrompt | null>(null)
  const sentQueued = useRef(0)

  const live = conn.status === 'live' && !!agent
  const phase: Phase =
    conn.status === 'no-trip'
      ? 'no-trip'
      : conn.status === 'error'
        ? 'error'
        : !live
          ? 'waking'
          : agentState === 'speaking'
            ? 'speaking'
            : agentState === 'thinking'
              ? 'thinking'
              : agentState === 'listening' || agentState === 'idle'
                ? 'listening'
                : 'waking'
  const typing = typingChosen || micBlocked
  const error = conn.status === 'error' ? conn.error : null

  // Focus the sheet whenever it comes up (on open, and when expanding from the pill)
  useEffect(() => {
    if (!minimized) closeRef.current?.focus()
  }, [minimized])


  // The pill floats in the octopus button's corner, just above whatever bar is pinned to the bottom of this screen
  const dockRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const dock = dockRef.current
    const device = dock?.parentElement
    if (!dock || !device) return
    const bottom = device.getBoundingClientRect().bottom
    const tops = [...device.querySelectorAll<HTMLElement>(BOTTOM_BARS)]
      .map((bar) => bar.getBoundingClientRect())
      .filter((rect) => rect.height > 0 && Math.abs(rect.bottom - bottom) < 4)
      .map((rect) => rect.top)
    dock.style.setProperty('--dock-bottom', `${tops.length ? bottom - Math.min(...tops) + DOCK_GAP : DOCK_BOTTOM_PLAIN}px`)
  })

  // "Memory updated" shows for a few seconds after GhoomMate saves or drops a memory
  const memory = ui.memoryUpdate && ui.memoryUpdate.at > memorySeenAt ? ui.memoryUpdate : null
  useEffect(() => {
    if (!memory) return
    const timer = window.setTimeout(() => setMemorySeenAt(memory.at), MEMORY_CHIP_MS)
    return () => window.clearTimeout(timer)
  }, [memory])
  const memoryText = memory ? `${memory.change === 'added' ? 'Remembered' : 'Forgot'}: ${memory.note}` : null

  /** Open a screen from the sheet and step aside so it's visible */
  const go = useCallback(
    (route: string) => {
      navigate(route)
      onMinimize()
    },
    [navigate, onMinimize],
  )

  useEffect(() => {
    if (typingChosen) sheetRef.current?.querySelector<HTMLInputElement>('.voice-type input')?.focus()
  }, [typingChosen])

  const send = useCallback(
    async (text: string) => {
      setSendError(null)
      setTyped({ text, at: Date.now() })
      try {
        await room.localParticipant.sendText(text, { topic: CHAT_TOPIC })
      } catch {
        setSendError('Couldn’t send that. Try again?')
      }
    },
    [room],
  )

  // A prompt from a screen’s voice button goes out once GhoomMate is ready to hear it
  useEffect(() => {
    if (!prompt || prompt.n <= sentPrompt.current || phase !== 'listening') return
    sentPrompt.current = prompt.n
    void send(prompt.text)
  }, [prompt, phase, send])

  useEffect(() => {
    if (!queued || queued.n <= sentQueued.current || phase !== 'listening') return
    sentQueued.current = queued.n
    void send(queued.text)
  }, [queued, phase, send])

  /** Send now if GhoomMate is listening; while it's still waking, hold the message and show it as said */
  const say = useCallback(
    (text: string) => {
      if (live) {
        void send(text)
        return
      }
      setTyped({ text, at: Date.now() })
      setQueued((q) => ({ text, n: (q?.n ?? 0) + 1 }))
    },
    [live, send],
  )
  const canSay = phase !== 'error' && phase !== 'no-trip'

  const submitTyped = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !canSay) return
    setDraft('')
    say(text)
  }

  // Esc closes; Tab stays inside the sheet
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !sheetRef.current) return
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Latest line each side said. Typed messages don’t come back as transcriptions, so they count too.
  const me = localParticipant.identity
  const heard = transcriptions.findLast((t) => t.participantInfo.identity === me)
  const said = transcriptions.findLast((t) => t.participantInfo.identity !== me)
  const userLine = typed && typed.at >= (heard?.streamInfo.timestamp ?? 0) ? typed.text : heard?.text.trim()
  const mateLine = said?.text.trim()

  // Bars follow GhoomMate’s voice while it talks and yours while it listens
  const levels = phase === 'speaking' ? agentLevels : phase === 'listening' && !micBlocked ? micLevels : null
  const bar = (i: number) =>
    levels ? ({ '--level': Math.max(QUIET, Math.min(1, levels[i] ?? 0)) } as CSSProperties) : undefined

  const groupName = trip?.groupName || trip?.name
  const statusText =
    ui.working && (phase === 'thinking' || phase === 'listening')
      ? ui.working
      : phase === 'listening' && micBlocked
        ? 'Type it to me'
        : phase === 'waking' && queued
          ? 'Waking up… I’ll answer in a sec'
          : STATUS[phase]

  if (minimized) {
    return (
      <div ref={dockRef} className={`voice-dock voice-overlay--${phase}`} role="region" aria-label="GhoomMate, minimised">
        <button type="button" className="voice-dock__main" onClick={onExpand} aria-label={`Open GhoomMate: ${statusText}`}>
          <GhoomMateAvatar size={34} ring={2} />
          <span className="voice-dock__text">
            <strong>{memory ? 'Memory updated' : statusText}</strong>
            <span>{memoryText ?? (error ? `${ERRORS[error.kind].title}. Tap to fix` : mateLine || 'Tap to see the chat')}</span>
          </span>
          <span className="voice-wave voice-dock__wave" aria-hidden="true">
            {Array.from({ length: DOCK_BARS }, (_, i) => (
              <span key={i} style={bar(i)} />
            ))}
          </span>
        </button>
        <button type="button" className="voice-dock__end" aria-label="End GhoomMate" onClick={onClose}>
          <img src={iconClose} alt="" width={16} height={16} />
        </button>
      </div>
    )
  }

  return (
    <div className={`voice-overlay voice-overlay--${phase}`} onKeyDown={onKeyDown}>
      {/* Tapping outside tucks GhoomMate away (still listening); the X ends the chat */}
      <button type="button" className="voice-overlay__scrim" tabIndex={-1} aria-hidden="true" onClick={onMinimize} />
      <section ref={sheetRef} className="voice-sheet" role="dialog" aria-modal="true" aria-labelledby="voice-sheet-title">
        <span className="voice-sheet__grabber" aria-hidden="true" />
        <header className="voice-sheet__top">
          <div>
            <h2 id="voice-sheet-title" className="voice-sheet__title">
              GhoomMate
            </h2>
            <p className="voice-sheet__meta">{groupName && phase !== 'no-trip' ? `Your ${groupName} buddy` : 'Your travel buddy'}</p>
          </div>
          <div className="voice-sheet__tools">
            {trip && (
              <>
                <button
                  type="button"
                  className={`voice-sheet__close${showHistory ? ' voice-sheet__close--on' : ''}`}
                  aria-label={showHistory ? 'Back to the chat' : 'Chat history'}
                  aria-pressed={showHistory}
                  title="Chat history"
                  onClick={() => setShowHistory((on) => !on)}
                >
                  <img src={showHistory ? iconHistoryWhite : iconHistory} alt="" width={20} height={20} />
                </button>
                <button
                  type="button"
                  className="voice-sheet__close"
                  aria-label="What GhoomMate remembers"
                  title="What GhoomMate remembers"
                  onClick={() => go('profile/ghoomate')}
                >
                  <img src={iconBrain} alt="" width={20} height={20} />
                </button>
              </>
            )}
            <button ref={closeRef} type="button" className="voice-sheet__close" aria-label="Close GhoomMate" onClick={onClose}>
              <img src={iconClose} alt="" width={20} height={20} />
            </button>
          </div>
        </header>

        {memory && (
          <div className="voice-memory" role="status">
            <img src={iconBrainPrimary} alt="" width={18} height={18} />
            <span className="voice-memory__text">
              <strong>Memory updated</strong>
              <span>{memoryText}</span>
            </span>
            <button type="button" className="voice-memory__view" onClick={() => go('profile/ghoomate')}>
              View
            </button>
          </div>
        )}

        {showHistory && trip ? (
          <ChatHistory tripId={trip.id} />
        ) : (
          <>
          <div className="voice-sheet__hero" aria-hidden="true">
            <span className="voice-sheet__ring" />
            <span className="voice-sheet__ring voice-sheet__ring--late" />
            <GhoomMateAvatar size={96} ring={4} />
          </div>

          <p className="voice-sheet__status" role="status">
            {statusText}
          </p>

          {phase === 'no-trip' && (
            <div className="voice-card voice-card--center">
              <p className="voice-card__text">
                Open a trip first and I’ll help out: split a bill, check who owes what, or plan your day.
              </p>
              <Button variant="primary" onClick={onOpenTrips}>
                See my trips
              </Button>
            </div>
          )}

          {error && (
            <ErrorState
              headingLevel={3}
              className="voice-sheet__error"
              title={ERRORS[error.kind].title}
              text={ERRORS[error.kind].text}
              detail={error.detail}
              onRetry={onRetry}
            />
          )}

          {phase !== 'no-trip' && !error && (
            <>
              <div className="voice-wave" aria-hidden="true">
                {Array.from({ length: WAVE_BARS }, (_, i) => (
                  <span key={i} style={bar(i)} />
                ))}
              </div>

              {conn.status === 'live' && !canPlayAudio && (
                <button type="button" className="pill-button voice-sheet__audio" onClick={() => void startAudio()}>
                  Tap to hear GhoomMate
                </button>
              )}

              <div className="voice-transcript" aria-live="polite">
                {userLine || mateLine ? (
                  <>
                    {userLine && (
                      <p className="voice-transcript__line voice-transcript__line--you">
                        <span className="voice-transcript__who">You</span>“{userLine}”
                      </p>
                    )}
                    {mateLine && (
                      <p className="voice-transcript__line voice-transcript__line--mate">
                        <span className="voice-transcript__who">GhoomMate</span>
                        {mateLine}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="voice-transcript--empty">
                    {live ? 'Tap a phrase below, or just say it' : 'Hang on, GhoomMate’s on the way…'}
                  </p>
                )}
              </div>

              {micBlocked && (
                <ErrorState
                  headingLevel={3}
                  className="voice-sheet__error"
                  title="I can’t hear you"
                  text="Allow the mic for this site, or type to me below. That works too!"
                  retryLabel="Try the mic again"
                  onRetry={onRetryMic}
                />
              )}

              {ui.card && (
                <ErrorBoundary
                  resetKey={ui.card}
                  headingLevel={3}
                  title="Couldn’t show that card"
                  text="GhoomMate sent something this screen can’t show. Keep talking, it still hears you."
                >
                  <GhoomMateCard
                    card={ui.card}
                    pending={ui.pending}
                    error={ui.actionError}
                    onAction={(action) => void ui.act(action)}
                    onNavigate={go}
                  />
                </ErrorBoundary>
              )}

              <div className="voice-suggestions">
                <p className="overline">Try saying</p>
                <div className="voice-suggestions__row no-scrollbar">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="chip" disabled={!canSay} onClick={() => say(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {sendError && (
                <p className="voice-card__error" role="alert">
                  {sendError}
                </p>
              )}

              {typing ? (
                <form className="voice-type" onSubmit={submitTyped}>
                  <div className="voice-type__row">
                    <div className="voice-type__field">
                      <TextField
                        label="Type to GhoomMate"
                        placeholder="e.g. I paid 800 for the cab"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        enterKeyHint="send"
                        autoComplete="off"
                      />
                    </div>
                    <button type="submit" className="voice-type__send" aria-label="Send" disabled={!draft.trim() || !canSay}>
                      <img src={iconSend} alt="" width={18} height={18} />
                    </button>
                  </div>
                  {!micBlocked && <LinkButton onClick={() => setTyping(false)}>Speak instead</LinkButton>}
                </form>
              ) : (
                <LinkButton className="voice-sheet__type" onClick={() => setTyping(true)}>
                  Type instead
                </LinkButton>
              )}
            </>
          )}

          </>
        )}

        <span className="home-indicator" aria-hidden="true" />
      </section>
    </div>
  )
}
