import type { ReactNode } from 'react'
import iconBack from '../assets/figma/icon-back-white.svg'
import { StatusBar } from './StatusBar'
import './CoverLayout.css'

type CoverLayoutProps = {
  cover: string
  onBack: () => void
  /** Sits on the bottom of the photo, e.g. tags */
  overlay?: ReactNode
  bodyClassName?: string
  children: ReactNode
  /** Buttons pinned to the bottom of the screen */
  actions?: ReactNode
}

/** Pushed screen with a full-bleed photo header and a sheet-style body (stop, guide trip and trip recap). */
export function CoverLayout({ cover, onBack, overlay, bodyClassName, children, actions }: CoverLayoutProps) {
  return (
    <div className="cover-layout">
      <div className="cover-layout__scroll">
        <div className="cover-layout__cover">
          <img className="cover-layout__photo" src={cover} alt="" />
          <div className="cover-layout__chrome">
            <StatusBar />
            <div className="cover-layout__top-bar">
              <button type="button" className="cover-layout__back" onClick={onBack} aria-label="Back">
                <img src={iconBack} alt="" width={20} height={20} />
              </button>
            </div>
          </div>
          {overlay && <div className="cover-layout__overlay">{overlay}</div>}
        </div>
        <main className={`cover-layout__body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</main>
      </div>
      {actions ? (
        <footer className="cover-layout__actions">
          {actions}
          <span className="home-indicator" aria-hidden="true" />
        </footer>
      ) : (
        <span className="home-indicator" aria-hidden="true" />
      )}
    </div>
  )
}
