import type { ReelPlan, ReelTransition } from './types'

export const REEL_FPS = 30
export const REEL_WIDTH = 1080
export const REEL_HEIGHT = 1920

// Together the title and end cards take the 3 seconds the planner leaves out of the scene budget
const INTRO_FRAMES = 42
const OUTRO_FRAMES = 48
const MAX_TRANSITION_FRAMES = 12

export type ReelTimeline = {
  intro: number
  outro: number
  /** Frames per scene */
  scenes: number[]
  /** The transition into each scene; the first one comes out of the title card */
  transitions: { kind: ReelTransition; frames: number }[]
  outroIn: number
  total: number
}

// Transitions overlap the scenes either side, so each one is at most half the shorter of the two.
const overlap = (a: number, b: number) => Math.min(MAX_TRANSITION_FRAMES, Math.floor(Math.min(a, b) / 2))

/** Frame layout of a plan, shared by the player and the MP4 export */
export function reelTimeline(plan: ReelPlan): ReelTimeline {
  const planned = plan.scenes.map((s) => Math.max(12, Math.round(s.seconds * REEL_FPS)))
  const transitions = plan.scenes.map((s, i) => {
    const kind: ReelTransition = i === 0 ? 'fade' : s.transition
    return { kind, frames: kind === 'cut' ? 0 : overlap(i === 0 ? INTRO_FRAMES : planned[i - 1], planned[i]) }
  })
  const outroIn = overlap(planned[planned.length - 1], OUTRO_FRAMES)
  // Each scene and the end card grow by the transition into them, so the reel runs as long as planned
  const scenes = planned.map((f, i) => f + transitions[i].frames)
  const outro = OUTRO_FRAMES + outroIn
  const total = INTRO_FRAMES + planned.reduce((sum, f) => sum + f, 0) + OUTRO_FRAMES
  return { intro: INTRO_FRAMES, outro, scenes, transitions, outroIn, total }
}

/** "0:27" */
export function formatReelDuration(frames: number): string {
  const seconds = Math.round(frames / REEL_FPS)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
