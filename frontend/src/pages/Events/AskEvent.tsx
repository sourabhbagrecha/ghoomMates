import { useState } from 'react'
import iconArrow from '../../assets/figma/icon-arrow-white.svg'
import iconSparkles from '../../assets/figma/icon-sparkles-primary.svg'
import { eventsApi, type EventAnswer } from '../../services/eventsService'
import './AskEvent.css'

/** What a squad usually wants to know before joining */
const SUGGESTIONS = ['What should we wear?', 'Can we take photos?', 'How crowded does it get?', 'Any tips for our squad?']

/** Ask GhoomMate about the event. Answered by Gemini from this event's facts only, or from the curated notes. */
export function AskEvent({ eventId, name }: { eventId: string; name: string }) {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState<string | null>(null)
  const [answer, setAnswer] = useState<EventAnswer | null>(null)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const ask = async (text: string) => {
    const q = text.trim()
    if (!q || loading) return
    setAsked(q)
    setAnswer(null)
    setProblem(null)
    setQuestion('')
    setLoading(true)
    try {
      setAnswer(await eventsApi.ask(eventId, q))
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Couldn’t get an answer right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="ask-event">
      <h4 className="overline ask-event__head">
        <img src={iconSparkles} alt="" width={14} height={14} /> Ask GhoomMate
      </h4>
      <div className="ask-event__suggestions no-scrollbar">
        {SUGGESTIONS.map((q) => (
          <button key={q} type="button" className="ask-event__suggestion" disabled={loading} onClick={() => void ask(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="ask-event__form"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <input
          aria-label={`Ask about ${name}`}
          placeholder="Ask about this festival…"
          maxLength={300}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="ask-event__send" aria-label="Ask" disabled={!question.trim() || loading}>
          <img src={iconArrow} alt="" width={18} height={18} />
        </button>
      </form>
      {asked && (
        <div className="ask-event__thread" aria-live="polite">
          <p className="ask-event__question">{asked}</p>
          {loading && <p className="ask-event__reply ask-event__reply--wait">GhoomMate is checking the notes…</p>}
          {problem && <p className="ask-event__reply">{problem}</p>}
          {answer && (
            <div className="ask-event__reply">
              <p>{answer.answer}</p>
              <span>{answer.source === 'gemini' ? 'Answered by GhoomMate from the festival notes' : 'From the festival notes'}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
