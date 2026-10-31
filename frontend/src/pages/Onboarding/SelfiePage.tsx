import { useEffect, useRef, useState } from 'react'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconScanFace from '../../assets/figma/icon-scan-face-primary.svg'
import iconShield from '../../assets/figma/icon-shield-primary.svg'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  // Start the live front camera stream
  const startCamera = async () => {
    try {
      setCameraError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
      setCameraActive(true)
    } catch (err: any) {
      console.warn('Camera access could not be started:', err)
      setCameraActive(false)
      setCameraError('Camera access not available. You can upload a photo instead.')
    }
  }

  // Stop camera tracks
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  // Trigger live camera when on this screen without an existing selfie
  useEffect(() => {
    let canceled = false
    if (!selfie) {
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
          if (videoRef.current) {
            videoRef.current.srcObject = stream
            videoRef.current.play().catch(() => {})
          }
          setCameraActive(true)
        })
        .catch((err) => {
          if (canceled) return
          console.warn('Camera access could not be started:', err)
          setCameraActive(false)
          setCameraError('Camera access not available. You can take a photo or upload instead.')
        })
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }

    return () => {
      canceled = true
      stopCamera()
    }
  }, [selfie])

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

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
      stopCamera()
      onSelfie(dataUrl)
    }
  }

  const handleRetake = () => {
    onSelfie('')
    startCamera()
  }

  return (
    <OnboardingLayout
      eyebrow="Step 2 of 3 · Live Selfie"
      title="Take a live selfie"
      subtitle={
        userName
          ? `Welcome ${userName}! Smile for the camera so your squad and GhoomMate can recognize you.`
          : 'Smile for the camera so your squad and GhoomMate can recognize you.'
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
            <LinkButton onClick={handleRetake}>Retake live selfie</LinkButton>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={cameraActive ? capturePhoto : () => fileInput.current?.click()}>
              {cameraActive ? 'Snap live selfie' : 'Take photo / upload'}
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
          const file = e.target.files?.[0]
          if (file) {
            const reader = new FileReader()
            reader.onload = (evt) => {
              if (evt.target?.result) {
                stopCamera()
                onSelfie(evt.target.result as string)
              }
            }
            reader.readAsDataURL(file)
          }
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
          {selfie ? 'Looking good!' : cameraActive ? 'Look straight & tap Snap' : 'Look straight · good light'}
        </span>
      </div>

      {cameraError && (
        <p style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', maxWidth: 280 }}>
          {cameraError}
        </p>
      )}

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
