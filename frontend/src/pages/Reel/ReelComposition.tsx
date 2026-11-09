import { Fragment } from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { clockWipe } from '@remotion/transitions/clock-wipe'
import { fade } from '@remotion/transitions/fade'
import { flip } from '@remotion/transitions/flip'
import { iris } from '@remotion/transitions/iris'
import { pushCut } from '@remotion/transitions/push-cut'
import { slide } from '@remotion/transitions/slide'
import { wipe } from '@remotion/transitions/wipe'
import { fitTextOnNLines } from '@remotion/layout-utils'
import { evolvePath } from '@remotion/paths'
import type { ReelPlan, ReelScene, ReelStyle, ReelTransition } from '../../services/reelsService'
import { INK, lookOf, type Look } from './looks'
import type { MapTiles } from './mapMath'
import { END_FRAMES, REEL_FPS, REEL_HEIGHT, REEL_WIDTH, TITLE_FRAMES, TRANSITION_FRAMES, sceneFrames, type ReelProps } from './reelTiming'
import { CollageScene } from './scenes/CollageScene'
import { MapScene } from './scenes/MapScene'
import { EffectLayer, FloatingHearts, Photo } from './scenes/Overlays'
import { PhotoScene } from './scenes/PhotoScene'
import { StatsScene } from './scenes/StatsScene'
import { TextScene } from './scenes/TextScene'

/**
 * The reel as a Remotion composition: a title card, then the scenes the model wrote (backend/src/reels/plan.ts) — photos,
 * collages, an animated map, trip stats and kinetic text, with stickers and effects — and an end card. The same component
 * plays in the Player and renders the MP4.
 */

const timing = linearTiming({ durationInFrames: TRANSITION_FRAMES })

// Returns the element itself (not a component), since TransitionSeries reads its direct children
function transitionInto(transition: Exclude<ReelTransition, 'cut'>, index: number) {
  const sides = ['from-right', 'from-left', 'from-bottom'] as const
  const size = { width: REEL_WIDTH, height: REEL_HEIGHT }
  switch (transition) {
    case 'slide':
      return <TransitionSeries.Transition presentation={slide({ direction: sides[index % sides.length] })} timing={timing} />
    case 'wipe':
      return <TransitionSeries.Transition presentation={wipe({ direction: index % 2 ? 'from-top-left' : 'from-bottom-right' })} timing={timing} />
    case 'flip':
      return <TransitionSeries.Transition presentation={flip({ direction: index % 2 ? 'from-left' : 'from-right' })} timing={timing} />
    case 'clock-wipe':
      return <TransitionSeries.Transition presentation={clockWipe(size)} timing={timing} />
    case 'iris':
      return <TransitionSeries.Transition presentation={iris(size)} timing={timing} />
    case 'push':
      return <TransitionSeries.Transition presentation={pushCut({ flashColor: '#fff', flashOpacity: 0.6 })} timing={timing} />
    default:
      return <TransitionSeries.Transition presentation={fade()} timing={timing} />
  }
}

type SceneProps = { scene: ReelScene; plan: ReelPlan; look: Look; backdrop?: string; forExport?: boolean; mapTiles: MapTiles }

function Scene({ scene, plan, look, backdrop, forExport, mapTiles }: SceneProps) {
  switch (scene.kind) {
    case 'collage':
      return <CollageScene scene={scene} style={plan.style} look={look} forExport={forExport} />
    case 'map':
      return <MapScene scene={scene} look={look} mapTiles={mapTiles} />
    case 'stats':
      return <StatsScene scene={scene} facts={plan.facts ?? []} look={look} />
    case 'text':
      return <TextScene scene={scene} look={look} backdrop={backdrop} forExport={forExport} />
    default:
      return <PhotoScene scene={scene} style={plan.style} look={look} forExport={forExport} />
  }
}

