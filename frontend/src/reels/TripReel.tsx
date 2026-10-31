import type { CSSProperties } from 'react'
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { linearTiming, TransitionSeries, type TransitionPresentation } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { wipe } from '@remotion/transitions/wipe'
import { PEOPLE } from '../data/people'
import { REEL_MASCOT } from './assets'
import { reelTimeline } from './timeline'
import type { ReelMotion, ReelPhoto, ReelPlan, ReelScene, ReelStyle, ReelTransition, TripReelProps } from './types'

// The reel composition: title card, one template scene per planned shot, end card.
// Rendered by @remotion/player in the app and by @remotion/web-renderer for the MP4, which draws a subset of CSS:
// no z-index (later siblings paint on top), no radial gradients, no 3D perspective, no object-position.

const FONT = 'Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const HAND = '"Marker Felt", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive'

const BACKGROUND: Record<ReelStyle, string> = {
  highlights: 'var(--color-ink)',
  cinematic: '#000',
  diary: 'var(--color-bg)',
  spotlight: 'var(--color-ink)',
  scrapbook: '#fff4d6',
}

export function TripReel({ plan, photos }: TripReelProps) {
  const timeline = reelTimeline(plan)
  const first = photos[plan.scenes[0]?.photoId]

  const items = [
    <TransitionSeries.Sequence key="intro" durationInFrames={timeline.intro}>
      <TitleCard plan={plan} photo={first} />
    </TransitionSeries.Sequence>,
  ]
  plan.scenes.forEach((_, i) => {
    const into = timeline.transitions[i]
    if (into.frames > 0) {
      items.push(
        <TransitionSeries.Transition
          key={`t${i}`}
          presentation={presentation(into.kind, i)}
          timing={linearTiming({ durationInFrames: into.frames })}
        />,
      )
    }
    items.push(
      <TransitionSeries.Sequence key={`s${i}`} durationInFrames={timeline.scenes[i]}>
        <Scene plan={plan} photos={photos} index={i} frames={timeline.scenes[i]} />
      </TransitionSeries.Sequence>,
    )
  })
  items.push(
    <TransitionSeries.Transition
      key="t-outro"
      presentation={fade()}
      timing={linearTiming({ durationInFrames: timeline.outroIn })}
    />,
    <TransitionSeries.Sequence key="outro" durationInFrames={timeline.outro}>
      <EndCard plan={plan} />
    </TransitionSeries.Sequence>,
  )

  return (
    <AbsoluteFill style={{ background: BACKGROUND[plan.style], fontFamily: FONT, overflow: 'hidden' }}>
      <TransitionSeries>{items}</TransitionSeries>
    </AbsoluteFill>
  )
}

function presentation(kind: ReelTransition, i: number) {
  const p =
    kind === 'slide'
      ? slide({ direction: i % 2 ? 'from-bottom' : 'from-right' })
      : kind === 'wipe'
        ? wipe({ direction: i % 2 ? 'from-top-left' : 'from-left' })
        : fade()
  return p as TransitionPresentation<Record<string, unknown>>
}

type SceneProps = { plan: ReelPlan; photos: Record<string, ReelPhoto>; index: number; frames: number }

function Scene(props: SceneProps) {
  switch (props.plan.style) {
    case 'cinematic':
      return <CinematicScene {...props} />
    case 'diary':
      return <DiaryScene {...props} />
    case 'spotlight':
      return <SpotlightScene {...props} />
    case 'scrapbook':
      return <ScrapbookScene {...props} />
    default:
      return <HighlightsScene {...props} />
  }
}

// --- Shared pieces ------------------------------------------------------------------------------

/** Ken Burns move across the shot; strength scales how far it travels */
function motionTransform(motion: ReelMotion, progress: number, strength: number): string {
  const k = strength
  switch (motion) {
    case 'zoom-out':
      return `scale(${1.05 + 0.15 * k * (1 - progress)})`
    case 'pan-left':
      return `scale(${1.08 + 0.12 * k}) translateX(${(4 - 8 * progress) * k}%)`
    case 'pan-right':
      return `scale(${1.08 + 0.12 * k}) translateX(${(-4 + 8 * progress) * k}%)`
    case 'drift':
      return `scale(${1.08 + 0.06 * k * progress}) translate(${(-2 + 4 * progress) * k}%, ${(2 - 4 * progress) * k}%)`
    default:
      return `scale(${1.05 + 0.15 * k * progress})`
  }
}

function MovingPhoto({
  photo,
  scene,
  frames,
  strength = 1,
  style,
}: {
  photo: ReelPhoto
  scene: ReelScene
  frames: number
  strength?: number
  style?: CSSProperties
}) {
  const frame = useCurrentFrame()
  const progress = interpolate(frame, [0, frames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ overflow: 'hidden', ...style }}>
      <Img
        src={photo.src}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: motionTransform(scene.motion, progress, strength) }}
      />
    </AbsoluteFill>
  )
}

