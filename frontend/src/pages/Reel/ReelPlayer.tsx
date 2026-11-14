import { Player } from '@remotion/player'
import type { Reel } from '../../services/reelsService'
import { ReelComposition } from './ReelComposition'
import { REEL_FPS, REEL_HEIGHT, REEL_WIDTH, reelDurationInFrames } from './reelTiming'

type ReelPlayerProps = { reel: Reel; tripName: string }

/**
 * The in-app reel preview. Remotion and the reel fonts are big, so ReelResultPage loads this module (and them) only
 * when it shows a reel.
 */
export default function ReelPlayer({ reel, tripName }: ReelPlayerProps) {
  return (
    <Player
      component={ReelComposition}
      inputProps={{ plan: reel.plan, tripName }}
      durationInFrames={reelDurationInFrames(reel.plan)}
      compositionWidth={REEL_WIDTH}
      compositionHeight={REEL_HEIGHT}
      fps={REEL_FPS}
      style={{ width: '100%', height: '100%' }}
      controls
      loop
      autoPlay
      initiallyMuted
      clickToPlay
      acknowledgeRemotionLicense
    />
  )
}
