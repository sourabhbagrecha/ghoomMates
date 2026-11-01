// GhoomMate voice agent worker. Separate process: `npm --prefix backend run agent` (node src/voice/agent.ts dev).
// LiveKit dispatches one job per voice session; the job calls our own API as the user (JWT from dispatch metadata).
import { fileURLToPath } from 'node:url';
import { type JobContext, ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import { loadEnv } from '../env.ts';
import { logger } from '../logger.ts';
import { createBackendClient } from './backendClient.ts';
import { firstName } from './members.ts';
import { createHistoryRecorder, HISTORY_LOAD, historySection, type HistoryItem } from './history.ts';
import { emptyMemory, memoryFrom } from './memory.ts';
import { ACTION_RPC_METHOD, AGENT_NAME, agentNameFrom, type DispatchMetadata, type UiAction } from './protocol.ts';
import { SKILLS, type SessionState, type Skill, type SkillContext, type Tool, type TripDetail } from './skills/index.ts';
import { createUiPusher } from './ui.ts';

loadEnv();

const MODEL = process.env.GHOOMATE_MODEL || 'google/gemini-3.8-live';
const VOICE = process.env.GHOOMATE_VOICE || 'Puck';
/** Job processes kept started and loaded, so a new chat skips spawning Node and importing the agent (~1–2 s).
 *  The SDK defaults to none in dev; 0 turns it off (e.g. to pick up code edits on the very next chat). */
const IDLE_PROCESSES = Math.max(0, Number(process.env.GHOOMATE_IDLE_PROCESSES ?? 1) || 0);

const today = () => new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function personaInstructions(ctx: Pick<SkillContext, 'trip' | 'me' | 'members'>): string {
  const { trip, me, members } = ctx;
  const dates = trip.startDate ? `${trip.startDate}${trip.endDate ? ` to ${trip.endDate}` : ''}` : 'not set';
  return `You are GhoomMate, a cheerful octopus travel buddy inside Ghoommates, a group-trip app for friends in India.

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
- Before a tool that looks something up, saves or plans (balances, expenses, picks, day plans, adding to the itinerary), first say two or three words ("One sec…", "Checking…", "Ek second…"), then call it. Never go silent while you work.
- For things you can't do yet, say it's coming soon and offer to open the right screen.

# Trip
- Trip: ${trip.name}
- Destination: ${trip.destination || 'not set'}
- Dates: ${dates}
- Today: ${today()}
- Members (${members.length}): ${members.map(m => m.name).join(', ')}
- Speaking with: ${me.name}. "Me", "I", "main" mean ${me.name}.`;
}

/** Shows the skill's label on screen while a tool runs ("Checking balances…") and clears it when it's done */
function withWorkingStatus(tool: Tool, label: string | undefined, ctx: SkillContext): Tool {
  if (!label) return tool;
  const run = tool.execute.bind(tool);
  tool.execute = async (args, opts) => {
    void ctx.ui({ type: 'working', label });
    try {
      return await run(args, opts);
    } finally {
      void ctx.ui({ type: 'working', label: null });
    }
  };
  return tool;
}

export function buildAgentConfig(ctx: SkillContext, skills: Skill[] = SKILLS) {
  return {
    instructions: [personaInstructions(ctx), historySection(ctx.history ?? [], firstName(ctx.me.name)), ...skills.map(s => s.instructions(ctx))]
      .filter(Boolean)
      .join('\n\n'),
    tools: skills.flatMap(s => s.tools(ctx).map(tool => withWorkingStatus(tool, s.working?.[tool.name], ctx))),
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
    const meta = parseMetadata(ctx.job.metadata);
    const api = createBackendClient({ authToken: meta.authToken });
    // Start loading the trip while we join the room and wait for the user; none of these need the others
    const tripLoad = api.get<TripDetail>(`/api/trips/${meta.tripId}`).then(
      (trip) => ({ trip }),
      (error: Error) => ({ error }),
    );
    // What they told GhoomMate in earlier chats; a chat without it still works
    const memoryLoad = api.get<{ user: { preferences?: unknown } }>('/auth/me').then(
      ({ user }) => memoryFrom(user.preferences),
      (err: Error) => {
        logger.warn('Voice', `Couldn't load GhoomMate memory: ${err.message}`);
        return emptyMemory();
      },
    );
    // The last chats in this trip, so it can pick up where you left off
    const historyLoad = api.get<{ items: HistoryItem[] }>(`/api/voice/history?tripId=${encodeURIComponent(meta.tripId)}&limit=${HISTORY_LOAD}`).then(
      ({ items }) => items,
      (err: Error) => {
        logger.warn('Voice', `Couldn't load GhoomMate history: ${err.message}`);
        return [] as HistoryItem[];
      },
    );
    await ctx.connect();
    const participantJoin = ctx.waitForParticipant();
    participantJoin.catch(() => {}); // awaited below; if the trip fails to load we return without it

    let trip: TripDetail;
    const loaded = await tripLoad;
    if ('trip' in loaded) {
      trip = loaded.trip;
    } else {
      const err = loaded.error;
      // Still join so the user hears something instead of silence.
      logger.error('Voice', `Couldn't load trip ${meta.tripId}: ${(err as Error).message}`);
      const session = newSession();
      await session.start({ agent: new voice.Agent({ instructions: 'You are GhoomMate, a cheerful travel-buddy octopus. You could not load the trip right now. Apologise in one short sentence and suggest trying again in a moment.' }), room: ctx.room });
      session.generateReply({ instructions: `Tell ${firstName(meta.userName || 'mate')} you couldn't load the trip and to try again shortly.` });
      return;
    }

    const members = trip.members.map(({ memberId, userId, name, vibe }) => ({ memberId, userId, name, vibe: vibe ?? null }));
    const meMember = members.find(m => m.memberId === trip.memberId);
    const me = { memberId: trip.memberId, name: meMember?.name ?? meta.userName ?? 'you' };
    const [participant, memory, history] = await Promise.all([participantJoin, memoryLoad, historyLoad]);
    const state: SessionState = { pendingDraft: null, lastAdded: null };
    const skillCtx: SkillContext = { tripId: trip.id, trip, me, members, memory, history, api, ui: createUiPusher(ctx.room, participant.identity), state };

    const session = newSession();
    session.on(voice.AgentSessionEventTypes.Error, (ev) => logger.warn('Voice', `Session error: ${(ev.error as { error?: Error })?.error?.message ?? String(ev.error)}`));
    // Save each turn (spoken or typed) to the trip's history as the chat goes, and whatever's left when it ends
    const recorder = createHistoryRecorder((messages) => api.post('/api/voice/history', { tripId: trip.id, messages }));
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) return;
      recorder.add(item.role === 'user' ? 'user' : 'agent', item.textContent);
    });
    ctx.addShutdownCallback(() => recorder.flush());
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
  const agentName = agentNameFrom();
  // Every worker on the LiveKit project with this name shares its sessions, teammates' laptops included
  if (agentName === AGENT_NAME) logger.warn('Voice', `Registering as the shared "${AGENT_NAME}"; set GHOOMATE_AGENT_NAME in backend/.env so your app's sessions only come to this worker`);
  else logger.info('Voice', `Registering GhoomMate as "${agentName}"`);
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName, numIdleProcesses: IDLE_PROCESSES }));
}
