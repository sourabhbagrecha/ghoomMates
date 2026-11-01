// GhoomMate voice agent worker. Separate process: `npm --prefix backend run agent` (node src/voice/agent.ts dev).
// LiveKit dispatches one job per voice session; the job calls our own API as the user (JWT from dispatch metadata).
import { fileURLToPath } from 'node:url';
import { type JobContext, ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import { loadEnv } from '../env.ts';
import { logger } from '../logger.ts';
import { createBackendClient } from './backendClient.ts';
import { firstName } from './members.ts';
import { ACTION_RPC_METHOD, AGENT_NAME, type DispatchMetadata, type UiAction } from './protocol.ts';
import { SKILLS, type SessionState, type Skill, type SkillContext, type TripDetail } from './skills/index.ts';
import { createUiPusher } from './ui.ts';

loadEnv();

const MODEL = process.env.GHOOMATE_MODEL || 'google/gemini-3.8-live';
const VOICE = process.env.GHOOMATE_VOICE || 'Puck';

const today = () => new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function personaInstructions(ctx: Pick<SkillContext, 'trip' | 'me' | 'members'>): string {
  const { trip, me, members } = ctx;
  const dates = trip.startDate ? `${trip.startDate}${trip.endDate ? ` to ${trip.endDate}` : ''}` : 'not set';
  return `You are GhoomMate, a cheerful octopus travel buddy inside Ghoomates, a group-trip app for friends in India.

# Style
- You are speaking out loud. Reply in 1-2 short sentences, casual and warm, like a mate ("Done, mate!", "Sorted!").
- Understand Hinglish and Indian English; reply in the language the user uses. Read rupee amounts naturally ("two hundred fifty rupees", "dedh hazaar").
- No lists, markdown or emojis in speech.

# Rules
- NEVER record an expense unless the user explicitly says yes to your readback, or taps Confirm on the on-screen card.
- If the amount, what it was for, or who was involved is unclear, ask ONE short clarifying question at a time.
- Infer the expense category yourself; never ask about it.
- The payer defaults to the speaker; say "paid by you" in the readback.
- When a tool returns an error, ask the user the question it implies. Never read ids or raw errors aloud.
- For things you can't do yet, say it's coming soon and offer to open the right screen.

# Trip
- Trip: ${trip.name}
- Destination: ${trip.destination || 'not set'}
- Dates: ${dates}
- Today: ${today()}
- Members (${members.length}): ${members.map(m => m.name).join(', ')}
- Speaking with: ${me.name}. "Me", "I", "main" mean ${me.name}.`;
}

export function buildAgentConfig(ctx: SkillContext, skills: Skill[] = SKILLS) {
  return {
    instructions: [personaInstructions(ctx), ...skills.map(s => s.instructions(ctx))].join('\n\n'),
    tools: skills.flatMap(s => s.tools(ctx)),
  };
}

function parseMetadata(raw: string): DispatchMetadata {
  const meta = JSON.parse(raw || '{}') as Partial<DispatchMetadata>;
  if (!meta.tripId || !meta.authToken) throw new Error('Job metadata is missing tripId or authToken');
  return { tripId: meta.tripId, userId: meta.userId ?? '', userName: meta.userName ?? '', authToken: meta.authToken };
}

const newSession = () => new voice.AgentSession({ llm: new inference.RealtimeModel({ model: MODEL, voice: VOICE }) });

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    const meta = parseMetadata(ctx.job.metadata);
    const api = createBackendClient({ authToken: meta.authToken });

    let trip: TripDetail;
    try {
      trip = await api.get<TripDetail>(`/api/trips/${meta.tripId}`);
    } catch (err) {
      // Still join so the user hears something instead of silence.
      logger.error('Voice', `Couldn't load trip ${meta.tripId}: ${(err as Error).message}`);
      const session = newSession();
      await session.start({ agent: new voice.Agent({ instructions: 'You are GhoomMate, a cheerful travel-buddy octopus. You could not load the trip right now. Apologise in one short sentence and suggest trying again in a moment.' }), room: ctx.room });
      session.generateReply({ instructions: `Tell ${firstName(meta.userName || 'mate')} you couldn't load the trip and to try again shortly.` });
      return;
    }

    const members = trip.members.map(({ memberId, userId, name }) => ({ memberId, userId, name }));
    const meMember = members.find(m => m.memberId === trip.memberId);
    const me = { memberId: trip.memberId, name: meMember?.name ?? meta.userName ?? 'you' };
    const participant = await ctx.waitForParticipant();
    const state: SessionState = { pendingDraft: null, lastAdded: null };
    const session = newSession();
    const say = (instructions: string) => void session.generateReply({ instructions });
    const skillCtx: SkillContext = { tripId: trip.id, trip, me, members, api, ui: createUiPusher(ctx.room, participant.identity), say, state };

    session.on(voice.AgentSessionEventTypes.Error, (ev) => logger.warn('Voice', `Session error: ${(ev.error as { error?: Error })?.error?.message ?? String(ev.error)}`));
    await session.start({ agent: new voice.Agent(buildAgentConfig(skillCtx)), room: ctx.room });
    logger.info('Voice', `GhoomMate joined ${ctx.room.name} for ${me.name} on "${trip.name}"`);

    // Tapped Confirm/Cancel on a card: same commit/cancel path as the voice tools, then a short spoken follow-up.
    ctx.room.localParticipant?.registerRpcMethod(ACTION_RPC_METHOD, async (data) => {
      if (data.callerIdentity !== participant.identity) return JSON.stringify({ ok: false, error: 'FORBIDDEN' });
      let action: UiAction;
      try {
        action = JSON.parse(data.payload) as UiAction;
      } catch {
        return JSON.stringify({ ok: false, error: 'BAD_PAYLOAD' });
      }
      for (const skill of SKILLS) {
        const reply = await skill.onAction?.(action, skillCtx);
        if (reply) {
          session.generateReply({ instructions: reply });
          return JSON.stringify({ ok: true });
        }
      }
      return JSON.stringify({ ok: false, error: 'NOT_PENDING' });
    });

    session.generateReply({
      instructions: `Greet ${firstName(me.name)} in one short sentence, like "Hey ${firstName(me.name)}! What can I do for the ${trip.name} squad?"`,
    });
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    // Exit cleanly so `npm run dev` keeps the API and web servers running without voice.
    logger.warn('Voice', 'GhoomMate agent not started: set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in backend/.env');
    process.exit(0);
  }
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: AGENT_NAME }));
}
