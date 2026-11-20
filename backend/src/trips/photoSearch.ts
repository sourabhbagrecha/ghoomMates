import { object, requireThat } from '../expenses/domain.ts';
import { GeminiError, type Gemini } from '../gemini.ts';
import { logger } from '../logger.ts';

// Photo search: who is in the photo (face matches against members' selfies), how they look (the face-indexer's
// DeepFace emotion per face) and what is happening (the face-indexer's Gemini caption and tags per photo, in
// photo_tags). The app's search box, its chips and GhoomMate's find_photos tool all end up as one PhotoFilter.
// This file holds the pure parts: validating a filter, matching faces to an expression, combining people, scene
// tag expansion and the natural-language parse (Gemini, with a keyword fallback). service.ts runs the queries.

export const EXPRESSIONS = ['happy', 'neutral', 'surprise', 'sad', 'angry', 'fear', 'disgust'] as const;
export type Expression = typeof EXPRESSIONS[number];
export type PhotoFilter = { userIds: string[]; match: 'any' | 'all'; expression?: Expression; scene?: string };
export type SearchMember = { userId: string; name: string; username?: string | null };

const MAX_PEOPLE = 12;
const MAX_SCENE = 80;
// A face counts as smiling when DeepFace calls it happy, or gives happy at least this probability
const SMILE_MIN = 0.5;

export function isExpression(value: unknown): value is Expression {
  return typeof value === 'string' && (EXPRESSIONS as readonly string[]).includes(value);
}

// The body of POST /photos/find (also what GhoomMate sends)
export function readFilter(input: unknown): PhotoFilter {
  const body = object(input);
  const userIds = body.userIds === undefined ? [] : body.userIds;
  requireThat(Array.isArray(userIds) && userIds.length <= MAX_PEOPLE && userIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 64),
    `userIds must be a list of at most ${MAX_PEOPLE} user ids`);
  const match = body.match === undefined ? 'any' : body.match;
  requireThat(match === 'any' || match === 'all', 'match must be any or all');
  requireThat(body.expression === undefined || body.expression === null || body.expression === '' || isExpression(body.expression),
    `expression must be one of ${EXPRESSIONS.join(', ')}`);
  const scene = body.scene === undefined || body.scene === null ? '' : body.scene;
  requireThat(typeof scene === 'string' && scene.length <= MAX_SCENE, `scene must be a string of at most ${MAX_SCENE} characters`);
  const filter: PhotoFilter = { userIds: [...new Set(userIds as string[])], match };
  if (isExpression(body.expression)) filter.expression = body.expression;
  if (scene.trim()) filter.scene = scene.trim();
  requireThat(filter.userIds.length || filter.expression || filter.scene, 'Ask for at least one person, an expression or a scene');
  return filter;
}

export function faceShows(face: { emotion?: string | null; smile?: number | null }, expression?: Expression) {
  if (!expression) return true;
  if (expression === 'happy') return face.emotion === 'happy' || (face.smile ?? 0) >= SMILE_MIN;
  return face.emotion === expression;
}

// The Mongo filter on faces for one expression (expression-only searches, with no person)
export function expressionQuery(expression: Expression): Record<string, unknown> {
  return expression === 'happy' ? { $or: [{ emotion: 'happy' }, { smile: { $gte: SMILE_MIN } }] } : { emotion: expression };
}

export type FoundFace = { x: number; y: number; w: number; h: number; distance?: number; emotion?: string | null; smile?: number | null };
export type PersonMatch = { photoId: string; distance: number; faces: FoundFace[] };
export type PhotoHit = { photoId: string; distance: number; people: string[]; faces: (FoundFace & { userId?: string })[] };

// Per person, keep the faces that show the expression; then a photo is a hit if any (or every) person is in it.
export function combinePeople(perPerson: Map<string, PersonMatch[]>, match: 'any' | 'all', expression?: Expression): PhotoHit[] {
  const photos = new Map<string, PhotoHit>();
  for (const [userId, matches] of perPerson) {
    for (const m of matches) {
      const faces = m.faces.filter(f => faceShows(f, expression));
      if (!faces.length) continue;
      let hit = photos.get(m.photoId);
      if (!hit) photos.set(m.photoId, hit = { photoId: m.photoId, distance: m.distance, people: [], faces: [] });
      hit.people.push(userId);
      hit.faces.push(...faces.map(f => ({ ...f, userId })));
      hit.distance = Math.min(hit.distance, m.distance);
    }
  }
  const people = perPerson.size;
  return [...photos.values()]
    .filter(h => match === 'any' || h.people.length === people)
    .sort((a, b) => b.people.length - a.people.length || a.distance - b.distance || a.photoId.localeCompare(b.photoId));
}

