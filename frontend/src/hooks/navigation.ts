import { createContext, useContext } from 'react'
import type { Navigate } from './useHashRoute'

/** App-wide navigation, so any screen can move to another route without prop drilling. */
export const NavigateContext = createContext<Navigate>(() => {})

/** `navigate('trip/expenses/add')` → `#/trip/expenses/add`. Pass `{ replace: true }` to skip history. */
export const useNavigate = () => useContext(NavigateContext)
