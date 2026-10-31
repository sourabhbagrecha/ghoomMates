import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { voiceApi, type HistoryItem } from '../../services/voiceService'
import { LinkButton } from '../Button'

type ChatHistoryProps = {
  tripId: string
}

/** "Today", "Yesterday" or "Sat, 31 Oct" */
function dayOf(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000,
  )
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/** Everything you and GhoomMate said in this trip, by day, newest at the bottom. Saved by the agent as you talk. */
export function ChatHistory({ tripId }: ChatHistoryProps) {
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    let cancelled = false
    voiceApi
      .history(tripId)
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && setError('Couldn’t load your chats. Try again in a bit.'))
    return () => {
      cancelled = true
    }
  }, [tripId])

  // Open at the latest message
  useLayoutEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [items])

  const clear = async () => {
    setClearing(true)
    try {
      await voiceApi.clearHistory(tripId)
      setItems([])
      setConfirmClear(false)
    } catch {
      setError('Couldn’t clear your chats. Try again?')
    } finally {
      setClearing(false)
    }
  }

  return (
    <section className="voice-history" aria-label="Chat history">
      <p className="overline voice-card__overline">Chat history</p>

      {error && <p className="voice-card__error">{error}</p>}
      {!items && !error && <p className="voice-card__text">Loading your chats…</p>}
      {items?.length === 0 && (
        <p className="voice-card__text">Nothing yet. What you and GhoomMate say in this trip shows up here.</p>
      )}

      {items && items.length > 0 && (
        <ol ref={listRef} className="voice-history__list">
          {items.map((item, i) => {
            const day = dayOf(item.createdAt)
            const newDay = i === 0 || dayOf(items[i - 1].createdAt) !== day
            return (
              <li key={item.id} className="voice-history__item">
                {newDay && <p className="voice-history__day">{day}</p>}
                <p className={`voice-history__bubble voice-history__bubble--${item.role === 'user' ? 'you' : 'mate'}`}>
                  {item.text}
                  <span className="voice-history__time">{timeOf(item.createdAt)}</span>
                </p>
              </li>
            )
          })}
        </ol>
      )}

      {items && items.length > 0 && !confirmClear && (
        <LinkButton className="voice-history__clear" onClick={() => setConfirmClear(true)}>
          Clear history
        </LinkButton>
      )}
      {confirmClear && (
        <div className="voice-history__confirm" role="group" aria-label="Clear chat history">
          <p>Clear all your GhoomMate chats in this trip? GhoomMate won’t recall them next time. Remembered preferences stay.</p>
          <div className="voice-card__actions">
            <button type="button" className="pill-button" disabled={clearing} onClick={() => setConfirmClear(false)}>
              Keep
            </button>
            <button type="button" className="pill-button" disabled={clearing} onClick={() => void clear()}>
              {clearing ? 'Clearing…' : 'Clear'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