/* Scenes */

const STOPWORDS = new Set([
  'show', 'me', 'give', 'get', 'find', 'pull', 'up', 'bring', 'send', 'see', 'want', 'can', 'you', 'please', 'all', 'every', 'the', 'a', 'an',
  'of', 'my', 'our', 'his', 'her', 'their', 'photo', 'photos', 'pic', 'pics', 'picture', 'pictures', 'image', 'images', 'shot', 'shots',
  'where', 'when', 'which', 'that', 'was', 'were', 'i', 'am', 'is', 'are', 'be', 'from', 'at', 'in', 'on', 'during', 'and', 'or', 'with',
  'together', 'both', 'event', 'events', 'some', 'any', 'us', 'we', 'everyone', 'whole', 'squad', 'group', 'gang', 'trip', 'one', 'ones',
  'only', 'just', 'also', 'to', 'for', 'by', 'it', 'its', 'this', 'those', 'these', 'there', 'mine', 'myself', 'other', 'others', 'look',
  'looking', 'having', 'doing', 'wala', 'wali', 'waali', 'ki', 'ke', 'ka', 'mein', 'aur', 'saare', 'sab', 'dikhao', 'meri', 'mera', 'mere',
  'time', 'day', 'moment', 'moments',
]);

// "hiking" and "hike" both become "hik"; good enough to line up spoken words with tags
export function stem(word: string) {
  return word.replace(/(ings|ing|es|s|ed|e)$/, '') || word;
}

export function sceneWords(scene: string) {
  return scene.toLowerCase().replace(/['’]s\b/g, '').split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOPWORDS.has(w));
}

// Tags from this trip's vocabulary that match the words. Tags matching more of the words win, so "conference hall"
// picks "conference hall" over "dining hall".
export function matchTags(scene: string, vocabulary: string[]): string[] {
  const words = sceneWords(scene).map(stem);
  if (!words.length) return [];
  let best = 0;
  const scored = vocabulary.map(tag => {
    const tagStems = new Set(tag.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem));
    const score = words.filter(w => tagStems.has(w)).length;
    best = Math.max(best, score);
    return { tag, score };
  });
  return best ? scored.filter(t => t.score === best).map(t => t.tag) : [];
}

// A regex that matches text containing every scene word (stems, so "hiking" finds "hike")
export function captionPattern(scene: string): RegExp | null {
  const words = sceneWords(scene).map(stem).filter(w => w.length >= 3);
  if (!words.length) return null;
  const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(words.map(w => `(?=.*\\b${escape(w)})`).join(''), 'is');
}

const EXPAND_SCHEMA = { type: 'OBJECT', properties: { tags: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['tags'] };

// Gemini picks synonyms and close matches from the vocabulary ("hiking" → "trek", "mountain trail"); never a tag
// outside it. Used only when the words match no tag directly.
export async function expandScene(scene: string, vocabulary: string[], gemini?: Gemini): Promise<string[]> {
  const direct = matchTags(scene, vocabulary);
  if (direct.length || !vocabulary.length || !gemini?.enabled) return direct;
  try {
    const { tags } = await gemini.json<{ tags: string[] }>({
      label: 'PhotoSearch',
      model: gemini.models.lite,
      temperature: 0,
      timeoutMs: 8_000,
      schema: EXPAND_SCHEMA,
      system: 'You match a photo search to the tags of a group trip\'s photos. Return only tags copied exactly from the list. Include synonyms and things that clearly mean the same scene, activity, occasion or place (hiking: trek, mountain trail; haldi: turmeric ceremony). Leave out loosely related tags. Return an empty list if nothing fits.',
      prompt: `Search: ${scene}\nTags: ${vocabulary.join(', ')}`,
    });
    const known = new Set(vocabulary);
    return [...new Set((tags ?? []).map(t => String(t).toLowerCase().trim()).filter(t => known.has(t)))];
  } catch (err) {
    if (!(err instanceof GeminiError)) throw err;
    logger.warn('PhotoSearch', `scene expansion fell back to keywords: ${err.message}`);
    return [];
  }
}

/* Natural language */

export type ParsedQuery = { filter: PhotoFilter; sceneTags: string[]; unmatched: string[]; source: 'gemini' | 'keywords' };

const ME = new Set(['me', 'my', 'i', 'myself', 'mine', 'im', 'i\'m', 'meri', 'mera', 'mere', 'mujhe']);
const TOGETHER = /\b(together|both|with|along with|alongside|saath)\b/;
// "show me photos of Bhavya": this "me" is the listener, not a person in the photos
const ASKING = /\b(show|give|send|get|bring|pull up|fetch)\s+me\b/g;
const EXPRESSION_WORDS: [RegExp, Expression][] = [
  [/\b(smil\w*|laugh\w*|happy|happiest|grin\w*|cheer\w*|joy\w*|hasta|hans\w*)\b/, 'happy'],
  [/\b(surpris\w*|shock\w*|amaz\w*|astonish\w*|wow)\b/, 'surprise'],
  [/\b(sad|sadd?\w*|cry\w*|upset|gloomy)\b/, 'sad'],
  [/\b(angry|anger|mad|furious)\b/, 'angry'],
  [/\b(scared|afraid|fear\w*|frighten\w*)\b/, 'fear'],
  [/\b(disgust\w*|gross\w*|grossed)\b/, 'disgust'],
  [/\b(serious|neutral|straight face|poker face|expressionless)\b/, 'neutral'],
];
const EXPRESSION_STRIP = new RegExp(EXPRESSION_WORDS.map(([re]) => re.source).join('|'), 'g');

function norm(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’]/g, '\'');
}

