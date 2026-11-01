import { useState } from 'react'
import iconArrow from '../../assets/figma/icon-arrow-white.svg'
import iconSparkles from '../../assets/figma/icon-sparkles-primary.svg'
import { makersApi, type Answer, type MakerDetail } from '../../services/makersService'
import { firstName } from './makersData'
import './AskMaker.css'

/** Ask about the maker or the craft. Answered by Gemini from this maker's facts only, or from the studio FAQ. */
export function AskMaker({ maker }: { maker: MakerDetail }) {
  const who = firstName(maker.name)
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState<string | null>(null)
  const [answer, setAnswer] = useState<Answer | null>(null)
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
      setAnswer(await makersApi.ask(maker.id, q))
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Couldn’t get an answer right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card ask-maker">
      <div className="ask-maker__head">
        <img src={iconSparkles} alt="" width={16} height={16} />
        <h2 className="overline">Ask {who}</h2>
      </div>
      <div className="ask-maker__suggestions no-scrollbar">
        {maker.questions.map((q) => (
          <button key={q} type="button" className="ask-maker__suggestion" disabled={loading} onClick={() => void ask(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="ask-maker__form"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <input
          aria-label={`Ask ${who} a question`}
          placeholder={`Ask about ${who}’s craft…`}
          maxLength={300}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="ask-maker__send" aria-label="Ask" disabled={!question.trim() || loading}>
          <img src={iconArrow} alt="" width={18} height={18} />
        </button>
      </form>
      {asked && (
        <div className="ask-maker__thread" aria-live="polite">
          <p className="ask-maker__question">{asked}</p>
          {loading && <p className="ask-maker__reply ask-maker__reply--wait">Asking {who}’s studio…</p>}
          {problem && <p className="ask-maker__reply">{problem}</p>}
          {answer && (
            <div className="ask-maker__reply">
              <p>{answer.answer}</p>
              <span>{answer.source === 'gemini' ? `Answered by GhoomMate from ${who}’s profile` : 'From the studio FAQ'}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
