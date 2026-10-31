import grid1 from '../../assets/figma/photo-grid-1.svg'
import grid2 from '../../assets/figma/photo-grid-2.svg'
import grid3 from '../../assets/figma/photo-grid-3.svg'
import grid4 from '../../assets/figma/photo-grid-4.svg'
import grid5 from '../../assets/figma/photo-grid-5.svg'
import grid6 from '../../assets/figma/photo-grid-6.svg'
import type { PersonId } from '../../data/people'

export const LIBRARY = {
  photos: '1,284',
  videos: 46,
}

export const UPLOAD = {
  uploaded: 248,
  total: 312,
}

export const FACE_MATCH: { person: PersonId; count: number } = { person: 'kabir', count: 186 }

export type PipelineStep = {
  label: string
  status: 'done' | 'current' | 'pending'
}

export const PIPELINE: PipelineStep[] = [
  { label: 'Ingest', status: 'done' },
  { label: 'Faces', status: 'done' },
  { label: 'Embed', status: 'done' },
  { label: 'Match', status: 'current' },
  { label: 'Reel', status: 'pending' },
]

export const REEL = {
  prompt: '“Make a 30s reel of Kabir’s funniest moments with a Bollywood beat”',
  duration: '0:30',
  presets: ['Hackathon recap', 'Beach day'],
}

export const PHOTOS = [grid1, grid2, grid3, grid4, grid5, grid6]
