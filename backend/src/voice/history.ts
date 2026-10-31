// GhoomMate's chat history: saved turn by turn while a chat runs (POST /api/voice/history), and the latest turns
// handed to the next chat, so it can pick up where you left off.
import { logger } from '../logger.ts';

export type HistoryRole = 'user' | 'agent';
export type HistoryItem = { id: string; role: HistoryRole; text: string; createdAt: string };
export type HistoryMessage = { role: HistoryRole; text: string };

/** How many past messages the agent loads, and how much of them goes into its instructions */
export const HISTORY_LOAD = 40;
const CONTEXT_CHARS = 3000;
const LINE_CHARS = 280;

const clock = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The latest messages as lines for the model ("Asha: …", "You: …"), oldest first, within a character budget so a
 * long history can't crowd out the instructions. Long messages are shortened.
 */
export function historyContext(items: HistoryItem[], speaker: string, budget = CONTEXT_CHARS): string[] {
  const lines: string[] = [];
  let used = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const { role, text } = items[i];
    const short = text.length > LINE_CHARS ? `${text.slice(0, LINE_CHARS - 1)}…` : text;
    const line = `${role === 'user' ? speaker : 'You'}: ${short}`;
    if (used + line.length > budget) break;
    lines.unshift(line);
    used += line.length;
  }
  return lines;
}

/** "Earlier chats" section for the instructions; empty when there's no history */
export function historySection(items: HistoryItem[], speaker: string): string {
  const lines = historyContext(items, speaker);
  if (!lines.length) return '';
  const last = items[items.length - 1];
  return `# Earlier chats with ${speaker} (latest ${clock(last.createdAt)})
Context only: use it when they refer back ("like I said", "that place you suggested"), don't repeat it unprompted, and check anything time-sensitive again with the tools.
${lines.join('\n')}`;
}

export type HistoryRecorder = {
  add(role: HistoryRole, text: string | undefined): void;
  /** Saves whatever is queued; resolves when it's done (never rejects) */
  flush(): Promise<void>;
};

/**
 * Queues messages and saves them in small batches in the background, so recording never slows the chat.
 * Failures are logged and dropped: history is a convenience, not a record.
 */
export function createHistoryRecorder(save: (messages: HistoryMessage[]) => Promise<unknown>, delayMs = 1500): HistoryRecorder {
  const queue: HistoryMessage[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> = Promise.resolve();

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    while (queue.length) {
      const batch = queue.splice(0, 50);
      saving = saving.then(() => save(batch)).then(
        () => undefined,
        (err: Error) => logger.warn('Voice', `Couldn't save ${batch.length} GhoomMate message(s): ${err.message}`),
      );
    }
    return saving;
  };

  return {
    add(role, text) {
      const trimmed = text?.trim();
      if (!trimmed) return;
      queue.push({ role, text: trimmed });
      timer ??= setTimeout(() => void flush(), delayMs);
    },
    flush,
  };
}
