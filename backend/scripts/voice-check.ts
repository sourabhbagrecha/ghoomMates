// End-to-end voice check against a deployed server, as the app does it: signs in (mock sign-in, so the server needs
// ALLOW_DEV_LOGIN=true), holds a GhoomMate session open, joins the LiveKit room and waits for the agent to speak.
//
//   node scripts/voice-check.ts https://<service>.run.app [--private] [--wait 90] [--email aditi.travels@gmail.com] [--no-mic] [--hangup]
//
// After the greeting it stays in the call for --wait seconds, then types a question and waits for the spoken answer:
// a call is only as good as the CPU the agent gets all the way through it. Keep --wait under the agent's idle hang-up
// (GHOOMATE_IDLE_HANGUP_S, 30 s by default), or the call ends first.
//
// --hangup: after the greeting, say nothing and expect GhoomMate to hang up, the room to close and the server to let go
// of the held session request (so the instance's CPU goes idle).
//
// Like the browser, it publishes a microphone track (faint noise, as a live mic sends). --no-mic leaves it out, as a
// muted user would: the realtime model then sees no audio and closes its session for inactivity every ~2 minutes.
//
// --private: the service is not public, so each request also carries an identity token from gcloud
// (X-Serverless-Authorization, which Cloud Run checks and leaves the app's own Authorization header alone).
import { execFileSync } from 'node:child_process';
import { AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource, dispose, type RemoteTrack, type RemoteParticipant } from '@livekit/rtc-node';

const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http'))?.replace(/\/+$/, '');
if (!base) throw new Error('usage: node scripts/voice-check.ts <server URL> [--private] [--listen seconds] [--email address]');
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const waitSec = Number(flag('--wait') ?? 20);
const expectHangup = args.includes('--hangup');
const email = flag('--email') ?? 'aditi.travels@gmail.com';
const mic = !args.includes('--no-mic');
const iam: Record<string, string> = args.includes('--private')
  ? { 'X-Serverless-Authorization': `Bearer ${execFileSync('gcloud', ['auth', 'print-identity-token'], { encoding: 'utf8' }).trim()}` }
  : {};

const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const log = (msg: string) => console.log(`[${at()}] ${msg}`);

async function api<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...iam, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data as T;
}

const { token } = await api<{ token: string }>('POST', '/auth/dev/login', undefined, { email });
let { items } = await api<{ items: { id: string; name: string }[] }>('GET', '/api/trips', token);
if (!items.length) {
  await api('POST', '/api/trips', token, { name: 'Voice check', destination: 'Udaipur' });
  ({ items } = await api<{ items: { id: string; name: string }[] }>('GET', '/api/trips', token));
}
const trip = items[0];
log(`signed in as ${email}; trip "${trip.name}"`);

// The held session: first line is the token, then heartbeats until we abort
const hold = new AbortController();
const res = await fetch(`${base}/api/voice/session`, {
  method: 'POST',
  headers: { ...iam, 'Content-Type': 'application/json', Accept: 'application/x-ndjson', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ tripId: trip.id }),
  signal: hold.signal,
});
if (!res.ok || !res.body) throw new Error(`session: ${res.status} ${await res.text()}`);
const reader = res.body.getReader();
let text = '';
while (!text.includes('\n')) {
  const { done, value } = await reader.read();
  if (done) throw new Error('session stream ended before the token');
  text += new TextDecoder().decode(value);
}
const session = JSON.parse(text.slice(0, text.indexOf('\n'))) as { serverUrl: string; participantToken: string; roomName: string };
log(`session ${session.roomName}`);
let released = false;
let releasedAt = '';
const releasedP = (async () => {
  for (;;) {
    const { done } = await reader.read().catch(() => ({ done: true }));
    if (done) { released = true; releasedAt = at(); return; }
  }
})();

