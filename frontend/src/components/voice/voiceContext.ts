import { createContext, useContext } from 'react'

export type VoiceApi = {
  /** Opens the GhoomMate voice overlay. Pass `prompt` to start with that phrase as if it was just said. */
  open: (prompt?: string) => void
}

export const VoiceContext = createContext<VoiceApi>({ open: () => {} })

/** `useVoice().open()` → GhoomMate starts listening; `open('Plan Day 3')` pre-fills what was said. */
export const useVoice = () => useContext(VoiceContext)
