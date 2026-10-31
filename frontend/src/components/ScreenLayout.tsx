import type { ReactNode } from 'react'
import { HeaderActions } from './HeaderActions'
import { StatusBar } from './StatusBar'
import './ScreenLayout.css'

type ScreenLayoutProps = {
  /** Gradient header artwork; each screen has its own height in Figma */
  headerBg: string
  headerHeight: number
  eyebrow: string
  title: string
  /** Leaves room so the last item can scroll clear of the GhoomMate speech bubble */
  withBubble?: boolean
  children: ReactNode
}

/** Shared shell for every tab screen: blue header, status bar, title bar and a scrolling body. */
export function ScreenLayout({ headerBg, headerHeight, eyebrow, title, withBubble, children }: ScreenLayoutProps) {
  return (
    <div className={`screen${withBubble ? ' screen--with-bubble' : ''}`}>
      <img className="screen__header-bg" src={headerBg} alt="" width={393} height={headerHeight} />
      <div className="screen__content">
        <StatusBar />
        <header className="screen__top-bar">
          <div className="screen__heading">
            <p className="screen__eyebrow">{eyebrow}</p>
            <h1 className="screen__title">{title}</h1>
          </div>
          <HeaderActions />
        </header>
        {children}
      </div>
    </div>
  )
}
