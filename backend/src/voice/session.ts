import { randomBytes } from 'node:crypto';
import { AccessToken, RoomAgentDispatch, RoomConfiguration, RoomServiceClient } from 'livekit-server-sdk';
import { agentNameFrom, type DispatchMetadata, type VoiceSession } from './protocol.ts';

export type LiveKitConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
  /** The worker name sessions dispatch to (GHOOMATE_AGENT_NAME); must match the agent worker's */
  agentName: string;
};

// Reads LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET (+ GHOOMATE_AGENT_NAME); null when any key is missing.
export function liveKitConfig(env: Record<string, string | undefined> = process.env): LiveKitConfig | null {
  const url = env.LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret, agentName: agentNameFrom(env) } : null;
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
    agents: [new RoomAgentDispatch({ agentName: config.agentName, metadata: JSON.stringify(metadata) })],
  });

  return { serverUrl: config.url, participantToken: await at.toJwt(), roomName, participantIdentity };
}

/** Whether a participant is in a room right now; a room that's gone (or never started) counts as no */
export type InRoom = (roomName: string, identity: string) => Promise<boolean>;

export function liveKitPresence(config: LiveKitConfig): InRoom {
  const rooms = new RoomServiceClient(config.url.replace(/^ws/, 'http'), config.apiKey, config.apiSecret);
  return async (roomName, identity) => {
    try {
      return (await rooms.listParticipants(roomName)).some(p => p.identity === identity);
    } catch (err) {
      const { status, code } = err as { status?: number; code?: string };
      if (status === 404 || code === 'not_found') return false;
      throw err;
    }
  };
}
