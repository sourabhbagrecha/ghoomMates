import { useEffect, useRef, useState } from 'react'
import './OtpInput.css'

type OtpInputProps = {
  value: string
  onChange: (value: string) => void
  length?: number
  autoFocus?: boolean
}

/**
 * Six digit boxes backed by one transparent input, so typing, pasting and
 * SMS autofill (`autocomplete="one-time-code"`) all work.
 */
export function OtpInput({ value, onChange, length = 6, autoFocus }: OtpInputProps) {
  const input = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const activeIndex = Math.min(value.length, length - 1)

  // autoFocus can land before the window has focus, in which case no focus event fires
  useEffect(() => {
    if (document.activeElement === input.current) setFocused(true)
  }, [])

  return (
    <div className="otp">
      <input
        ref={input}
        className="otp__input"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Verification code"
        maxLength={length}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {Array.from({ length }, (_, i) => {
        const digit = value[i]
        const state = digit ? 'filled' : focused && i === activeIndex ? 'focused' : 'empty'
        return (
          <span key={i} className={`otp__digit otp__digit--${state}`} aria-hidden="true">
            {digit}
          </span>
        )
      })}
    </div>
  )
}
