import type { ButtonHTMLAttributes } from 'react'
import './Button.css'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** highlight = yellow CTA on blue · primary = blue CTA on light · glass = secondary on blue · outline = secondary on light */
  variant?: 'highlight' | 'primary' | 'glass' | 'outline'
}

/** Full-width 52px button used for screen-level actions (onboarding, sheets). */
export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={`button button--${variant}${className ? ` ${className}` : ''}`} {...rest} />
}

/** Low-emphasis text action that sits under a Button, e.g. “Skip for now”. */
export function LinkButton({ className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`link-button${className ? ` ${className}` : ''}`} {...rest} />
}
