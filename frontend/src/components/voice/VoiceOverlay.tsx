import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
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
import iconClose from '../../assets/figma/icon-x-ink.svg'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { Button, LinkButton } from '../Button'
import { GhoomMateAvatar } from '../GhoomMate'
import { ErrorState } from '../states/ErrorState'
import { TextField } from '../TextField'
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

const SUGGESTIONS = ['Add ₹250 lunch, split with everyone', 'Who owes what?', 'Make a reel', 'Plan my free day']

const WAVE_BARS = 9
const QUIET = 0.18
const CHAT_TOPIC = 'lk.chat'

type VoiceOverlayProps = {
  conn: VoiceConnection
  micBlocked: boolean
  /** Asked through `useVoice().open(prompt)`; sent once GhoomMate is listening */
  prompt: VoicePrompt | null
  onClose: () => void
  onRetry: () => void
  onRetryMic: () => void
  onOpenTrips: () => void
}

/** GhoomMate’s voice sheet: live agent state, transcript, and whatever card the agent puts on screen. */
export function VoiceOverlay({ conn, micBlocked, prompt, onClose, onRetry, onRetryMic, onOpenTrips }: VoiceOverlayProps) {
  const room = useRoomContext()
  const navigate = useNavigate()
  const { trip } = useActiveTrip()
  const { state: agentState, audioTrack, agent } = useVoiceAssistant()
  const { microphoneTrack, localParticipant } = useLocalParticipant()
  const transcriptions = useTranscriptions()
  const { canPlayAudio, startAudio } = useAudioPlayback(room)
  const ui = useGhoomMateUi(room, agent?.identity)

  const micTrack = microphoneTrack?.track instanceof LocalAudioTrack ? microphoneTrack.track : undefined
  const agentLevels = useMultibandTrackVolume(audioTrack, { bands: WAVE_BARS, updateInterval: 60 })
  const micLevels = useMultibandTrackVolume(micTrack, { bands: WAVE_BARS, updateInterval: 60 })

  const [typingChosen, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [typed, setTyped] = useState<{ text: string; at: number } | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const sentPrompt = useRef(0)

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

  useEffect(() => closeRef.current?.focus(), [])

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

  const submitTyped = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !live) return
    setDraft('')
    void send(text)
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
  const statusText = phase === 'listening' && micBlocked ? 'Type it to me' : STATUS[phase]

  return (
    <div className={`voice-overlay voice-overlay--${phase}`} onKeyDown={onKeyDown}>
      <button type="button" className="voice-overlay__scrim" tabIndex={-1} aria-hidden="true" onClick={onClose} />
      <section ref={sheetRef} className="voice-sheet" role="dialog" aria-modal="true" aria-labelledby="voice-sheet-title">
        <span className="voice-sheet__grabber" aria-hidden="true" />
        <header className="voice-sheet__top">
          <div>
            <h2 id="voice-sheet-title" className="voice-sheet__title">
              GhoomMate
            </h2>
            <p className="voice-sheet__meta">{groupName && phase !== 'no-trip' ? `Your ${groupName} buddy` : 'Your travel buddy'}</p>
          </div>
          <button ref={closeRef} type="button" className="voice-sheet__close" aria-label="Close GhoomMate" onClick={onClose}>
            <img src={iconClose} alt="" width={20} height={20} />
          </button>
        </header>

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
              <GhoomMateCard
                card={ui.card}
                pending={ui.pending}
                error={ui.actionError}
                onAction={(type, id) => void ui.act(type, id)}
                onNavigate={(route) => navigate(route)}
              />
            )}

            <div className="voice-suggestions">
              <p className="overline">Try saying</p>
              <div className="voice-suggestions__row no-scrollbar">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="chip" disabled={!live} onClick={() => void send(s)}>
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
                  <button type="submit" className="voice-type__send" aria-label="Send" disabled={!draft.trim() || !live}>
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

        <span className="home-indicator" aria-hidden="true" />
      </section>
    </div>
  )
}
