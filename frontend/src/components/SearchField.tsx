import type { FormEvent } from 'react'
import iconMicPrimary from '../assets/figma/icon-mic-primary.svg'
import iconSearch from '../assets/figma/icon-search.svg'
import './SearchField.css'

type SearchFieldProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** Accessible name of the input */
  label: string
  /** Enter key; when set the field is a form */
  onSubmit?: () => void
  /** Mic button, e.g. opens GhoomMate with a starter sentence */
  onVoice?: () => void
  voiceLabel?: string
  disabled?: boolean
  maxLength?: number
  /** `header` floats on the blue header; `inset` sits inside a white card */
  variant?: 'header' | 'inset'
}

/** Rounded search input with an optional mic button (Explore header, Photos search). */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  onSubmit,
  onVoice,
  voiceLabel = 'Search by voice',
  disabled,
  maxLength,
  variant = 'header',
}: SearchFieldProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit?.()
  }
  const className = `search${variant === 'inset' ? ' search--inset' : ''}`
  const field = (
    <>
      <img src={iconSearch} alt="" width={18} height={18} />
      <input
        type="search"
        enterKeyHint={onSubmit ? 'search' : undefined}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
      {onVoice && (
        <button type="button" className="search__voice" aria-label={voiceLabel} onClick={onVoice}>
          <img src={iconMicPrimary} alt="" width={18} height={18} />
        </button>
      )}
    </>
  )
  return onSubmit ? (
    <form className={className} role="search" onSubmit={submit}>
      {field}
    </form>
  ) : (
    <label className={className}>{field}</label>
  )
}
