import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { wavFromPcm } from '../../src/gemini.ts';
import { SITES, SITE_BY_ID } from '../../src/heritage/sites.ts';
import { vibeBucket, vibeNote } from '../../src/stories/audience.ts';
import { basicStory } from '../../src/stories/basic.ts';
import { CURATED } from '../../src/stories/curated/index.ts';
import { STATIC_NARRATION } from '../../src/stories/curated/narration.ts';
import { StoryRejected, buildPrompt, cleanStory, limitWords, wordCount } from '../../src/stories/generate.ts';
import { NARRATOR_VOICE, staticNarration } from '../../src/stories/narration.ts';
import { gradeFor, scoreQuiz, shuffleQuiz } from '../../src/stories/quiz.ts';
import { directorNotes, englishYear, hindiYear, narrationHash, spokenText } from '../../src/stories/speech.ts';
import { MAX_PANEL_WORDS, QUIZ_SIZE } from '../../src/stories/types.ts';
import { joinRecordings, readWav, trimSilence, wavSeconds } from '../../src/stories/wav.ts';

const PUBLIC = resolve(import.meta.dirname, '../../../frontend/public');
const RATE = 24_000;

/** A mono 16-bit tone, with optional silence either side */
function tone(seconds: number, { lead = 0, tail = 0 } = {}) {
  const pcm = Buffer.alloc(Math.round((lead + seconds + tail) * RATE) * 2);
  for (let i = Math.round(lead * RATE); i < Math.round((lead + seconds) * RATE); i++) pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 12)), i * 2);
  return wavFromPcm(pcm, RATE);
}

describe('curated stories', () => {
  test('there are at least six, each with both languages, four panels and a three-question quiz', () => {
    expect(CURATED.size >= 6).toBe(true);
    for (const site of CURATED.values()) {
      expect(SITE_BY_ID.has(site.siteId)).toBe(true);
      expect(site.art).toHaveLength(4);
      for (const lang of ['en', 'hi'] as const) {
        const story = site[lang];
        expect(story.panels).toHaveLength(4);
        expect(story.quiz).toHaveLength(QUIZ_SIZE);
        expect(story.careNote.length > 10).toBe(true);
        for (const panel of story.panels) {
          expect(wordCount(panel.text) <= MAX_PANEL_WORDS).toBe(true);
          expect(panel.heading.length > 0 && panel.lookFor.length > 0).toBe(true);
        }
        for (const q of story.quiz) {
          expect(q.options).toHaveLength(3);
          expect(new Set(q.options).size).toBe(3);
          expect(q.answerIndex >= 0 && q.answerIndex < 3).toBe(true);
          expect(q.fact.length > 0).toBe(true);
        }
        // The answers don't all sit in the same place
        expect(new Set(story.quiz.map(q => q.answerIndex)).size > 1).toBe(true);
      }
    }
  });

  test('Hindi is Devanagari and the years match the English telling', () => {
    const years = (text: string) => [...new Set(text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) ?? [])].sort();
    for (const site of CURATED.values()) {
      const hindi = site.hi.panels.map(p => p.text).join(' ');
      expect((hindi.match(/[ऀ-ॿ]/g) ?? []).length > hindi.length / 2).toBe(true);
      const english = site.en.panels.map(p => p.text).join(' ');
      // Hindi may say "around 1550" where English says "the 1550s", but it never adds a year of its own
      for (const year of years(hindi)) expect(years(english).some(e => e.slice(0, 3) === year.slice(0, 3)) || english.includes(year)).toBe(true);
    }
  });

  test('legends are told as legends', () => {
    // The facts a historian would not stand behind stay marked as tradition
    const english = (id: string) => CURATED.get(id)!.en.panels.map(p => p.text).join(' ');
    expect(/legend says/i.test(english('city-palace'))).toBe(true);
    expect(/legend says/i.test(english('saheliyon-ki-bari'))).toBe(true);
    expect(/legend says/i.test(english('sajjangarh'))).toBe(true);
    expect(/legend says/i.test(english('pichola-boat'))).toBe(true);
    expect(/is said/i.test(english('pichola-boat'))).toBe(true);
  });

  test('the painted panels are shipped with the frontend', () => {
    for (const site of CURATED.values()) {
      for (const art of site.art) expect(existsSync(resolve(PUBLIC, `.${art}`))).toBe(true);
    }
  });

  test('shipped narration matches the current words and exists on disk', () => {
    expect(Object.keys(STATIC_NARRATION).length >= 6).toBe(true);
    for (const [siteId, langs] of Object.entries(STATIC_NARRATION)) {
      for (const lang of ['en', 'hi'] as const) {
        const entry = langs[lang];
        if (!entry) continue;
        const panels = CURATED.get(siteId)![lang].panels;
        expect(entry.hash).toBe(narrationHash(panels, lang, NARRATOR_VOICE));
        expect(entry.marks).toHaveLength(panels.length);
        expect(entry.marks[0]).toBe(0);
        expect(entry.marks.every((m, i) => i === 0 || m > entry.marks[i - 1])).toBe(true);
        expect(entry.marks.at(-1)! < entry.durationSec).toBe(true);
        expect(existsSync(resolve(PUBLIC, `stories/${siteId}/${lang}.m4a`))).toBe(true);
        expect(staticNarration(siteId, lang, panels)?.url).toBe(`/stories/${siteId}/${lang}.m4a`);
      }
    }
    // The Hindi demo story at Bagore ki Haveli is recorded
    expect(!!STATIC_NARRATION['bagore-ki-haveli']?.hi).toBe(true);
  });

  test('an edited story stops using its old recording', () => {
    const panels = CURATED.get('bagore-ki-haveli')!.hi.panels.map(p => ({ ...p }));
    panels[0].text += ' और एक वाक्य।';
    expect(staticNarration('bagore-ki-haveli', 'hi', panels)).toBe(null);
  });
});

