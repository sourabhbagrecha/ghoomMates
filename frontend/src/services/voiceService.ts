import type { VoiceSession } from '../components/voice/protocol'
import { request } from './tripsService'

/* GhoomMate voice sessions. The backend mints a LiveKit token that also dispatches the agent. */

export const voiceApi = {
  /** 503 VOICE_DISABLED when the server has no LiveKit keys; 404 when you’re not in the trip */
  createSession: (tripId: string) => request<VoiceSession>('/api/voice/session', { body: { tripId } }),
}
