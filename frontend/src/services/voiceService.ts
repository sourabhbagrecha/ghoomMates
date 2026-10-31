import type { VoiceSession } from '../components/voice/protocol'
import { request } from './tripsService'

/* GhoomMate voice sessions (the backend mints a LiveKit token that also dispatches the agent) and chat history. */

export type HistoryItem = { id: string; role: 'user' | 'agent'; text: string; createdAt: string }

export const voiceApi = {
  /** 503 VOICE_DISABLED when the server has no LiveKit keys; 404 when you’re not in the trip */
  createSession: (tripId: string) => request<VoiceSession>('/api/voice/session', { body: { tripId } }),
  /** Your GhoomMate chats in this trip, oldest first (the latest `limit`, at most 200) */
  history: (tripId: string, limit = 100) =>
    request<{ items: HistoryItem[] }>(`/api/voice/history?tripId=${encodeURIComponent(tripId)}&limit=${limit}`).then((r) => r.items),
  clearHistory: (tripId: string) =>
    request<{ deleted: number }>(`/api/voice/history?tripId=${encodeURIComponent(tripId)}`, { method: 'DELETE' }),
}
