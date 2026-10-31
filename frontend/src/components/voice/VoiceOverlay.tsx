import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import iconSend from '../../assets/figma/icon-arrow-white.svg'
import iconClose from '../../assets/figma/icon-x-ink.svg'
import { useNavigate } from '../../hooks/navigation'
import { tripActions } from '../../pages/Trip/tripStore'
import { formatINR } from '../../pages/Trip/tripFormat'
import { Button, LinkButton } from '../Button'
import { GhoomMateAvatar } from '../GhoomMate'
import { TextField } from '../TextField'
import { parseIntent, summarise, SUGGESTIONS, type VoiceIntent } from './intents'
import '../Chip.css'
import './VoiceOverlay.css'

type Phase = 'listening' | 'thinking' | 'understood' | 'unknown' | 'typing'

const STATUS: Record<Phase, string> = {
  listening: 'Listening…',
  thinking: 'Thinking…',
  understood: 'Got it! Is this right?',
  unknown: 'Hmm, I didn’t catch that',
  typing: 'Type it to me',
}

// Mock timings for the simulated recogniser
const FIRST_LISTEN_MS = 1400
const LISTEN_MS = 400
const CHAR_MS = 35
const THINK_MS = 600
const WAVE_BARS = 9

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

type VoiceOverlayProps = {
  /** Phrase to "hear" straight away; without it GhoomMate pretends to hear the first suggestion */
  prompt?: string
  onClose: () => void
  onNotify: (notice: { message: string; action?: { label: string; route: string } }) => void
}

/** GhoomMate's voice sheet: listen → live transcript → confirmation card. */
export function VoiceOverlay({ prompt, onClose, onNotify }: VoiceOverlayProps) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('listening')
  // What GhoomMate "heard"; empty while waiting for a chip or typed text
  const [heard, setHeard] = useState(prompt ?? SUGGESTIONS[0])
  const [shown, setShown] = useState(0)
  const [run, setRun] = useState(0)
  const [draft, setDraft] = useState('')
  const sheetRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const intent = useMemo(() => parseIntent(heard), [heard])
  const summary = summarise(intent)
  const listenDelay = run === 0 && !prompt ? FIRST_LISTEN_MS : LISTEN_MS

  useEffect(() => closeRef.current?.focus(), [])

  // TODO: replace the simulated recogniser with real speech-to-text (Web Speech API where
  // available, or streaming audio to the voice service), feeding interim results into `shown`.
  useEffect(() => {
    if (phase !== 'listening' || !heard) return
    let tick: number | undefined
    const start = window.setTimeout(() => {
      if (reducedMotion()) {
        setShown(heard.length)
        setPhase('thinking')
        return
      }
      let count = 0
      tick = window.setInterval(() => {
        count += 1
        setShown(count)
        if (count >= heard.length) {
          window.clearInterval(tick)
          setPhase('thinking')
        }
      }, CHAR_MS)
    }, listenDelay)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(tick)
    }
  }, [phase, heard, run, listenDelay])

  useEffect(() => {
    if (phase !== 'thinking') return
    const timer = window.setTimeout(() => setPhase(intent.kind === 'unknown' ? 'unknown' : 'understood'), THINK_MS)
    return () => window.clearTimeout(timer)
  }, [phase, intent])

  useEffect(() => {
    if (phase === 'typing') sheetRef.current?.querySelector('input')?.focus()
  }, [phase])

  const listen = (phrase: string) => {
    setHeard(phrase)
    setShown(0)
    setPhase('listening')
    setRun((r) => r + 1)
  }

  const submitTyped = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setHeard(text)
    setShown(text.length)
    setPhase('thinking')
  }

  const edit = () => {
    setDraft(heard)
    setPhase('typing')
  }

  const accept = (action: VoiceIntent) => {
    // TODO: hand confirmed intents to the assistant service instead of acting locally
    switch (action.kind) {
      case 'expense': {
        const { title, amount, paidBy, category, splitWith } = action.expense
        const share = Math.round(amount / splitWith.length)
        tripActions.addExpense({
          id: `expense-${Date.now().toString(36)}`,
          title,
          amount,
          paidBy,
          category,
          shares: Object.fromEntries(splitWith.map((id) => [id, share])),
          receipt: null,
        })
        onClose()
        onNotify({
          message: `Added ${formatINR(amount)} for ${title}, split ${splitWith.length} ways`,
          action: { label: 'View', route: 'trip/expenses' },
        })
        return
      }
      case 'plan-day':
        onClose()
        navigate('trip/itinerary')
        return
      case 'food':
        onClose()
        navigate('trip/explore')
        return
      case 'reel':
        onClose()
        navigate('trip/photos/reel')
        return
    }
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

  const listening = phase === 'listening'
  const transcript = phase === 'typing' ? '' : heard.slice(0, listening ? shown : heard.length)
  const typingOut = listening && shown > 0 && shown < heard.length

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
            <p className="voice-sheet__meta">Your Goa Gang buddy</p>
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
          {STATUS[phase]}
        </p>

        <div className="voice-wave" aria-hidden="true">
          {Array.from({ length: WAVE_BARS }, (_, i) => (
            <span key={i} />
          ))}
        </div>

        {phase !== 'typing' && (
          <p className={`voice-transcript${transcript ? '' : ' voice-transcript--empty'}`}>
            {transcript ? (
              <>
                “{transcript}
                {typingOut ? <span className="voice-transcript__caret" aria-hidden="true" /> : '”'}
              </>
            ) : (
              'Tap a phrase below, or just say it'
            )}
          </p>
        )}

        {phase === 'understood' && summary && (
          <div className="voice-card">
            <div className="voice-card__main">
              <span className="voice-card__icon">
                <img src={summary.icon} alt="" width={20} height={20} />
              </span>
              <div className="voice-card__info">
                <p className="overline voice-card__overline">{summary.overline}</p>
                <p className="voice-card__title">{summary.title}</p>
                <p className="voice-card__details">{summary.details.join(' · ')}</p>
              </div>
            </div>
            <div className="voice-card__actions">
              <Button variant="primary" onClick={() => accept(intent)}>
                Confirm
              </Button>
              <Button variant="outline" onClick={edit}>
                Edit
              </Button>
            </div>
          </div>
        )}

        {phase === 'unknown' && (
          <div className="voice-card">
            <p className="voice-card__text">
              I’m still learning! Try one of the phrases below, or type it out for me.
            </p>
            <Button variant="primary" onClick={() => listen('')}>
              Try again
            </Button>
          </div>
        )}

        <div className="voice-suggestions">
          <p className="overline">Try saying</p>
          <div className="voice-suggestions__row no-scrollbar">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => listen(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {phase === 'typing' ? (
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
              <button type="submit" className="voice-type__send" aria-label="Send" disabled={!draft.trim()}>
                <img src={iconSend} alt="" width={18} height={18} />
              </button>
            </div>
            <LinkButton onClick={() => listen('')}>Speak instead</LinkButton>
          </form>
        ) : (
          <LinkButton className="voice-sheet__type" onClick={() => setPhase('typing')}>
            Type instead
          </LinkButton>
        )}

        <span className="home-indicator" aria-hidden="true" />
      </section>
    </div>
  )
}
