// Ends a call nobody is using. The worker relays audio for as long as the call lasts, and on Cloud Run the call's held
// session request keeps the instance's CPU billed, so a forgotten open sheet would cost as much as a real chat.
//
// The SDK's user-away timer does the watching: it runs only while both the user and the agent are listening, so
// speech, a typed message, a card tap (each makes the agent think or speak) and a running tool all reset it. When it
// fires the user state turns 'away', and we hang up.
import { voice } from '@livekit/agents';

/** Seconds of quiet before GhoomMate hangs up; 0 never hangs up */
export const idleHangupSeconds = () => {
  const value = Number(process.env.GHOOMATE_IDLE_HANGUP_S ?? 30);
  return Number.isFinite(value) && value > 0 ? value : null;
};

type AwayEvents = {
  on(event: typeof voice.AgentSessionEventTypes.UserStateChanged, listener: (ev: { newState: string }) => void): unknown;
};

/** Calls `hangUp` once, the first time the user turns away */
export function hangUpWhenAway(session: AwayEvents, hangUp: () => Promise<void> | void) {
  let done = false;
  session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
    if (ev.newState !== 'away' || done) return;
    done = true;
    void Promise.resolve().then(hangUp).catch(() => {});
  });
}