/** 0 → 1 spring starting at `delay` frames */
function useEnter(delay = 0, damping = 14) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - delay, fps, config: { damping } })
}

/** Fades captions in after the cut and out before the next one */
function useCaptionOpacity(frames: number) {
  const frame = useCurrentFrame()
  return interpolate(frame, [4, 12, frames - 8, frames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
}

const shade = (from: number, to: number) =>
  `linear-gradient(180deg, rgba(11,23,71,${from}) 0%, rgba(11,23,71,0) 25%, rgba(11,23,71,0) 55%, rgba(11,23,71,${to}) 100%)`

// --- Templates ----------------------------------------------------------------------------------

/** Highlights: punchy zooms, a flash on every cut, story-style progress ticks and a tilted yellow caption */
function HighlightsScene({ plan, photos, index, frames }: SceneProps) {
  const frame = useCurrentFrame()
  const scene = plan.scenes[index]
  const enter = useEnter(2, 12)
  const flash = scene.transition === 'cut' ? interpolate(frame, [0, 5], [0.7, 0], { extrapolateRight: 'clamp' }) : 0
  return (
    <AbsoluteFill>
      <MovingPhoto photo={photos[scene.photoId]} scene={scene} frames={frames} strength={1.6} />
      <AbsoluteFill style={{ background: shade(0.45, 0.65) }} />
      <div style={{ position: 'absolute', top: 72, left: 48, right: 48, display: 'flex', gap: 8 }}>
        {plan.scenes.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: i < index ? '100%' : i === index ? `${(100 * frame) / frames}%` : '0%',
                background: i === index ? 'var(--color-yellow)' : '#fff',
              }}
            />
          </div>
        ))}
      </div>
      {scene.caption && (
        <div
          style={{
            position: 'absolute',
            left: 64,
            right: 64,
            bottom: 300,
            display: 'flex',
            transform: `translateX(${(1 - enter) * -700}px) rotate(-3deg)`,
          }}
        >
          <span
            style={{
              padding: '10px 28px',
              background: 'var(--color-yellow)',
              color: 'var(--color-ink)',
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 1.15,
              textTransform: 'uppercase',
            }}
          >
            {scene.caption}
          </span>
        </div>
      )}
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
    </AbsoluteFill>
  )
}