describe('stories built from site notes', () => {
  test('every site opens: three panels, a three-question quiz with distinct options', () => {
    for (const site of SITES) {
      const story = basicStory(site);
      expect(story.panels).toHaveLength(3);
      expect(story.quiz).toHaveLength(QUIZ_SIZE);
      for (const panel of story.panels) expect(wordCount(panel.text) <= MAX_PANEL_WORDS).toBe(true);
      for (const q of story.quiz) {
        expect(new Set(q.options).size).toBe(3);
        expect(q.options[q.answerIndex].length > 0).toBe(true);
      }
      // The first question is about the kind of place, and its answer is right
      expect(story.quiz[0].options[story.quiz[0].answerIndex].toLowerCase().includes(site.kind.toLowerCase())).toBe(true);
    }
  });
});

describe('narration text', () => {
  test('years and royal numerals are spelled out for the voice', () => {
    expect(englishYear(1651)).toBe('sixteen fifty-one');
    expect(englishYear(1905)).toBe('nineteen oh five');
    expect(englishYear(1600)).toBe('sixteen hundred');
    expect(spokenText('In the 1550s Maharana Udai Singh II built it in 1559.', 'en')).toBe('In the fifteen-fifties Maharana Udai Singh the Second built it in fifteen fifty-nine.');
    expect(spokenText('the 1600s', 'en')).toBe('the sixteen-hundreds');
    expect(hindiYear(1651)).toBe('सोलह सौ इक्यावन');
    expect(hindiYear(1710)).toBe('सत्रह सौ दस');
    expect(spokenText('सन् 1889 में', 'hi')).toBe('सन् अठारह सौ नवासी में');
  });

  test('the director’s notes steer the voice without being read out', () => {
    const notes = directorNotes('City Palace', 'en');
    expect(notes.includes('#### TRANSCRIPT')).toBe(true);
    expect(/narrate like/i.test(notes)).toBe(false);
    expect(directorNotes('Bagore ki Haveli', 'hi').includes('Hindi')).toBe(true);
  });

  test('the hash changes with the words, the language and the voice', () => {
    const panels = CURATED.get('city-palace')!.en.panels;
    const base = narrationHash(panels, 'en', 'Algenib');
    expect(narrationHash(panels, 'en', 'Algenib')).toBe(base);
    expect(narrationHash(panels, 'en', 'Charon') === base).toBe(false);
    expect(narrationHash([{ ...panels[0], text: `${panels[0].text}!` }, ...panels.slice(1)], 'en', 'Algenib') === base).toBe(false);
  });
});

