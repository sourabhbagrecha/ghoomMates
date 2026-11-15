import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { SITES, SITE_BY_ID } from '../../src/heritage/sites.ts';
import { basicStory } from '../../src/stories/basic.ts';
import { CURATED } from '../../src/stories/curated/index.ts';
import { STATIC_NARRATION, staticNarration } from '../../src/stories/curated/narration.ts';
import { gradeFor, scoreQuiz, shuffleQuiz } from '../../src/stories/quiz.ts';
import { readTale } from '../../src/stories/tales.ts';
import { MAX_PANEL_WORDS, QUIZ_SIZE } from '../../src/stories/types.ts';

const PUBLIC = resolve(import.meta.dirname, '../../../frontend/public');
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

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

  test('shipped narration has a start for every panel and exists on disk', () => {
    expect(Object.keys(STATIC_NARRATION).length >= 6).toBe(true);
    for (const [siteId, langs] of Object.entries(STATIC_NARRATION)) {
      for (const lang of ['en', 'hi'] as const) {
        const entry = langs[lang];
        if (!entry) continue;
        const panels = CURATED.get(siteId)![lang].panels;
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

  test('a story with a different number of panels does not use the recording', () => {
    const panels = CURATED.get('bagore-ki-haveli')!.hi.panels.slice(0, 3);
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

describe('prepared tales from the batch', () => {
  const good = {
    city: 'Udaipur', site_id: 'gangaur-ghat', lang: 'hi', audience: 'family', title: ' गणगौर घाट ',
    panels: [{ heading: 'एक', text: 'पहला भाग', look_for: 'सीढ़ियाँ', art_key: 'tales/udaipur/gangaur-ghat/1.jpg' }, { heading: 'दो', text: 'दूसरा भाग', art_key: '' }],
    quiz: [{ question: 'कौन?', options: ['क', 'ख'], answer_index: 1, fact: 'ख' }],
    care_note: 'धीरे चलें',
    narration: { audio_key: 'tales/udaipur/gangaur-ghat/hi-family.m4a', duration_sec: 40, marks: [0, 18.5] },
  };

  test('a good document becomes a story, with its bucket keys kept for signing', () => {
    const read = readTale(good);
    if (!('tale' in read)) throw new Error(read.problem);
    expect(read.tale.siteId).toBe('gangaur-ghat');
    expect(read.tale.audience).toBe('family');
    expect(read.tale.body.title).toBe('गणगौर घाट');
    expect(read.tale.body.panels[1]).toEqual({ heading: 'दो', text: 'दूसरा भाग', lookFor: '' });
    expect(read.tale.body.quiz[0].answerIndex).toBe(1);
    expect(read.tale.artKeys).toEqual(['tales/udaipur/gangaur-ghat/1.jpg', null]);
    expect(read.tale.narration).toEqual({ audioKey: 'tales/udaipur/gangaur-ghat/hi-family.m4a', durationSec: 40, marks: [0, 18.5] });
  });

  test('narration that does not line up with the panels is dropped, the story is kept', () => {
    for (const narration of [{ ...good.narration, marks: [0] }, { ...good.narration, marks: [10, 5] }, { ...good.narration, duration_sec: 0 }, { ...good.narration, audio_key: '' }, null]) {
      const read = readTale({ ...good, narration });
      expect('tale' in read && read.tale.narration).toBe(null);
    }
  });

  test('documents the app cannot show are refused with the reason', () => {
    const broken = [
      { ...good, lang: 'fr' },
      { ...good, audience: 'aliens' },
      { ...good, title: '' },
      { ...good, panels: [] },
      { ...good, panels: [{ heading: 'x' }] },
      { ...good, quiz: [] },
      { ...good, quiz: [{ question: 'q', options: ['a', 'b'], answer_index: 2 }] },
      { ...good, quiz: [{ question: 'q', options: ['a'], answer_index: 0 }] },
      null,
    ];
    for (const doc of broken) expect('problem' in readTale(doc)).toBe(true);
  });
});
