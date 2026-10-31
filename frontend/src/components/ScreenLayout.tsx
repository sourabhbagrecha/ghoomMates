import { useContext, type ReactNode } from 'react'
import iconBack from '../assets/figma/icon-back-white.svg'
import { HeaderActions } from './HeaderActions'
import { ScreenBackContext } from './screenBack'
import { StatusBar } from './StatusBar'
import './ScreenLayout.css'

type ScreenLayoutProps = {
  /** Gradient header artwork; each screen has its own height in Figma */
  headerBg: string
  headerHeight: number
  eyebrow: string
  title: string
  /** Right side of the title bar; defaults to the QR + profile buttons */
  actions?: ReactNode
  /** Leaves room so the last item can scroll clear of the GhoomMate speech bubble */
  withBubble?: boolean
  children: ReactNode
}

/** Shared shell for every tab screen: blue header, status bar, title bar and a scrolling body. */
export function ScreenLayout({ headerBg, headerHeight, eyebrow, title, actions, withBubble, children }: ScreenLayoutProps) {
  const onBack = useContext(ScreenBackContext)

  return (
    <div className={`screen${withBubble ? ' screen--with-bubble' : ''}`}>
      <img className="screen__header-bg" src={headerBg} alt="" width={393} height={headerHeight} />
      <div className="screen__content">
        <StatusBar />
        <header className="screen__top-bar">
          <div className="screen__title-group">
            {onBack && (
              <button type="button" className="screen__back" onClick={onBack} aria-label="Back to home">
                <img src={iconBack} alt="" width={20} height={20} />
              </button>
            )}
            <div className="screen__heading">
              <p className="screen__eyebrow">{eyebrow}</p>
              <h1 className="screen__title">{title}</h1>
            </div>
          </div>
          {actions ?? <HeaderActions />}
        </header>
        {children}
      </div>
    </div>
  )
}