// No Gemini: names (first name, full name or username), "me/my/I", expression words, "together/with/both", and the
// words left over as the scene.
export function parseQueryKeywords(query: string, members: SearchMember[], meId: string, vocabulary: string[] = []): ParsedQuery {
  let q = ` ${norm(query).replace(/'s\b/g, '')} `;
  const userIds: string[] = [];
  const add = (id: string) => { if (!userIds.includes(id)) userIds.push(id); };

  // Longest names first so "Bhavya Jain" wins over "Bhavya"
  const keys = members.flatMap(m => {
    const full = norm(m.name).trim();
    const first = full.split(/\s+/)[0];
    return [full, first, m.username ? norm(m.username) : ''].filter(k => k.length >= 2).map(k => ({ k, id: m.userId }));
  }).sort((a, b) => b.k.length - a.k.length);
  for (const { k, id } of keys) {
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    if (re.test(q)) { add(id); q = q.replace(re, ' '); }
  }

  q = q.replace(ASKING, ' ');
  const together = TOGETHER.test(q);
  let expression: Expression | undefined;
  for (const [re, value] of EXPRESSION_WORDS) if (re.test(q)) { expression = value; break; }
  q = q.replace(EXPRESSION_STRIP, ' ');

  const words = q.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  if (words.some(w => ME.has(w))) userIds.unshift(meId);
  const uniqueIds = [...new Set(userIds)];
  const scene = sceneWords(words.filter(w => !ME.has(w)).join(' ')).join(' ');

  const filter: PhotoFilter = { userIds: uniqueIds, match: together && uniqueIds.length > 1 ? 'all' : 'any' };
  if (expression) filter.expression = expression;
  if (scene) filter.scene = scene;
  // "photos" alone, or nothing we understood: your own photos
  if (!filter.userIds.length && !filter.expression && !filter.scene) filter.userIds = [meId];
  return { filter, sceneTags: scene ? matchTags(scene, vocabulary) : [], unmatched: [], source: 'keywords' };
}

const PARSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    userIds: { type: 'ARRAY', items: { type: 'STRING' } },
    together: { type: 'BOOLEAN' },
    expression: { type: 'STRING', enum: ['none', ...EXPRESSIONS] },
    scene: { type: 'STRING' },
    sceneTags: { type: 'ARRAY', items: { type: 'STRING' } },
    unmatched: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['userIds', 'together', 'expression', 'scene', 'sceneTags', 'unmatched'],
};

