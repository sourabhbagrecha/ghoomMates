import { PersonaPage } from './PersonaPage'
import { QuizIntroPage } from './QuizIntroPage'
import { QuizPlayPage } from './QuizPlayPage'
import { SquadDnaPage } from './SquadDnaPage'
import { TripDeckPage } from './TripDeckPage'
import type { QuizRoute } from './quizData'

type QuizFlowProps = {
  route: QuizRoute
  go: (route: string) => void
  onDone: () => void
}

/**
 * Vibe Swipe: intro → the core deck → your travel persona → (with a trip) the trip's deck → Squad DNA.
 * Answers live in a draft per deck (services/vibeStorage), so each screen can be opened on its own and survives a reload.
 */
export function QuizFlow({ route, go, onDone }: QuizFlowProps) {
  switch (route.screen) {
    case 'intro':
      return <QuizIntroPage go={go} onDone={onDone} />
    case 'play':
      return <QuizPlayPage go={go} onDone={onDone} />
    case 'persona':
      return <PersonaPage go={go} onDone={onDone} />
    case 'trip':
      return <TripDeckPage key={route.tripId} tripId={route.tripId} go={go} onDone={onDone} />
    case 'squad':
      return <SquadDnaPage key={route.tripId} tripId={route.tripId} go={go} onDone={onDone} />
  }
}
