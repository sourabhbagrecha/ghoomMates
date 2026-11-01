import { prefetch } from 'remotion'
import { canRenderMediaOnWeb, renderMediaOnWeb } from '@remotion/web-renderer'
import type { Reel } from '../../services/reelsService'
import { lookOf } from './looks'
import { mapLayers, type MapTiles } from './mapMath'
import { ReelComposition } from './ReelComposition'
import { REEL_FPS, REEL_HEIGHT, REEL_WIDTH, reelDurationInFrames, type ReelProps } from './reelTiming'

const fileName = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ghoommates-reel'}.mp4`

// Downloads at the same time while prefetching, and tries per file
const PREFETCH_AT_ONCE = 6
const PREFETCH_TRIES = 2

/** Every photo and map tile the reel shows. */
function assetUrls(reel: Reel, mapTiles: MapTiles) {
  const look = lookOf(reel.plan.style).map
  const urls = reel.plan.scenes.flatMap((scene) => [
    ...scene.photos.map((p) => p.url),
    ...(scene.kind === 'map' && scene.places?.length ? mapLayers(look, mapTiles, scene.places, REEL_WIDTH, REEL_HEIGHT).flatMap((l) => l.tiles.map((t) => t.url)) : []),
  ])
  return [...new Set(urls)]
}

/**
 * Downloads every image before rendering, a few at a time with a retry, so a slow photo or tile can't stall a frame
 * past its time limit. Remotion's <Img> then reads them from memory. One that still fails is left to <Img>, which skips it.
 */
async function prefetchAll(urls: string[], signal?: AbortSignal) {
  const held: { free: () => void }[] = []
  const queue = [...urls]
  const worker = async () => {
    for (let url = queue.shift(); url && !signal?.aborted; url = queue.shift()) {
      for (let attempt = 0; attempt < PREFETCH_TRIES; attempt++) {
        const fetched = prefetch(url, { method: 'blob-url' })
        try {
          await fetched.waitUntilDone()
          held.push(fetched)
          break
        } catch {
          fetched.free()
        }
      }
    }
  }
  await Promise.all(Array.from({ length: PREFETCH_AT_ONCE }, worker))
  return () => held.forEach((f) => f.free())
}

/** Renders the reel to an MP4 on this device (WebCodecs), reporting progress from 0 to 1. */
export async function renderReel(reel: Reel, tripName: string, mapTiles: MapTiles, onProgress: (progress: number) => void, signal?: AbortSignal) {
  // Reels have no soundtrack yet, so the video is muted
  const check = await canRenderMediaOnWeb({ width: REEL_WIDTH, height: REEL_HEIGHT, container: 'mp4', muted: true })
  if (!check.canRender) throw new Error(check.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' ') || 'This browser can’t make videos')
  const inputProps: ReelProps = { plan: reel.plan, tripName, forExport: true, mapTiles }
  const release = await prefetchAll(assetUrls(reel, mapTiles), signal)
  try {
    const { getBlob } = await renderMediaOnWeb({
      composition: {
        id: 'Reel',
        component: ReelComposition,
        width: REEL_WIDTH,
        height: REEL_HEIGHT,
        fps: REEL_FPS,
        durationInFrames: reelDurationInFrames(reel.plan),
        defaultProps: inputProps,
      },
      inputProps,
      container: 'mp4',
      muted: true,
      videoBitrate: 'high',
      signal: signal ?? null,
      onProgress: ({ progress }) => onProgress(progress),
      // Generous, for phones on slow connections; images are prefetched, so this is rarely needed
      delayRenderTimeoutInMilliseconds: 60_000,
    })
    const blob = await getBlob()
    return new File([blob], fileName(reel.plan.title), { type: 'video/mp4' })
  } finally {
    release()
  }
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Opens the phone's share sheet with the video where it can take files; false when it can't. */
export async function shareFile(file: File, title: string) {
  if (!navigator.canShare?.({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title })
  } catch (err) {
    // Closing the share sheet isn't an error
    if ((err as DOMException)?.name !== 'AbortError') throw err
  }
  return true
}
