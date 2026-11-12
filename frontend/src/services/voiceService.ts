import type { VoiceSession } from '../components/voice/protocol'
import { getToken } from './authService'
import { ApiRequestError, request } from './tripsService'

/* GhoomMate voice sessions (the backend mints a LiveKit token that also dispatches the agent) and chat history. */

export type HistoryItem = { id: string; role: 'user' | 'agent'; text: string; createdAt: string }

export type HeldSession = {
  session: VoiceSession
  /** Settles when the server lets go of the session (time is up, a network drop); not after `signal` aborts it */
  released: Promise<void>
}

/**
 * Starts a session and holds its request open until `signal` aborts (the call ended). The server runs the agent for
 * this call, and Cloud Run gives it CPU only while one of its requests is open, so the call lasts as long as this
 * request does. The token is the response's first line; heartbeat newlines follow.
 *
 * Throws ApiRequestError: 503 VOICE_DISABLED when the server has no LiveKit keys, 503 VOICE_AGENT_WAKING when the
 * worker didn’t register in time (up to ~25 s on a cold instance), 404 when you’re not in the trip.
 */
async function startSession(tripId: string, signal: AbortSignal): Promise<HeldSession> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch('/api/voice/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ tripId }),
      signal,
    })
  } catch (err) {
    if (signal.aborted) throw err
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Can’t reach GhoomMates. Check your connection.')
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null)
    throw new ApiRequestError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? `Request failed (${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (!text.includes('\n')) {
    const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }))
    if (done) throw new ApiRequestError(0, 'NETWORK_ERROR', 'Can’t reach GhoomMates. Check your connection.')
    text += decoder.decode(value, { stream: true })
  }
  const session = JSON.parse(text.slice(0, text.indexOf('\n'))) as VoiceSession
  // Read (and drop) the heartbeats until the stream ends; an abort ends it quietly
  const released = (async () => {
    for (;;) {
      const { done } = await reader.read().catch(() => ({ done: true }))
      if (done) return
    }
  })()
  return { session, released }
}

export const voiceApi = {
  startSession,
  /** Your GhoomMate chats in this trip, oldest first (the latest `limit`, at most 200) */
  history: (tripId: string, limit = 100) =>
    request<{ items: HistoryItem[] }>(`/api/voice/history?tripId=${encodeURIComponent(tripId)}&limit=${limit}`).then((r) => r.items),
  clearHistory: (tripId: string) =>
    request<{ deleted: number }>(`/api/voice/history?tripId=${encodeURIComponent(tripId)}`, { method: 'DELETE' }),
}
