import { createContext, useContext } from 'react'
import type { EntryRoutes, Navigate } from './useHashRoute'

/** App-wide navigation, so any screen can move to another route without prop drilling. */
export const NavigateContext = createContext<Navigate>(() => {})

/** `navigate('trip/expenses/add')` → `#/trip/expenses/add`. Pass `{ replace: true }` to skip history. */
export const useNavigate = () => useContext(NavigateContext)

export const EntryRoutesContext = createContext<EntryRoutes>({})

/**
 * Where a section was opened from, so its back button returns there
 * (e.g. Profile opened from a trip tab goes back to that tab, not Home).
 */
export const useEntryRoute = (section: string, fallback = '') => useContext(EntryRoutesContext)[section] ?? fallback
