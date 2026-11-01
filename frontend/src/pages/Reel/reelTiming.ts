import type { ReelPlan } from '../../services/reelsService'
import type { MapTiles } from './mapMath'

// Size and timing of the reel video, shared by the composition, the Player and the MP4 export

export const REEL_FPS = 30
export const REEL_WIDTH = 720
export const REEL_HEIGHT = 1280

export const TITLE_FRAMES = 60
export const END_FRAMES = 75
export const TRANSITION_FRAMES = 15

export type ReelProps = {
  plan: ReelPlan
  tripName: string
  /** Load photos with CORS so the web renderer can read their pixels; the Player doesn't need it */
  forExport?: boolean
  /** Map tile source the backend reports; Esri when unknown */
  mapTiles?: MapTiles
}

export const sceneFrames = (seconds: number) => Math.max(REEL_FPS, Math.round(seconds * REEL_FPS))

/** Length of the whole reel in frames, transitions overlapping the scenes they join. */
export function reelDurationInFrames(plan: ReelPlan) {
  const cuts = plan.scenes.slice(1).filter((s) => s.transition === 'cut').length
  // Title → first photo and last photo → end card always fade
  const transitions = plan.scenes.length + 1 - cuts
  return TITLE_FRAMES + plan.scenes.reduce((sum, s) => sum + sceneFrames(s.seconds), 0) + END_FRAMES - transitions * TRANSITION_FRAMES
}