const room = new Room();
let agentJoinedAt = '';
let firstVoiceAt = '';
let frames = 0;
let voiced = 0;
// Resolves on the next stretch of speech after it is armed
let onVoice: (() => void) | undefined;
let lastVoice = 0;
const nextVoice = () => new Promise<void>((resolve) => { onVoice = resolve; });
const heard = nextVoice();
{
  room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
    if (p.identity.startsWith('agent-')) { agentJoinedAt = at(); log(`agent joined (${p.identity})`); }
  });
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, p: RemoteParticipant) => {
    if (track.kind !== TrackKind.KIND_AUDIO || !p.identity.startsWith('agent-')) return;
    void (async () => {
      const frames$ = new AudioStream(track).getReader();
      for (;;) {
        const { done, value: frame } = await frames$.read();
        if (done) return;
        frames += 1;
        let peak = 0;
        for (const s of frame.data) peak = Math.max(peak, Math.abs(s));
        if (peak > 500) {
          voiced += 1;
          // A new stretch of speech: more than a second after the last voiced frame
          if (Date.now() - lastVoice > 1000) log('agent is speaking');
          lastVoice = Date.now();
          if (!firstVoiceAt) firstVoiceAt = at();
          onVoice?.();
          onVoice = undefined;
        }
      }
    })();
  });
}
let roomClosedAt = '';
const roomClosed = new Promise<void>((resolve) => room.on(RoomEvent.Disconnected, () => { roomClosedAt = at(); log('the room closed'); resolve(); }));
await room.connect(session.serverUrl, session.participantToken, { autoSubscribe: true, dynacast: false });
log('joined the room');

// A live mic: 10 ms frames of faint noise, paced by captureFrame (it waits while its queue is full)
let micOn = mic;
if (mic) {
  const source = new AudioSource(48_000, 1);
  const track = LocalAudioTrack.createAudioTrack('mic', source);
  await room.localParticipant!.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
  void (async () => {
    while (micOn) {
      const frame = AudioFrame.create(48_000, 1, 480);
      for (let i = 0; i < frame.data.length; i++) frame.data[i] = Math.round((Math.random() - 0.5) * 40);
      await source.captureFrame(frame).catch(() => { micOn = false; });
    }
  })();
}

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p.then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), ms))]);
const greeted = await within(heard, 30_000);
if (expectHangup) {
  let quietSince = '';
  if (greeted) {
    while (Date.now() - lastVoice < 1500) await new Promise(resolve => setTimeout(resolve, 250));
    quietSince = at();
    log('staying quiet');
  }
  const hungUp = greeted && await within(roomClosed, 90_000);
  const let_go = hungUp && await within(releasedP, 15_000);
  micOn = false;
  await room.disconnect();
  hold.abort();
  await dispose();
  const ok = greeted && hungUp && let_go;
  console.log(JSON.stringify({ ok, agentJoinedAt, firstVoiceAt, quietSince, roomClosedAt, releasedAt, total: at() }));
  process.exit(ok ? 0 : 1);
}
let answered = false;
let answerAfter = '';
if (greeted) {
  log(`staying in the call for ${waitSec}s`);
  await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
  // Wait for quiet, then ask
  while (Date.now() - lastVoice < 1500) await new Promise(resolve => setTimeout(resolve, 250));
  const asked = Date.now();
  const answer = nextVoice();
  await room.localParticipant!.sendText('What is the name of this trip? One short sentence.', { topic: 'lk.chat' });
  log('asked a question');
  answered = await within(answer, 30_000);
  answerAfter = answered ? `${((Date.now() - asked) / 1000).toFixed(1)}s` : '';
  if (answered) await new Promise(resolve => setTimeout(resolve, 4000));
}
const heldToTheEnd = !released;
micOn = false;
await room.disconnect();
hold.abort();
await dispose();

const ok = greeted && answered && heldToTheEnd;
console.log(JSON.stringify({ ok, agentJoinedAt, firstVoiceAt, answerAfter, frames, voicedFrames: voiced, heldToTheEnd, total: at() }));
process.exit(ok ? 0 : 1);
