import { reelImageSources } from './assets'
import type { PlannedReel } from './planner'
import { REEL_FPS, REEL_HEIGHT, REEL_WIDTH, reelTimeline } from './timeline'
import { TripReel } from './TripReel'

/** Renders the reel to an MP4 in the browser (WebCodecs, no server). Chrome and Firefox; Safari skips CSS filters. */
export async function exportReel(reel: PlannedReel, onProgress: (progress: number) => void, signal?: AbortSignal): Promise<File> {
  // Loaded on demand: the encoder is only needed once someone saves or shares
  const { renderMediaOnWeb } = await import('@remotion/web-renderer')
  const props = { plan: reel.plan, photos: reel.photos }
  // Decode every image while the page is still in front: a backgrounded tab can stall image decoding
  // mid-render, and the end card's mascot is never shown before then
  await Promise.all(
    reelImageSources(props).map((src) => {
      const img = new Image()
      img.src = src
      return img.decode()
    }),
  )
  const { getBlob } = await renderMediaOnWeb({
    composition: {
      id: 'trip-reel',
      component: TripReel,
      durationInFrames: reelTimeline(reel.plan).total,
      fps: REEL_FPS,
      width: REEL_WIDTH,
      height: REEL_HEIGHT,
      defaultProps: props,
    },
    inputProps: props,
    container: 'mp4',
    muted: true,
    // Remotion company license key, or "free-license" if Ghoomates qualifies (https://remotion.dev/license)
    licenseKey: import.meta.env.VITE_REMOTION_LICENSE_KEY || null,
    signal: signal ?? null,
    onProgress: ({ progress }) => onProgress(progress),
  })
  const name = reel.plan.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'ghoomates-reel'
  return new File([await getBlob()], `${name}.mp4`, { type: 'video/mp4' })
}

/** Opens the share sheet with the video where the browser supports sharing files, else downloads it */
export async function shareOrSave(file: File, share: boolean): Promise<'shared' | 'saved' | 'cancelled'> {
  if (share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      throw err
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'saved'
}
