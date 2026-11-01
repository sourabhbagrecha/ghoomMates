import { useState } from 'react'
import iconCheck from '../../assets/figma/icon-check-white-bold.svg'
import { Button } from '../../components/Button'
import type { QuizQuestion } from '../../services/storiesService'
import type { Copy } from './storiesData'
import './QuizBoard.css'

type QuizBoardProps = {
  quiz: QuizQuestion[]
  copy: Copy
  /** Called with one chosen option per question once the last has been answered */
  onDone: (answers: number[]) => void
}

const LETTERS = ['A', 'B', 'C']

/** Three questions, one at a time, with the answer and its fact shown straight after each pick */
export function QuizBoard({ quiz, copy, onDone }: QuizBoardProps) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const question = quiz[index]
  const last = index === quiz.length - 1
  const right = picked === question.answerIndex

  const next = () => {
    const all = [...answers, picked ?? 0]
    if (last) {
      onDone(all)
      return
    }
    setAnswers(all)
    setPicked(null)
    setIndex(index + 1)
  }

  return (
    <section className="card quiz" aria-labelledby="quiz-question">
      <div className="quiz__top">
        <p className="overline">{copy.question(index + 1, quiz.length)}</p>
        <div className="quiz__steps" role="progressbar" aria-label={copy.question(index + 1, quiz.length)} aria-valuemin={1} aria-valuemax={quiz.length} aria-valuenow={index + 1}>
          {quiz.map((_, i) => (
            <span key={i} className={i <= index ? 'quiz__step quiz__step--done' : 'quiz__step'} />
          ))}
        </div>
      </div>

      <h2 id="quiz-question" className="quiz__question">
        {question.question}
      </h2>

      <div className="quiz__options" role="radiogroup" aria-labelledby="quiz-question">
        {question.options.map((option, i) => {
          const state = picked === null ? 'idle' : i === question.answerIndex ? 'right' : i === picked ? 'wrong' : 'dim'
          return (
            <button
              key={`${index}-${i}`}
              type="button"
              role="radio"
              aria-checked={picked === i}
              className={`quiz__option quiz__option--${state}`}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
            >
              <span className="quiz__letter">{state === 'right' ? <img src={iconCheck} alt="" width={14} height={14} /> : LETTERS[i]}</span>
              <span className="quiz__option-text">{option}</span>
            </button>
          )
        })}
      </div>

      {picked !== null && (
        <p className={`quiz__feedback quiz__feedback--${right ? 'right' : 'wrong'}`} role="status">
          <strong>{right ? copy.right : copy.wrong}</strong>
          {!right && ` ${copy.answerWas(question.options[question.answerIndex])}`} {question.fact}
        </p>
      )}

      {picked !== null && (
        <Button variant="primary" onClick={next}>
          {last ? copy.seeScore : copy.nextQuestion}
        </Button>
      )}
    </section>
  )
}