describe('joining recordings', () => {
  test('trims the silence either side of a recording', () => {
    const { pcm } = readWav(tone(1, { lead: 0.8, tail: 0.9 }));
    const trimmed = trimSilence(pcm, RATE);
    // 1 s of tone plus the 120 ms of breath kept on each side
    expect(Math.abs(trimmed.length / 2 / RATE - 1.24) < 0.03).toBe(true);
    expect(trimSilence(Buffer.alloc(RATE), RATE).length).toBe(0);
  });

  test('marks where each panel starts, with a pause between', () => {
    const joined = joinRecordings([tone(2, { lead: 0.5 }), tone(3, { tail: 0.5 }), tone(1)], { gapMs: 600 });
    // 2.12 s (a 0.12 s breath before the tone) + 0.6 s gap, then 3.12 s + 0.6 s gap, then 1 s
    expect(joined.marks).toEqual([0, 2.7, 6.4]);
    expect(joined.durationSec).toBe(7.4);
    expect(Math.abs(wavSeconds(joined.wav) - joined.durationSec) < 0.06).toBe(true);
    expect(joinRecordings([tone(1)]).marks).toEqual([0]);
  });

  test('refuses a silent recording and mixed sample rates', () => {
    expect(() => joinRecordings([tone(1), wavFromPcm(Buffer.alloc(RATE * 2), RATE)])).toThrow();
    expect(() => joinRecordings([tone(1), wavFromPcm(Buffer.alloc(16_000 * 2), 16_000)])).toThrow();
    expect(() => readWav(Buffer.from('not a wav file at all, not even close, really not a wav file'))).toThrow();
  });
});

describe('quiz scoring', () => {
  const quiz = CURATED.get('city-palace')!.en.quiz;

  test('scores each answer and grades the round', () => {
    const right = quiz.map(q => q.answerIndex);
    expect(scoreQuiz(quiz, right).score).toBe(3);
    expect(scoreQuiz(quiz, right).grade).toBe('gold');
    const twoOfThree = scoreQuiz(quiz, [right[0], right[1], (right[2] + 1) % 3]);
    expect(twoOfThree.score).toBe(2);
    expect(twoOfThree.grade).toBe('silver');
    expect(twoOfThree.results.map(r => r.correct)).toEqual([true, true, false]);
    const none = scoreQuiz(quiz, quiz.map(q => (q.answerIndex + 1) % 3));
    expect(none.score).toBe(0);
    expect(none.grade).toBe('bronze');
  });

  test('missing, null and out-of-range answers are wrong', () => {
    expect(scoreQuiz(quiz, []).score).toBe(0);
    expect(scoreQuiz(quiz, [null, 9, 'x']).score).toBe(0);
    expect(gradeFor(1, 3)).toBe('bronze');
  });

  test('shuffling keeps the right answer right and is stable', () => {
    const odd = [{ question: 'Q1', options: ['right', 'b', 'c'], answerIndex: 0, fact: 'f' }, { question: 'Q2', options: ['right', 'b', 'c'], answerIndex: 0, fact: 'f' }, { question: 'Q3', options: ['right', 'b', 'c'], answerIndex: 0, fact: 'f' }];
    const shuffled = shuffleQuiz(odd, 'seed');
    expect(shuffled).toEqual(shuffleQuiz(odd, 'seed'));
    for (const q of shuffled) expect(q.options[q.answerIndex]).toBe('right');
    for (const q of shuffled) expect([...q.options].sort()).toEqual(['b', 'c', 'right']);
  });
});

describe('the squad’s vibe', () => {
  const vibe = (scores: Record<string, number>) => ({ adventure: 0.4, food: 0.4, nightlife: 0.4, culture: 0.4, chill: 0.4, shops: 0.4, ...scores });

  test('is the two strongest tastes, in a stable order', () => {
    expect(vibeBucket([vibe({ food: 0.9, culture: 0.8 }), vibe({ food: 0.7, culture: 0.9, chill: 0.6 })])).toBe('culture+food');
    expect(vibeBucket([vibe({ chill: 0.9 })])).toBe('chill');
  });

  test('is balanced when nothing stands out, and empty when nobody took the quiz', () => {
    expect(vibeBucket([vibe({})])).toBe('balanced');
    expect(vibeBucket([])).toBe('');
    expect(vibeBucket([null, {}, { food: 1 }])).toBe('');
  });

  test('turns into a sentence for the prompt', () => {
    expect(vibeNote('culture+food').includes('culture and food')).toBe(true);
    expect(vibeNote('balanced').includes('balanced')).toBe(true);
    expect(vibeNote('')).toBe('');
  });
});

/** Whether the retelling was refused as untrustworthy (rather than failing some other way) */
function rejected(run: () => unknown) {
  try {
    run();
  } catch (err) {
    return err instanceof StoryRejected;
  }
  return false;
}

