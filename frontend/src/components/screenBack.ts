import { createContext } from 'react'

/** When provided, tab screens show a back button that returns to Home. */
export const ScreenBackContext = createContext<(() => void) | null>(null)
