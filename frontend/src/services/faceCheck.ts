import type { FaceDetector } from '@mediapipe/tasks-vision'

// On-device face detection for the face-match selfie: the photo never leaves the phone for
// this check. The library is imported lazily and its WebAssembly files and the BlazeFace model
// are fetched on first use. Keep TASKS_VISION_VERSION in sync with package.json.
const TASKS_VISION_VERSION = '1.1.1'
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

export type FaceCheckResult =
  | { ok: true }
  | { ok: false; reason: 'no-face' | 'many-faces' | 'unavailable'; message: string }

let detector: Promise<FaceDetector> | null = null

function getDetector(): Promise<FaceDetector> {
  detector ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const files = await FilesetResolver.forVisionTasks(WASM_BASE)
    return FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: FACE_MODEL },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    })
  })().catch((err) => {
    // Let the next attempt retry, e.g. after the connection comes back
    detector = null
    throw err
  })
  return detector
}

/** Start loading the detector early (e.g. when the selfie screen opens) so the check feels instant. */
export function preloadFaceCheck(): void {
  getDetector().catch(() => {})
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = src
  })
}

/** Checks that a selfie (data or object URL) shows exactly one face. */
export async function checkSingleFace(src: string): Promise<FaceCheckResult> {
  let faceDetector: FaceDetector
  try {
    faceDetector = await getDetector()
  } catch {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Couldn’t check your photo right now. Check your connection and try again.',
    }
  }

  let faces: number
  try {
    faces = faceDetector.detect(await loadImage(src)).detections.length
  } catch {
    return { ok: false, reason: 'no-face', message: 'Couldn’t read that photo. Try a different one.' }
  }

  if (faces === 1) return { ok: true }
  if (faces === 0) {
    return {
      ok: false,
      reason: 'no-face',
      message: 'We couldn’t find a face. Use a clear, front-facing photo of just you.',
    }
  }
  return {
    ok: false,
    reason: 'many-faces',
    message: `We can see ${faces} people. Use a photo with only you in it.`,
  }
}
