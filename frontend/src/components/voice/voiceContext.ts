import { createContext, useContext } from 'react'

/** Ink pill under the status bar after a voice action, with an optional follow-up (“View”) */
export type Notice = { message: string; action?: { label: string; route: string } }

export type VoiceApi = {
  /** Opens GhoomMate. Pass `prompt` to send that phrase to the agent as soon as it’s listening. */
  open: (prompt?: string) => void
  /** Shows the notice pill for 4s */
  notify: (notice: Notice) => void
}

export const VoiceContext = createContext<VoiceApi>({ open: () => {}, notify: () => {} })

/** `useVoice().open()` → GhoomMate joins and starts listening; `open('Plan my free day')` also asks that. */
export const useVoice = () => useContext(VoiceContext)
