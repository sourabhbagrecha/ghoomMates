import type { CSSProperties } from 'react'
import { Easing, interpolate } from 'remotion'
import type { ReelMotion } from '../../services/reelsService'

/** The camera move over a photo across its scene, `progress` from 0 to 1 */
export function motionStyle(motion: ReelMotion, progress: number): CSSProperties {
  const t = Easing.inOut(Easing.quad)(Math.min(1, Math.max(0, progress)))
  switch (motion) {
    case 'zoom-out':
      return { transform: `scale(${interpolate(t, [0, 1], [1.2, 1.02])})` }
    case 'pan-left':
      return { transform: `scale(1.18) translateX(${interpolate(t, [0, 1], [5, -5])}%)` }
    case 'pan-right':
      return { transform: `scale(1.18) translateX(${interpolate(t, [0, 1], [-5, 5])}%)` }
    case 'pan-up':
      return { transform: `scale(1.18) translateY(${interpolate(t, [0, 1], [5, -5])}%)` }
    default:
      return { transform: `scale(${interpolate(t, [0, 1], [1.02, 1.2])})` }
  }
}
