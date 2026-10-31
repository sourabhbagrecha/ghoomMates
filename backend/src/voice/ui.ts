// Agent → frontend UI events over LiveKit RPC. Fire-and-forget: a missed card must never fail a tool.
import type { JobContext } from '@livekit/agents';
import { logger } from '../logger.ts';
import { UI_RPC_METHOD, type UiEvent } from './protocol.ts';

export type Room = JobContext['room'];
export type PushUi = (event: UiEvent) => Promise<void>;

// Events are delivered one at a time in order (a draft card always lands before its "added" flip).
// The returned promise never rejects, so callers can `void` it and carry on speaking.
export function createUiPusher(room: Room, destinationIdentity: string): PushUi {
  let queue: Promise<void> = Promise.resolve();
  const send = async (event: UiEvent) => {
    const local = room.localParticipant;
    if (!local) return;
    try {
      await local.performRpc({ destinationIdentity, method: UI_RPC_METHOD, payload: JSON.stringify(event), responseTimeout: 5000 });
    } catch (err) {
      logger.warn('Voice', `UI event "${event.type}" not delivered to ${destinationIdentity}: ${(err as Error).message}`);
    }
  };
  return (event) => (queue = queue.then(() => send(event)));
}
