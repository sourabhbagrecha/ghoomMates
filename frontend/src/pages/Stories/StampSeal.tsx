import { useId } from 'react'
import type { Grade } from '../../services/storiesService'
import './StampSeal.css'

type StampSealProps = {
  siteName: string
  grade: Grade
  score: number
  total: number
  size?: number
  /** The seal thumps onto the page and an ink ring ripples out */
  animate?: boolean
  /** An empty ring where the stamp will go */
  empty?: boolean
}

const RAYS = Array.from({ length: 12 }, (_, i) => i * 30)

/**
 * The Heritage Passport seal: a perforated edge, a ring of lettering and the Sun of Mewar, in the app's own colours.
 * Gold, silver and bronze change the disc behind the sun.
 */
export function StampSeal({ siteName, grade, score, total, size = 200, animate = false, empty = false }: StampSealProps) {
  const id = useId().replace(/:/g, '')
  const name = siteName.toUpperCase()
  const nameSize = name.length > 22 ? 9 : name.length > 15 ? 10.5 : 12

  return (
    <span className={`seal-wrap${animate ? ' seal-wrap--animate' : ''}`} style={{ width: size, height: size }}>
      <svg
        className={`seal seal--${empty ? 'empty' : grade}`}
        viewBox="0 0 200 200"
        width={size}
        height={size}
        role="img"
        aria-label={empty ? 'An empty stamp for the passport' : `${siteName} stamp: ${score} of ${total}, ${grade}`}
      >
        <defs>
          <path id={`${id}-top`} d="M 30 100 A 70 70 0 0 1 170 100" />
          <path id={`${id}-bottom`} d="M 19 100 A 81 81 0 0 0 181 100" />
        </defs>
        <circle className="seal__edge" cx="100" cy="100" r="94" />
        <circle className="seal__ring" cx="100" cy="100" r="87" />
        <circle className="seal__disc" cx="100" cy="100" r="56" />
        <circle className="seal__ring seal__ring--inner" cx="100" cy="100" r="60" />
        {!empty && (
          <>
            <text className="seal__arc">
              <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
                KAAVAD TALES · UDAIPUR
              </textPath>
            </text>
            <text className="seal__arc" fontSize={nameSize}>
              <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">
                {name}
              </textPath>
            </text>
            <g className="seal__sun" transform="translate(100 81)">
              {RAYS.map((angle) => (
                <line key={angle} x1="0" y1="-23" x2="0" y2="-15" transform={`rotate(${angle})`} />
              ))}
              <circle r="10" />
            </g>
            <text className="seal__score" x="100" y="131" textAnchor="middle">
              {score}/{total}
            </text>
          </>
        )}
        {empty && (
          <text className="seal__score seal__score--empty" x="100" y="116" textAnchor="middle">
            ?
          </text>
        )}
      </svg>
    </span>
  )
}
