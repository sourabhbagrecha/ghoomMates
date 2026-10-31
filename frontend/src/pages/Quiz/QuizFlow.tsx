import { useState } from 'react'
import { saveVibe } from '../../services/vibeStorage'
import { PersonaPage } from './PersonaPage'
import { QuizCardPage } from './QuizCardPage'
import { QuizIntroPage } from './QuizIntroPage'
import { QUIZ_CARDS, cardRoute, scoreQuiz, type QuizAnswers, type QuizRoute } from './quizData'

type QuizFlowProps = {
  route: QuizRoute
  go: (route: string) => void
  onDone: () => void
}

/**
 * Intro → 8 flashcards → your travel persona → app.
 * Holds the answers so they survive moving back and forth between cards.
 */
export function QuizFlow({ route, go, onDone }: QuizFlowProps) {
  const [answers, setAnswers] = useState<QuizAnswers>({})
  const lastCard = QUIZ_CARDS.length - 1
  const next = (index: number) => {
    if (index < lastCard) return go(cardRoute(index + 1))
    saveVibe(scoreQuiz(answers))
    go('quiz/persona')
  }

  switch (route.screen) {
    case 'intro':
      return <QuizIntroPage onBack={() => window.history.back()} onStart={() => go(cardRoute(0))} onSkip={onDone} />
    case 'card':
      return (
        <QuizCardPage
          key={route.index}
          index={route.index}
          picked={answers[QUIZ_CARDS[route.index].id] ?? []}
          scores={scoreQuiz(answers)}
          onPick={(picked) => setAnswers((a) => ({ ...a, [QUIZ_CARDS[route.index].id]: picked }))}
          onBack={() => go(route.index > 0 ? cardRoute(route.index - 1) : 'quiz')}
          onNext={() => next(route.index)}
          onSkipQuiz={onDone}
        />
      )
    case 'persona':
      return <PersonaPage scores={scoreQuiz(answers)} onBack={() => go(cardRoute(lastCard))} onDone={onDone} />
  }
}
