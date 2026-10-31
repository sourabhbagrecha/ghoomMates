import { randomBytes } from 'node:crypto';
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import { AGENT_NAME, type DispatchMetadata, type VoiceSession } from './protocol.ts';

export type LiveKitConfig = { url: string; apiKey: string; apiSecret: string };

// Reads LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET; null when any is missing (voice disabled).
export function liveKitConfig(env: Record<string, string | undefined> = process.env): LiveKitConfig | null {
  const url = env.LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

export type SessionRequest = {
  tripId: string;
  userId: string;
  userName: string;
  /** Short-lived API token for the agent, scoped to this user (see agentToken in app.ts). */
  authToken: string;
};

// Mints a 15-minute token for a private room that explicitly dispatches the GhoomMate agent.
export async function createVoiceSession(config: LiveKitConfig, req: SessionRequest): Promise<VoiceSession> {
  const roomName = `ghoomate-${req.tripId}-${req.userId}-${randomBytes(4).toString('hex')}`;
  const participantIdentity = `user-${req.userId}`;
  const metadata: DispatchMetadata = { tripId: req.tripId, userId: req.userId, userName: req.userName, authToken: req.authToken };

  const at = new AccessToken(config.apiKey, config.apiSecret, { identity: participantIdentity, name: req.userName, ttl: '15m' });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: AGENT_NAME, metadata: JSON.stringify(metadata) })],
  });

  return { serverUrl: config.url, participantToken: await at.toJwt(), roomName, participantIdentity };
}
