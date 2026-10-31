import { useEffect, useRef, useState } from 'react'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconScanFace from '../../assets/figma/icon-scan-face-primary.svg'
import iconShield from '../../assets/figma/icon-shield-primary.svg'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { checkSingleFace, preloadFaceCheck } from '../../services/faceCheck'
import './SelfiePage.css'

const PRIVACY_POINTS = [
  'Only used to find you in your trip albums',
  'Never shared outside your squads',
  'Delete it anytime from Settings',
]

type SelfiePageProps = {
  userName?: string
  selfie: string | null
  onSelfie: (url: string) => void
  onBack: () => void
  onContinue: () => void
}

export function SelfiePage({ userName, selfie, onSelfie, onBack, onContinue }: SelfiePageProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  // Opens the photo library rather than the camera
  const uploadInput = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  // A photo waiting on the one-face check, and why the last one was rejected
  const [checking, setChecking] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)

  useEffect(preloadFaceCheck, [])

  // Every selfie, live or uploaded, must show exactly one face: just you
  const acceptPhoto = async (dataUrl: string) => {
    setPhotoError(null)
    setChecking(dataUrl)
    const result = await checkSingleFace(dataUrl)
    setChecking(null)
    if (!result.ok) {
      setPhotoError(result.message)
      return
    }
    stopCamera()
    onSelfie(dataUrl)
  }

  const readFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      if (typeof evt.target?.result === 'string') acceptPhoto(evt.target.result)
    }
    reader.readAsDataURL(file)
  }

  // Stop camera tracks
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  // Open the front camera whenever there's no selfie yet (first visit, or after Retake)
  useEffect(() => {
    if (selfie) return
    let canceled = false
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      })
      .then((stream) => {
        if (canceled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        // Renders the <video>; the effect below attaches the stream once it's on screen
        setCameraActive(true)
      })
      .catch((err) => {
        if (canceled) return
        console.warn('Camera access could not be started:', err)
        setCameraActive(false)
        setCameraError('Camera access not available. You can take a photo or upload instead.')
      })

    return () => {
      canceled = true
      stopCamera()
    }
  }, [selfie])

  // The <video> only exists while the camera is active, so connect the stream after it mounts.
  // (Setting srcObject before then was why the first open showed a blank viewfinder.)
  useEffect(() => {
    const video = videoRef.current
    if (!cameraActive || !video || !streamRef.current || video.srcObject === streamRef.current) return
    video.srcObject = streamRef.current
    video.play().catch(() => {})
  }, [cameraActive])

  // Capture frame from the live video feed
  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) {
      fileInput.current?.click()
      return
    }

    const width = video.videoWidth || 480
    const height = video.videoHeight || 480
    const size = Math.min(width, height)
    canvas.width = size
    canvas.height = size

    const ctx = canvas.getContext('2d')
    if (ctx) {
      // Mirror canvas horizontally to match the selfie preview
      ctx.translate(size, 0)
      ctx.scale(-1, 1)

      const startX = (width - size) / 2
      const startY = (height - size) / 2
      ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size)

      // The camera keeps running until the photo passes the check, so a retry is one tap away
      acceptPhoto(canvas.toDataURL('image/jpeg', 0.88))
    }
  }

  // Clearing the selfie re-opens the camera (see the effect above)
  const handleRetake = () => {
    setPhotoError(null)
    setCameraError(null)
    onSelfie('')
  }

  const uploadAnother = () => {
    setPhotoError(null)
    uploadInput.current?.click()
  }

  return (
    <OnboardingLayout
      eyebrow="Step 2 of 3 · Selfie"
      title="Add a selfie"
      subtitle={
        userName
          ? `Welcome ${userName}! Snap one, or upload a photo of just you, so your squad and GhoomMate can recognize you.`
          : 'Snap one, or upload a photo of just you, so your squad and GhoomMate can recognize you.'
      }
      step={2}
      totalSteps={3}
      onBack={onBack}
      bodyClassName="selfie__body"
      actions={
        selfie ? (
          <>
            <Button variant="primary" onClick={onContinue}>
              Continue with this photo
            </Button>
            <LinkButton onClick={handleRetake}>Retake selfie</LinkButton>
            <LinkButton onClick={uploadAnother}>Upload a different photo</LinkButton>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              disabled={!!checking}
              onClick={cameraActive ? capturePhoto : () => fileInput.current?.click()}
            >
              {checking ? 'Checking your photo…' : cameraActive ? 'Snap live selfie' : 'Take a photo'}
            </Button>
            <Button variant="outline" disabled={!!checking} onClick={() => uploadInput.current?.click()}>
              Upload a photo instead
            </Button>
            <LinkButton onClick={onContinue}>Skip for now</LinkButton>
          </>
        )
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        onChange={(e) => {
          readFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={uploadInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          readFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="selfie__camera">
        <svg className="selfie__ring" width="232" height="232" viewBox="0 0 232 232" aria-hidden="true">
          <circle
            cx="116"
            cy="116"
            r="114.5"
            fill="none"
            stroke="var(--color-sky)"
            strokeWidth="3"
            strokeDasharray="10 8"
          />
        </svg>

        <span className="selfie__viewfinder">
          {checking && <img className="selfie__preview selfie__preview--checking" src={checking} alt="" />}
          {selfie ? (
            <img className="selfie__preview" src={selfie} alt="Your selfie" />
          ) : cameraActive ? (
            <>
              <span className="selfie__live-badge">
                <span className="selfie__live-dot" /> LIVE
              </span>
              <video ref={videoRef} autoPlay playsInline muted className="selfie__live-video" />
            </>
          ) : (
            <img src={iconScanFace} alt="" width={84} height={84} />
          )}
        </span>

        <span className="selfie__hint">
          {selfie
            ? 'Looking good!'
            : checking
              ? 'Checking it’s just you…'
              : cameraActive
                ? 'Look straight & tap Snap'
                : 'Just you · good light'}
        </span>
      </div>

      {photoError && (
        <p className="selfie__error" role="alert">
          {photoError}
        </p>
      )}
      {cameraError && !photoError && !selfie && <p className="selfie__note">{cameraError}</p>}

      <section className="selfie__privacy">
        <h2>
          <img src={iconShield} alt="" width={18} height={18} />
          Your face, your call
        </h2>
        <ul>
          {PRIVACY_POINTS.map((point) => (
            <li key={point}>
              <img src={iconCheck} alt="" width={14} height={14} />
              {point}
            </li>
          ))}
        </ul>
      </section>
    </OnboardingLayout>
  )
}
