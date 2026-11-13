
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

/**
 * Shown around your selfie while the face indexer reads a new one. The real wait is mostly a cold start (the indexer
 * scales to zero and takes ~40 s to load its models, then ~4 s to read the face), so the stages follow elapsed time
 * and switch to "ready" as soon as the server says so.
 */
export const SELFIE_READ = {
  stages: [
    { afterMs: 0, title: 'Waking up face match…', hint: 'The first read can take up to a minute' },
    { afterMs: 15_000, title: 'Finding your face…', hint: 'Spotting you in your selfie' },
    { afterMs: 30_000, title: 'Indexing your face…', hint: 'Making the face print we match photos with' },
    { afterMs: 50_000, title: 'Almost there…', hint: 'Just a few more seconds' },
  ],
  ready: { title: 'Your face is ready', hint: (photos: string) => `Tap Find me to spot you in ${photos}` },
  slow: { title: 'Still reading your selfie', hint: 'This is taking longer than usual', action: 'Check again' },
  noFace: { title: 'No face in your selfie', hint: 'Add one where your face fills the frame', action: 'Update selfie' },
  error: { title: 'Couldn’t read your selfie', hint: 'Try another photo of just you', action: 'Update selfie' },
  checking: 'Checking your selfie…',
}
