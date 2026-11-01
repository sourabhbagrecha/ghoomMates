import grid1 from '../../assets/figma/photo-grid-1.svg'
import grid2 from '../../assets/figma/photo-grid-2.svg'
import grid3 from '../../assets/figma/photo-grid-3.svg'
import grid4 from '../../assets/figma/photo-grid-4.svg'
import grid5 from '../../assets/figma/photo-grid-5.svg'
import grid6 from '../../assets/figma/photo-grid-6.svg'

export type PipelineStep = {
  label: string
  status: 'done' | 'current' | 'pending'
}

export const PIPELINE: PipelineStep[] = [
  { label: 'Ingest', status: 'pending' },
  { label: 'Faces', status: 'pending' },
  { label: 'Embed', status: 'pending' },
  { label: 'Match', status: 'pending' },
  { label: 'Reel', status: 'pending' },
]

export const REEL = {
  placeholder: 'e.g. “30s of our best moments, fast cuts and big captions”',
  /** Chips that fill the prompt box */
  presets: [
    { label: 'Hype edit', prompt: 'A fast, high-energy 20 second hype edit of the whole trip with bold captions' },
    { label: 'Dreamy', prompt: 'A slow, dreamy reel of the prettiest views and golden-hour shots' },
    { label: 'Funny bits', prompt: 'Our funniest, most candid moments with cheeky captions' },
    { label: 'Retro film', prompt: 'A nostalgic retro film-photo reel of the trip, start to finish' },
  ],
}

export const PHOTOS = [grid1, grid2, grid3, grid4, grid5, grid6]