describe('Gemini retellings', () => {
  const site = SITE_BY_ID.get('jagdish-temple')!;
  const classic = CURATED.get('jagdish-temple')!.en;
  const retold = () => ({
    title: 'Steps to Jagannath',
    panels: classic.panels.map(p => ({ heading: p.heading, text: p.text.replace('Khamma ghani!', 'Namaste!'), lookFor: p.lookFor })),
    quiz: classic.quiz.map(q => ({ question: q.question, options: [...q.options], answerIndex: q.answerIndex, fact: q.fact })),
    careNote: 'Cover your shoulders and leave your shoes at the steps.',
  });
  const clean = (raw: unknown, lang: 'en' | 'hi' = 'en') => cleanStory(raw, { site, lang, classic, fallbackCare: site.care, seed: 'test' });

  test('a good answer is kept, with its quiz answers still right', () => {
    const story = clean(retold());
    expect(story.panels).toHaveLength(4);
    expect(story.quiz).toHaveLength(QUIZ_SIZE);
    story.quiz.forEach((q, i) => expect(q.options[q.answerIndex]).toBe(classic.quiz[i].options[classic.quiz[i].answerIndex]));
    expect(story.careNote).toBe('Cover your shoulders and leave your shoes at the steps.');
  });

  test('a year the facts do not contain is rejected', () => {
    const raw = retold();
    raw.panels[1].text += ' It was restored in 1887 after a fire.';
    expect(rejected(() => clean(raw))).toBe(true);
  });

  test('a wrong answer may carry any year, a right one may not', () => {
    const distractor = retold();
    distractor.quiz[0] = { question: 'When did Maharana Jagat Singh I finish the temple?', options: ['1751', '1651', '1551'], answerIndex: 1, fact: 'He finished it in 1651.' };
    expect(clean(distractor).quiz[0].options.includes('1751')).toBe(true);
    const wrong = retold();
    wrong.quiz[0] = { question: 'When did Maharana Jagat Singh I finish the temple?', options: ['1751', '1651', '1551'], answerIndex: 0, fact: 'He finished it in 1751.' };
    expect(rejected(() => clean(wrong))).toBe(true);
  });

  test('Hindi that comes back in English is rejected', () => {
    expect(rejected(() => clean(retold(), 'hi'))).toBe(true);
  });

  test('too few panels or quiz questions is rejected', () => {
    const fewPanels = retold();
    fewPanels.panels = fewPanels.panels.slice(0, 2);
    expect(rejected(() => clean(fewPanels))).toBe(true);
    const fewQuestions = retold();
    fewQuestions.quiz = fewQuestions.quiz.slice(0, 2);
    expect(rejected(() => clean(fewQuestions))).toBe(true);
    const badQuestion = retold();
    badQuestion.quiz[0].answerIndex = 5;
    expect(rejected(() => clean(badQuestion))).toBe(true);
    expect(rejected(() => clean(null))).toBe(true);
  });

  test('a long panel is cut back to whole sentences', () => {
    const raw = retold();
    raw.panels[0].text = `${raw.panels[0].text} ${'Another sentence with a handful of words in it. '.repeat(8)}`;
    const story = clean(raw);
    expect(wordCount(story.panels[0].text) <= MAX_PANEL_WORDS).toBe(true);
    expect(story.panels[0].text.endsWith('.')).toBe(true);
    expect(limitWords('One very short sentence.', 70)).toBe('One very short sentence.');
    expect(limitWords(`${'word '.repeat(80)}.`, 70)).toBe(null);
  });

  test('the prompt carries only the facts we hold, the audience and the squad', () => {
    const prompt = buildPrompt({ site, lang: 'hi', audience: 'family', bucket: 'culture+food', classic });
    expect(prompt.includes(site.story)).toBe(true);
    expect(prompt.includes('Devanagari')).toBe(true);
    expect(prompt.includes('children')).toBe(true);
    expect(prompt.includes('culture and food')).toBe(true);
    expect(prompt.includes(classic.panels[0].text)).toBe(true);
    // The only years it may write are the ones in the facts
    expect(prompt.includes('YEARS YOU MAY WRITE (no others): 1651')).toBe(true);
    expect(buildPrompt({ site: SITE_BY_ID.get('gangaur-ghat')!, lang: 'en', audience: 'couple', bucket: '' }).includes('Do not write any year')).toBe(true);
  });
});
