import octopus from '../assets/figma/ghoommate-octopus.png'
import type { TripReelProps } from './types'

/** GhoomMate on the end card */
export const REEL_MASCOT = octopus

/** Every image the reel draws, so the export can decode them before it starts */
export const reelImageSources = ({ plan, photos }: TripReelProps) => [
  REEL_MASCOT,
  ...new Set(plan.scenes.map((s) => photos[s.photoId].src)),
]
