import type { JSX } from 'react'
import { EditProfilePage } from './EditProfilePage'
import { HelpPage } from './HelpPage'
import { QUIZ } from './profileData'
import { QuizCardPage } from './QuizCardPage'
import { QuizIntroPage } from './QuizIntroPage'
import { QuizResultPage } from './QuizResultPage'
import { SettingsPage } from './SettingsPage'
import { YourProfilePage } from './YourProfilePage'

/**
 * Your profile and account, mounted at `#/profile[/…]`:
 *   (none)            your profile
 *   edit              edit profile
 *   quiz              vibe quiz intro → quiz/1 … quiz/8 → quiz/result
 *   settings          app settings
 *   help              help & FAQ
 * Hook-free so the app can call it and fall back to Home on `null`.
 */
export function ProfileRoutes({ path }: { path: string[] }): JSX.Element | null {
  const [screen, sub] = path

  switch (screen) {
    case undefined:
    case '':
      return <YourProfilePage />
    case 'edit':
      return <EditProfilePage />
    case 'settings':
      return <SettingsPage />
    case 'help':
      return <HelpPage />
    case 'quiz': {
      if (sub === undefined || sub === '') return <QuizIntroPage />
      if (sub === 'result') return <QuizResultPage />
      const card = Number(sub)
      if (!Number.isInteger(card) || card < 1 || card > QUIZ.length) return null
      // Keyed so each card starts at the top
      return <QuizCardPage key={card} index={card - 1} />
    }
    default:
      return null
  }
}