export function ReelComposition({ plan, tripName, forExport, mapTiles = 'esri' }: ReelProps) {
  const look = lookOf(plan.style)
  const cover = plan.scenes.find((s) => s.photos.length)?.photos[0].url
  // Text cards sit over a blurred copy of the nearest photo before them
  const backdrops = plan.scenes.reduce<(string | undefined)[]>((list, _scene, i) => [...list, i ? (plan.scenes[i - 1].photos[0]?.url ?? list[i - 1]) : cover], [])

  return (
    <AbsoluteFill style={{ background: INK, fontFamily: look.body }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={TITLE_FRAMES}>
          <TitleCard title={plan.title} tripName={tripName} cover={cover} look={look} forExport={forExport} />
        </TransitionSeries.Sequence>
        {plan.scenes.map((scene, i) => (
          <Fragment key={`${scene.kind}-${i}`}>
            {i === 0 ? transitionInto('fade', i) : scene.transition !== 'cut' && transitionInto(scene.transition, i)}
            <TransitionSeries.Sequence durationInFrames={sceneFrames(scene.seconds)} premountFor={REEL_FPS}>
              <Scene scene={scene} plan={plan} look={look} backdrop={backdrops[i]} forExport={forExport} mapTiles={mapTiles} />
            </TransitionSeries.Sequence>
          </Fragment>
        ))}
        {transitionInto('fade', 0)}
        <TransitionSeries.Sequence durationInFrames={END_FRAMES} premountFor={REEL_FPS}>
          <EndCard tagline={plan.tagline} tripName={tripName} style={plan.style} look={look} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  )
}

const SWOOSH = 'M 0 30 C 140 -6, 300 60, 460 20'

function TitleCard({ title, tripName, cover, look, forExport }: { title: string; tripName: string; cover?: string; look: Look; forExport?: boolean }) {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const rise = spring({ frame: frame - 6, fps, config: { damping: 14 } })
  const fitted = fitTextOnNLines({ text: look.shout ? title.toUpperCase() : title, maxLines: 3, maxBoxWidth: width - 128, fontFamily: look.display, fontWeight: look.displayWeight, maxFontSize: 96 })
  const swoosh = evolvePath(interpolate(frame, [18, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), SWOOSH)
  return (
    <AbsoluteFill style={{ background: look.background, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {cover && <Photo src={cover} look={look} style={{ filter: `${look.grade} blur(14px) brightness(0.6)`, transform: `scale(${interpolate(frame, [0, TITLE_FRAMES], [1.25, 1.15])})` }} forExport={forExport} />}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, padding: '0 64px', opacity: rise, transform: `translateY(${interpolate(rise, [0, 1], [60, 0])}px)` }}>
        {tripName && (
          <span style={{ padding: '8px 22px', borderRadius: 999, background: look.accent, color: look.onAccent, fontFamily: look.body, fontSize: 24, lineHeight: '34px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2 }}>
            {tripName}
          </span>
        )}
        <h1 style={{ margin: 0, color: '#fff', fontFamily: look.display, fontWeight: look.displayWeight, fontSize: fitted.fontSize, lineHeight: 1.15, textAlign: 'center', textShadow: '0 6px 30px rgba(11, 23, 71, 0.6)' }}>
          {fitted.lines.map((l, i) => (
            <span key={i} style={{ display: 'block' }}>{l}</span>
          ))}
        </h1>
        <svg width={460} height={60} viewBox="0 0 460 60">
          <path d={SWOOSH} fill="none" stroke={look.accent} strokeWidth={9} strokeLinecap="round" strokeDasharray={swoosh.strokeDasharray} strokeDashoffset={swoosh.strokeDashoffset} />
        </svg>
      </div>
    </AbsoluteFill>
  )
}

function EndCard({ tagline, tripName, style, look }: { tagline: string; tripName: string; style: ReelStyle; look: Look }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const rise = spring({ frame: frame - 4, fps, config: { damping: 14 } })
  const brand = spring({ frame: frame - 22, fps, config: { damping: 16 } })
  return (
    <AbsoluteFill style={{ background: look.background, alignItems: 'center', justifyContent: 'center', gap: 40, padding: '0 64px' }}>
      {style === 'playful' || style === 'dreamy' ? <FloatingHearts /> : <EffectLayer effect={style === 'energetic' ? 'confetti' : style === 'retro' ? 'grain' : 'sparkle'} />}
      <p style={{ position: 'relative', margin: 0, color: '#fff', fontFamily: look.display, fontWeight: look.displayWeight, fontSize: 64, lineHeight: '82px', textAlign: 'center', textTransform: look.shout ? 'uppercase' : 'none', opacity: rise, transform: `scale(${interpolate(rise, [0, 1], [0.85, 1])})` }}>{tagline}</p>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: brand }}>
        <span style={{ color: look.accent, fontFamily: look.body, fontSize: 40, lineHeight: '52px', fontWeight: 800 }}>GhoomMates</span>
        <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontFamily: look.body, fontSize: 24, lineHeight: '34px', fontWeight: 600 }}>{tripName ? `${tripName} · cut by GhoomMate` : 'Cut by GhoomMate'}</span>
      </div>
    </AbsoluteFill>
  )
}