/** Cinematic: slow moves, a warm grade, letterbox bars and spaced-out captions in the bottom bar */
function CinematicScene({ plan, photos, index, frames }: SceneProps) {
  const scene = plan.scenes[index]
  const opacity = useCaptionOpacity(frames)
  const bar: CSSProperties = { position: 'absolute', left: 0, right: 0, height: 300, background: '#000' }
  return (
    <AbsoluteFill>
      <MovingPhoto
        photo={photos[scene.photoId]}
        scene={scene}
        frames={frames}
        strength={0.6}
        style={{ filter: 'saturate(1.15) contrast(1.05) sepia(0.15)' }}
      />
      <div style={{ ...bar, top: 0 }} />
      <div style={{ ...bar, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 80px' }}>
        <p
          style={{
            margin: 0,
            opacity,
            color: '#fff',
            fontSize: 42,
            fontWeight: 600,
            letterSpacing: 12,
            textAlign: 'center',
            textTransform: 'uppercase',
          }}
        >
          {scene.caption}
        </p>
      </div>
      <p
        style={{
          position: 'absolute',
          top: 200,
          right: 64,
          margin: 0,
          opacity: opacity * 0.6,
          color: '#fff',
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: 8,
        }}
      >
        {String(index + 1).padStart(2, '0')} / {String(plan.scenes.length).padStart(2, '0')}
      </p>
    </AbsoluteFill>
  )
}

/** Day by day: a photo card on the app's pale blue, with the day and time it was taken and a journey bar */
function DiaryScene({ plan, photos, index, frames }: SceneProps) {
  const scene = plan.scenes[index]
  const photo = photos[scene.photoId]
  const enter = useEnter(0, 16)
  const opacity = useCaptionOpacity(frames)
  const [day, time] = photo.time.split('·').map((s) => s.trim())
  return (
    <AbsoluteFill style={{ background: 'var(--color-bg)' }}>
      <div style={{ position: 'absolute', top: 150, left: 90, right: 90, display: 'flex', alignItems: 'center', gap: 20 }}>
        <span
          style={{
            padding: '12px 32px',
            borderRadius: 999,
            background: 'var(--color-primary)',
            color: '#fff',
            fontSize: 40,
            fontWeight: 800,
          }}
        >
          {day || `Stop ${index + 1}`}
        </span>
        {time && <span style={{ color: 'var(--color-sky)', fontSize: 40, fontWeight: 700 }}>{time}</span>}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 290,
          left: 90,
          width: 900,
          height: 1150,
          padding: 24,
          borderRadius: 56,
          background: '#fff',
          boxShadow: '0 30px 60px rgba(7, 42, 200, 0.18)',
          transform: `translateY(${(1 - enter) * 120}px) rotate(${index % 2 ? 1.5 : -1.5}deg)`,
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 40, overflow: 'hidden' }}>
          <MovingPhoto photo={photo} scene={scene} frames={frames} strength={0.7} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 1500, left: 90, right: 90, opacity }}>
        <p style={{ margin: 0, color: 'var(--color-ink)', fontSize: 68, fontWeight: 800, lineHeight: 1.2 }}>{scene.caption}</p>
        {photo.caption && photo.caption !== scene.caption && (
          <p style={{ margin: '12px 0 0', color: 'var(--color-muted)', fontSize: 40, fontWeight: 600 }}>at {photo.caption}</p>
        )}
      </div>
      <div style={{ position: 'absolute', bottom: 110, left: 90, right: 90, display: 'flex', gap: 12, alignItems: 'center' }}>
        {plan.scenes.map((_, i) => (
          <div
            key={i}
            style={{
              flex: i === index ? 4 : 1,
              height: 14,
              borderRadius: 7,
              background: i <= index ? 'var(--color-primary)' : 'var(--color-sky-light)',
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  )
}

/** Spotlight: "Starring" title and colour-coded name tags for everyone in the shot */
function SpotlightScene({ plan, photos, index, frames }: SceneProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const scene = plan.scenes[index]
  const photo = photos[scene.photoId]
  const opacity = useCaptionOpacity(frames)
  const star = plan.starring?.toLowerCase()
  const people = [...photo.people].sort((a, b) => Number(PEOPLE[b].name.toLowerCase() === star) - Number(PEOPLE[a].name.toLowerCase() === star))
  return (
    <AbsoluteFill>
      <MovingPhoto photo={photo} scene={scene} frames={frames} />
      <AbsoluteFill style={{ background: shade(0.6, 0.85) }} />
      <div style={{ position: 'absolute', top: 120, left: 72, right: 72 }}>
        <p style={{ margin: 0, color: 'var(--color-yellow)', fontSize: 34, fontWeight: 800, letterSpacing: 10 }}>STARRING</p>
        <p style={{ margin: 0, color: '#fff', fontSize: 120, fontWeight: 800, lineHeight: 1.1 }}>{plan.starring ?? 'The squad'}</p>
      </div>
      {scene.caption && (
        <p
          style={{
            position: 'absolute',
            left: 72,
            right: 72,
            bottom: 330,
            margin: 0,
            opacity,
            color: '#fff',
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.2,
          }}
        >
          {scene.caption}
        </p>
      )}
      <div style={{ position: 'absolute', left: 72, right: 72, bottom: 190, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {people.map((id, i) => {
          const isStar = PEOPLE[id].name.toLowerCase() === star
          const pop = spring({ frame: frame - 6 - i * 4, fps, config: { damping: 12 } })
          return (
            <span
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 28px 12px 16px',
                borderRadius: 999,
                background: isStar ? 'var(--color-yellow)' : 'rgba(11, 23, 71, 0.72)',
                color: isStar ? 'var(--color-ink)' : '#fff',
                fontSize: 38,
                fontWeight: 700,
                transform: `scale(${pop})`,
              }}
            >
              <span style={{ width: 36, height: 36, borderRadius: 18, background: PEOPLE[id].color }} />
              {PEOPLE[id].name}
            </span>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

/** Deterministic tilt and offset per scene, so polaroids land in the same place on every render */
const polaroidPose = (i: number) => ({ rotate: ((i * 37) % 15) - 7, x: ((i * 53) % 120) - 60, y: ((i * 29) % 100) - 50 })

/** Scrapbook: each photo drops onto the page as a polaroid on top of the last two */
function ScrapbookScene({ plan, photos, index, frames }: SceneProps) {
  const drop = useEnter(0, 15)
  const opacity = useCaptionOpacity(frames)
  const scene = plan.scenes[index]
  const start = Math.max(0, index - 2)
  const earlier = plan.scenes.slice(start, index).map((s, j) => ({ scene: s, at: start + j }))
  const pose = polaroidPose(index)
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #fff4d6 0%, #ffe8b0 100%)' }}>
      {earlier.map(({ scene: s, at }) => {
        const p = polaroidPose(at)
        return (
          <Polaroid
            key={at}
            photo={photos[s.photoId]}
            scene={s}
            frames={frames}
            caption={s.caption}
            strength={0}
            style={{ transform: `translate(${p.x}px, ${p.y}px) rotate(${p.rotate}deg)` }}
          />
        )
      })}
      <Polaroid
        photo={photos[scene.photoId]}
        scene={scene}
        frames={frames}
        caption={scene.caption}
        captionOpacity={opacity}
        style={{
          transform: `translate(${pose.x}px, ${pose.y + (1 - drop) * -1700}px) rotate(${pose.rotate + (1 - drop) * 25}deg)`,
        }}
      />
    </AbsoluteFill>
  )
}

function Polaroid({
  photo,
  scene,
  frames,
  caption,
  captionOpacity = 1,
  strength = 0.4,
  style,
}: {
  photo: ReelPhoto
  scene: ReelScene
  frames: number
  caption: string
  captionOpacity?: number
  /** 0 holds the photo still, for polaroids already on the page */
  strength?: number
  style: CSSProperties
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 130,
        top: 420,
        width: 820,
        padding: '36px 36px 0',
        background: '#fff',
        boxShadow: '0 24px 50px rgba(11, 23, 71, 0.25)',
        ...style,
      }}
    >
      <div style={{ position: 'relative', width: 748, height: 748, overflow: 'hidden' }}>
        <MovingPhoto photo={photo} scene={scene} frames={frames} strength={strength} />
      </div>
      <p
        style={{
          height: 170,
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: captionOpacity,
          color: 'var(--color-ink)',
          fontFamily: HAND,
          fontSize: 60,
          textAlign: 'center',
        }}
      >
        {caption}
      </p>
      <div
        style={{
          position: 'absolute',
          top: -30,
          left: 300,
          width: 220,
          height: 64,
          background: 'rgba(252, 243, 0, 0.7)',
          transform: 'rotate(-4deg)',
        }}
      />
    </div>
  )
}

// --- Title and end cards ------------------------------------------------------------------------

function TitleCard({ plan, photo }: { plan: ReelPlan; photo: ReelPhoto | undefined }) {
  // Visible from frame 0, so the paused player shows the title as its poster
  const enter = useEnter(0, 12)
  const light = plan.style === 'diary' || plan.style === 'scrapbook'
  const cinematic = plan.style === 'cinematic'
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 80 }}>
      {photo && !light && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Img
            src={photo.src}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scale(1.2)',
              filter: `blur(24px) brightness(${cinematic ? 0.35 : 0.55})`,
            }}
          />
        </AbsoluteFill>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 28,
          textAlign: 'center',
          transform: `scale(${0.85 + 0.15 * enter})`,
        }}
      >
        <p
          style={{
            margin: 0,
            color: light ? 'var(--color-primary)' : 'var(--color-yellow)',
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: 10,
          }}
        >
          GHOOMATES REEL
        </p>
        <h1
          style={{
            margin: 0,
            padding: plan.style === 'highlights' ? '8px 32px' : 0,
            background: plan.style === 'highlights' ? 'var(--color-yellow)' : 'transparent',
            color: plan.style === 'highlights' || light ? 'var(--color-ink)' : '#fff',
            fontFamily: plan.style === 'scrapbook' ? HAND : FONT,
            fontSize: cinematic ? 84 : 112,
            fontWeight: cinematic ? 600 : 800,
            letterSpacing: cinematic ? 10 : 0,
            lineHeight: 1.1,
            textTransform: cinematic || plan.style === 'highlights' ? 'uppercase' : 'none',
          }}
        >
          {plan.title}
        </h1>
        {plan.subtitle && (
          <p style={{ margin: 0, color: light ? 'var(--color-muted)' : 'rgba(255,255,255,0.85)', fontSize: 44, fontWeight: 600 }}>
            {plan.subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  )
}

function EndCard({ plan }: { plan: ReelPlan }) {
  const frame = useCurrentFrame()
  const enter = useEnter(0, 10)
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        padding: 80,
        background: 'linear-gradient(152deg, var(--color-primary) 8%, var(--color-primary-bright) 92%)',
        textAlign: 'center',
      }}
    >
      <Img
        src={REEL_MASCOT}
        style={{ width: 360, height: 360, objectFit: 'contain', transform: `translateY(${Math.sin(frame / 6) * 14}px) scale(${enter})` }}
      />
      {plan.outro && <p style={{ margin: 0, color: '#fff', fontSize: 72, fontWeight: 800, lineHeight: 1.2 }}>{plan.outro}</p>}
      <p style={{ margin: 0, color: 'var(--color-yellow)', fontSize: 36, fontWeight: 800, letterSpacing: 6 }}>MADE WITH GHOOMMATE</p>
    </AbsoluteFill>
  )
}
