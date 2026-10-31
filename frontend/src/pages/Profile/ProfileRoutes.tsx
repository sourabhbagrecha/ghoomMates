import type { JSX } from 'react'
import { EditProfilePage } from './EditProfilePage'
import { GhoomMateMemoryPage } from './GhoomMateMemoryPage'
import { HelpPage } from './HelpPage'
import { SettingsPage } from './SettingsPage'
import { YourProfilePage } from './YourProfilePage'

/**
 * Your profile and account, mounted at `#/profile[/…]`:
 *   (none)            your profile
 *   edit              edit profile
 *   settings          app settings
 *   help              help & FAQ
 *   ghoomate          what GhoomMate remembers about you (view, edit, add, remove)
 * The vibe quiz is the personality quiz at `#/quiz` (src/pages/Quiz).
 * Hook-free so the app can call it and fall back to Home on `null`.
 */
export function ProfileRoutes({ path }: { path: string[] }): JSX.Element | null {
  const [screen] = path

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
    case 'ghoomate':
      return <GhoomMateMemoryPage />
    default:
      return null
  }
}
