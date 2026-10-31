import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import './TextField.css'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  /** Rendered inside the box before the input, e.g. the country-code picker */
  leading?: ReactNode
}

/** Labelled 54px input. The box gets the 2px primary border while focused. */
export function TextField({ label, leading, id, ...input }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className="text-field">
      <label htmlFor={inputId} className="text-field__label">
        {label}
      </label>
      <div className={`text-field__box${leading ? ' text-field__box--prefixed' : ''}`}>
        {leading}
        <input id={inputId} className="text-field__input" {...input} />
      </div>
    </div>
  )
}
