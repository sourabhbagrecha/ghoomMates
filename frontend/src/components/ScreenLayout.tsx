import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react'
import iconBack from '../assets/figma/icon-back-white.svg'
import { HeaderActions } from './HeaderActions'
import { ScreenBackContext } from './screenBack'
import { TopSafeArea } from './TopSafeArea'
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
  /**
   * The blue header grows to fit its content and the body starts below it, for headers whose content height
   * varies (e.g. a greeting that wraps). Without it the artwork has a fixed height and the body may overlap it,
   * which screens with cards on the blue rely on.
   */
  fitHeader?: boolean
  children: ReactNode
}

/** Blue below the last header row when the header fits its content */
const HEADER_PADDING = 20

/** A title longer than this (a trip called “Mewar Mates · Udaipur”) wraps onto two lines at a smaller size instead of running under the header buttons */
const LONG_TITLE = 14

/** Grows the header artwork to clear the last `.screen__header-row` and starts `.screen__body` below it */
function useFitHeader(enabled: boolean | undefined, headerHeight: number) {
  const screen = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = screen.current
    const art = root?.querySelector<HTMLElement>('.screen__header-bg')
    const rows = root?.querySelectorAll<HTMLElement>('.screen__top-bar, .screen__header-row')
    const body = root?.querySelector<HTMLElement>('.screen__body')
    if (!enabled || !root || !art || !rows?.length || !body) return
    const fit = () => {
      const last = rows[rows.length - 1]
      const headerEnd = last.offsetTop + last.offsetHeight
      const artBottom = Math.max(art.offsetTop + headerHeight, headerEnd + HEADER_PADDING)
      art.style.height = `${artBottom - art.offsetTop}px`
      body.style.marginTop = `${artBottom - headerEnd}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    rows.forEach((row) => observer.observe(row))
    return () => observer.disconnect()
  })
  return screen
}

/** Shared shell for every tab screen: blue header, title bar and a scrolling body. */
export function ScreenLayout({
  headerBg,
  headerHeight,
  eyebrow,
  title,
  actions,
  withBubble,
  fitHeader,
  children,
}: ScreenLayoutProps) {
  const onBack = useContext(ScreenBackContext)
  const longTitle = title.length > LONG_TITLE
  // The second title line pushes the header rows down, so the artwork has to grow with them
  const screen = useFitHeader(fitHeader || longTitle, headerHeight)

  return (
    <div ref={screen} className={`screen${withBubble ? ' screen--with-bubble' : ''}`}>
      <img className="screen__header-bg" src={headerBg} alt="" width={393} height={headerHeight} />
      <div className="screen__content">
        <TopSafeArea />
        <header className="screen__top-bar">
          <div className="screen__title-group">
            {onBack && (
              <button type="button" className="screen__back" onClick={onBack} aria-label="Back to home">
                <img src={iconBack} alt="" width={20} height={20} />
              </button>
            )}
            <div className="screen__heading">
              <p className="screen__eyebrow">{eyebrow}</p>
              <h1 className={`screen__title${longTitle ? ' screen__title--long' : ''}`}>{title}</h1>
            </div>
          </div>
          {actions ?? <HeaderActions />}
        </header>
        {children}
      </div>
    </div>
  )
}
