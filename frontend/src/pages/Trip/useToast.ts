import { useCallback, useEffect, useRef, useState } from 'react'

/** Short-lived confirmation message for stubbed actions (share, download, maps…). */
export function useToast(duration = 2400): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback(
    (next: string) => {
      window.clearTimeout(timer.current)
      setMessage(next)
      timer.current = window.setTimeout(() => setMessage(null), duration)
    },
    [duration],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return [message, show]
}
