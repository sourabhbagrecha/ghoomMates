// Records the hand-written tellings with Gemini speech and ships them as compressed m4a under frontend/public/stories/,
// so the demo plays with no AI. Updates src/stories/curated/narration.ts with each recording's length, panel start times
// and a hash of the words and voice, so an edited story stops using a stale recording.
//
// Usage: node scripts/stories/narration.ts [--force] [siteId[:lang] ...]
//   default: every curated site in English, plus Bagore ki Haveli in Hindi (the demo story)
// Speech goes through Vertex AI (gcloud application-default credentials): the API key's free tier allows only 10 requests a day.
// Needs macOS `afconvert`. ENV_FILE=/path/to/backend/.env points at the env file when it isn't backend/.env.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadEnv } from '../../src/env.ts';
import { createGemini } from '../../src/gemini.ts';
import { SITE_BY_ID } from '../../src/heritage/sites.ts';
import { CURATED } from '../../src/stories/curated/index.ts';
import { STATIC_NARRATION, type StaticNarration } from '../../src/stories/curated/narration.ts';
import { NARRATOR_VOICE, synthesizeStory } from '../../src/stories/narration.ts';
import { narrationHash } from '../../src/stories/speech.ts';
import { LANGS, isLang, type Lang } from '../../src/stories/types.ts';

loadEnv(process.env.ENV_FILE);

const args = process.argv.slice(2);
const force = args.includes('--force');
const picked = args.filter(arg => !arg.startsWith('--'));
const targets: { siteId: string; lang: Lang }[] = picked.length
  ? picked.flatMap((arg) => {
    const [siteId, lang] = arg.split(':');
    if (!CURATED.has(siteId)) throw new Error(`No curated story for "${siteId}"`);
    if (lang && !isLang(lang)) throw new Error(`Unknown language "${lang}"`);
    return lang ? [{ siteId, lang: lang as Lang }] : LANGS.map(l => ({ siteId, lang: l }));
  })
  : [...CURATED.keys()].map(siteId => ({ siteId, lang: 'en' as Lang })).concat([{ siteId: 'bagore-ki-haveli', lang: 'hi' }]);

const vertex = createGemini({ ...process.env, GEMINI_API_KEY: '' });
if (!vertex.enabled) throw new Error('Set VERTEX_PROJECT (and run `gcloud auth application-default login`)');

const publicDir = resolve(import.meta.dirname, '../../../frontend/public/stories');
const manifestPath = resolve(import.meta.dirname, '../../src/stories/curated/narration.ts');
const entries: Record<string, Partial<Record<Lang, StaticNarration>>> = JSON.parse(JSON.stringify(STATIC_NARRATION));
const BITRATE = 24_000;

for (const { siteId, lang } of targets) {
  const site = CURATED.get(siteId)!;
  const body = site[lang];
  const hash = narrationHash(body.panels, lang, NARRATOR_VOICE);
  const file = join(publicDir, siteId, `${lang}.m4a`);
  if (!force && entries[siteId]?.[lang]?.hash === hash && existsSync(file)) {
    console.log(`${siteId} ${lang}: up to date`);
    continue;
  }
  const started = Date.now();
  const joined = await synthesizeStory(vertex, { panels: body.panels, siteName: SITE_BY_ID.get(siteId)?.name ?? siteId, lang, retryMs: 20_000 });
  const dir = mkdtempSync(join(tmpdir(), 'kaavad-'));
  try {
    writeFileSync(join(dir, 'in.wav'), joined.wav);
    mkdirSync(join(publicDir, siteId), { recursive: true });
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(BITRATE), '-c', '1', join(dir, 'in.wav'), file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const bytes = statSync(file).size;
  (entries[siteId] ??= {})[lang] = { durationSec: joined.durationSec, marks: joined.marks, hash, bytes };
  console.log(`${siteId} ${lang}: ${joined.durationSec}s, ${(bytes / 1024).toFixed(0)} KB, panels at ${joined.marks.join(', ')} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  writeManifest();
}

function writeManifest() {
  const sites = Object.keys(entries).sort();
  const body = sites.map((siteId) => {
    const langs = LANGS.filter(l => entries[siteId][l]).map((l) => {
      const e = entries[siteId][l]!;
      return `    ${l}: { durationSec: ${e.durationSec}, marks: [${e.marks.join(', ')}], hash: '${e.hash}', bytes: ${e.bytes} },`;
    });
    return `  '${siteId}': {\n${langs.join('\n')}\n  },`;
  });
  const header = `import type { Lang } from '../types.ts';

// Narration recorded ahead of time for the classic tellings, shipped as frontend/public/stories/<siteId>/<lang>.m4a so the
// demo plays with no AI and no network to Google. Written by scripts/stories/narration.ts; \`hash\` ties each recording to the
// exact words and voice it was made from, so an edited story stops using a stale recording.
export type StaticNarration = { durationSec: number; marks: number[]; hash: string; bytes: number };
`;
  writeFileSync(manifestPath, `${header}\nexport const STATIC_NARRATION: Record<string, Partial<Record<Lang, StaticNarration>>> = {${body.length ? `\n${body.join('\n')}\n` : ''}};\n`);
}

writeManifest();
console.log('done');