const PARSE_SYSTEM = `You turn a photo search in a group trip app into a filter. Fields:
- userIds: ids of the trip members the photos must show, from the member list. "I", "me", "my", "mine" mean the speaker. "Show me" / "give me" alone is not a person. Match names loosely (nicknames, spelling, Hindi possessives like "Bhavya ki photos"). Empty when no person is named.
- together: true only when the people must appear in the same photo ("X with Y", "together", "both of us"). "X's and Y's photos" is false.
- expression: facial expression of those people, or of anyone when no person is named: smiling/laughing → happy, serious/straight face → neutral, shocked/surprised → surprise; sad, angry, fear, disgust. "none" when not asked.
- scene: what is happening or where, in a few plain words (activity, place, occasion, time of day), e.g. "hiking", "haldi", "conference hall", "sunset at the lake". Empty when not asked.
- sceneTags: tags copied exactly from the trip's tag list that match the scene, including clear synonyms. Empty when there is no scene or nothing fits.
- unmatched: names in the search that are not trip members.`;

// Gemini reads the query with the member list and the trip's tags; the keyword parser takes over on any failure.
export async function parseQuery(query: string, members: SearchMember[], meId: string, vocabulary: string[], gemini?: Gemini): Promise<ParsedQuery> {
  const fallback = () => parseQueryKeywords(query, members, meId, vocabulary);
  if (!gemini?.enabled) return fallback();
  try {
    const roster = members.map(m => `${m.userId}: ${m.name}${m.username ? ` (@${m.username})` : ''}${m.userId === meId ? ' [speaker]' : ''}`).join('\n');
    const out = await gemini.json<{ userIds: string[]; together: boolean; expression: string; scene: string; sceneTags: string[]; unmatched: string[] }>({
      label: 'PhotoSearch',
      model: gemini.models.lite,
      temperature: 0,
      timeoutMs: 8_000,
      schema: PARSE_SCHEMA,
      system: PARSE_SYSTEM,
      prompt: `Members:\n${roster}\n\nTags: ${vocabulary.join(', ') || '(none yet)'}\n\nSearch: ${query}`,
    });
    const known = new Set(members.map(m => m.userId));
    const tags = new Set(vocabulary);
    const userIds = [...new Set((out.userIds ?? []).filter(id => known.has(id)))];
    const scene = typeof out.scene === 'string' ? out.scene.trim().slice(0, MAX_SCENE) : '';
    const filter: PhotoFilter = { userIds, match: out.together && userIds.length > 1 ? 'all' : 'any' };
    if (isExpression(out.expression)) filter.expression = out.expression;
    if (scene) filter.scene = scene;
    const unmatched = (out.unmatched ?? []).map(String).filter(Boolean).slice(0, 5);
    if (!filter.userIds.length && !filter.expression && !filter.scene) {
      // Gemini found nothing it could use: only fall back to "your photos" when no unknown name was asked for
      if (unmatched.length) return { filter: { userIds: [], match: 'any' }, sceneTags: [], unmatched, source: 'gemini' };
      return fallback();
    }
    const sceneTags = scene ? [...new Set([...(out.sceneTags ?? []).map(t => String(t).toLowerCase()).filter(t => tags.has(t)), ...matchTags(scene, vocabulary)])] : [];
    return { filter, sceneTags, unmatched, source: 'gemini' };
  } catch (err) {
    if (!(err instanceof GeminiError)) throw err;
    logger.warn('PhotoSearch', `query parse fell back to keywords: ${err.message}`);
    return fallback();
  }
}

/* Labels */

const EXPRESSION_LABEL: Record<Expression, string> = {
  happy: 'smiling', neutral: 'serious', surprise: 'surprised', sad: 'sad', angry: 'angry', fear: 'scared', disgust: 'disgusted',
};

export function expressionLabel(expression: Expression) {
  return EXPRESSION_LABEL[expression];
}

// "You & Bhavya · smiling · hiking"; "You with Bhavya" when they must be together
export function filterLabel(filter: PhotoFilter, nameOf: (userId: string) => string) {
  const names = filter.userIds.map(nameOf);
  const people = names.length <= 1 ? names.join('')
    : filter.match === 'all' ? `${names.slice(0, -1).join(', ')} with ${names.at(-1)}`
    : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
  return [people, filter.expression ? expressionLabel(filter.expression) : '', filter.scene ?? ''].filter(Boolean).join(' · ') || 'All photos';
}
