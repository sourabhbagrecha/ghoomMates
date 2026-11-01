import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { evolvePath, getLength, getPointAtLength, getTangentAtLength } from '@remotion/paths'
import { Circle } from '@remotion/shapes'
import type { ReelScene } from '../../../services/reelsService'
import { INK, type Look } from '../looks'
import { LAYER_FADE, MAP_CREDIT, mapFilter, mapLayers, mapView, project, type MapTiles } from '../mapMath'
import { EffectLayer, Stickers, Watermark } from './Overlays'

type Props = { scene: ReelScene; look: Look; mapTiles: MapTiles }

// The camera flies in over this share of the scene, then pins drop and the route draws
const FLIGHT = 0.5
// Room a pin label takes, for keeping close labels apart
const LABEL_WIDTH = 260
const LABEL_ROW = 48

/**
 * An animated map: the camera flies from region level down to the trip's places over real map tiles, pins drop in route
 * order, the route draws itself with a plane flying along it, and each place gets its label.
 */
export function MapScene({ scene, look, mapTiles }: Props) {
  const frame = useCurrentFrame()
  const { fps, width, height, durationInFrames } = useVideoConfig()
  const places = scene.places ?? []
  if (!places.length) return <AbsoluteFill style={{ background: look.background }} />

  const { centre, near, levels } = mapView(places, width, height)
  const arrive = Math.round(durationInFrames * FLIGHT)
  const camera = interpolate(frame, [0, arrive, durationInFrames], [levels[0], near, near + 0.15], {
    easing: Easing.bezier(0.65, 0, 0.35, 1),
    extrapolateRight: 'clamp',
  })

  // Pins in frame pixels at the camera's zoom right now
  const scaleNow = 2 ** (camera - near)
  const mid = project(centre.lat, centre.lng, near)
  const pins = places.map((p) => {
    const at = project(p.lat, p.lng, near)
    return { ...p, x: width / 2 + (at.x - mid.x) * scaleNow, y: height / 2 + (at.y - mid.y) * scaleNow }
  })
  // Neighbouring landmarks can sit metres apart: a label that would land on an earlier one moves down a row
  const labelRow = pins.map((pin, i) => pins.slice(0, i).filter((o) => Math.abs(o.x - pin.x) < LABEL_WIDTH && Math.abs(o.y - pin.y) < LABEL_ROW).length)
  // Pins on the right half get their label on their left, so it stays in the frame
  const labelLeft = pins.map((pin) => pin.x > width * 0.55)

  // The route: gentle arcs between pins, drawn after the camera lands
  const route = pins.slice(1).reduce((d, p, i) => {
    const prev = pins[i]
    const cx = (prev.x + p.x) / 2 - (p.y - prev.y) * 0.25
    const cy = (prev.y + p.y) / 2 + (p.x - prev.x) * 0.25
    return `${d} Q ${cx} ${cy} ${p.x} ${p.y}`
  }, pins.length ? `M ${pins[0].x} ${pins[0].y}` : '')
  const drawn = interpolate(frame, [arrive + 8, arrive + 8 + places.length * 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) })
  const hasRoute = pins.length > 1
  const evolved = hasRoute ? evolvePath(drawn, route) : null
  const length = hasRoute ? getLength(route) : 0
  const plane = hasRoute && drawn > 0 && drawn < 1 ? getPointAtLength(route, length * drawn) : null
  const heading = plane ? getTangentAtLength(route, length * drawn) : null

  const title = scene.caption || places[0].name
  const titleIn = spring({ frame: frame - 6, fps, config: { damping: 14 } })

  return (
    <AbsoluteFill style={{ background: '#a9c8e8', overflow: 'hidden' }}>
      {mapLayers(look.map, mapTiles, places, width, height).map(({ z, tiles }, i) => {
        const scale = 2 ** (camera - z)
        const opacity = i === 0 ? 1 : interpolate(camera, [z - LAYER_FADE, z], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return (
          <AbsoluteFill key={z} style={{ opacity, transform: `scale(${scale})`, transformOrigin: `${width / 2}px ${height / 2}px`, filter: mapFilter(look.map, mapTiles) }}>
            {tiles.map((t) => (
              <Img
                key={t.key}
                src={t.url}
                crossOrigin="anonymous"
                maxRetries={2}
                onError={() => undefined}
                style={{ position: 'absolute', left: t.left, top: t.top, width: 257, height: 257, maxWidth: 'none' }}
              />
            ))}
          </AbsoluteFill>
        )
      })}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(11, 23, 71, 0.45) 100%)' }} />

      {evolved && (
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          <path d={route} fill="none" stroke="rgba(11, 23, 71, 0.35)" strokeWidth={14} strokeLinecap="round" strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} />
          <path d={route} fill="none" stroke={look.accent} strokeWidth={8} strokeLinecap="round" strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} />
        </svg>
      )}
      {plane && heading && (
        <span style={{ position: 'absolute', left: plane.x - 34, top: plane.y - 40, fontSize: 64, lineHeight: '80px', transform: `rotate(${(Math.atan2(heading.y, heading.x) * 180) / Math.PI + 45}deg)` }}>✈️</span>
      )}

      {pins.map((pin, i) => {
        const start = arrive + i * 14
        const drop = spring({ frame: frame - start, fps, config: { damping: 10, stiffness: 150 } })
        const label = spring({ frame: frame - start - 6, fps, config: { damping: 14 } })
        const pulse = ((frame - start) % 40) / 40
        return (
          <div key={pin.name + i} style={{ position: 'absolute', left: pin.x, top: pin.y }}>
            {places.length === 1 && frame > start && (
              <div style={{ position: 'absolute', left: -90, top: -90, width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.3 + pulse})`, opacity: 1 - pulse }}>
                <Circle radius={90} fill="none" stroke={look.accent} strokeWidth={6} />
              </div>
            )}
            {/* A teardrop pin with its point on the place */}
            <div style={{ position: 'absolute', left: -26, top: -68, width: 52, height: 52, borderRadius: '50% 50% 50% 0', background: look.accent, border: '5px solid #fff', boxShadow: '0 8px 16px rgba(0, 0, 0, 0.35)', transform: `translateY(${interpolate(drop, [0, 1], [-200, 0])}px) rotate(-45deg) scale(${drop})` }}>
              <div style={{ position: 'absolute', left: 13, top: 13, width: 16, height: 16, borderRadius: '50%', background: look.onAccent }} />
            </div>
            <div style={{ position: 'absolute', ...(labelLeft[i] ? { right: 36 } : { left: 36 }), top: -64 + labelRow[i] * LABEL_ROW, padding: '6px 16px', borderRadius: 999, background: '#fff', color: INK, fontFamily: look.body, fontWeight: 700, fontSize: 26, lineHeight: '34px', whiteSpace: 'nowrap', boxShadow: '0 6px 14px rgba(0, 0, 0, 0.25)', opacity: label, transform: `translateX(${interpolate(label, [0, 1], [labelLeft[i] ? 20 : -20, 0])}px)` }}>
              {pin.name}
            </div>
          </div>
        )
      })}

      <div style={{ position: 'absolute', left: 48, right: 48, top: 200, display: 'flex', justifyContent: 'center', opacity: titleIn, transform: `translateY(${interpolate(titleIn, [0, 1], [-40, 0])}px)` }}>
        <span style={{ padding: '14px 32px', borderRadius: 24, background: look.accent, color: look.onAccent, fontFamily: look.display, fontWeight: look.displayWeight, fontSize: 52, lineHeight: '66px', textAlign: 'center', boxShadow: '0 12px 24px rgba(0, 0, 0, 0.3)', textTransform: look.shout ? 'uppercase' : 'none' }}>
          📍 {title}
        </span>
      </div>
      <EffectLayer effect={scene.effect} />
      <Stickers emoji={scene.stickers} spots="corners" />
      <Watermark />
      <span style={{ position: 'absolute', right: 16, bottom: 12, padding: '2px 8px', borderRadius: 6, background: 'rgba(255, 255, 255, 0.75)', color: '#333', fontSize: 14, lineHeight: '20px' }}>
        {MAP_CREDIT[mapTiles]}
      </span>
    </AbsoluteFill>
  )
}
