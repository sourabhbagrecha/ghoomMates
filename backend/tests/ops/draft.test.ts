import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import type { Gemini } from '../../src/gemini.ts';
import { SITES } from '../../src/heritage/sites.ts';
import { cleanMessages, draftMessages, promptFor, templateMessages, type DraftFacts } from '../../src/ops/draft.ts';
import { DEVANAGARI, HINDI_NAMES, enTime, enWindow, hiTime, hiWindow } from '../../src/ops/hindi.ts';

const facts: DraftFacts = {
  siteId: 'city-palace', siteName: 'City Palace', startMinutes: 600, endMinutes: 720, level: 'packed',
  alternativeSite: { id: 'bagore-ki-haveli', name: 'Bagore ki Haveli', level: 31, label: 'quiet', km: 0.4, calmUntilMinutes: 1080 },
  alternativeTime: { hour: 9, minutes: 570, time: '09:30 AM', level: 39, label: 'quiet' },
};

function fakeGemini(json: Gemini['json'], enabled = true): Gemini {
  return {
    enabled, imageEnabled: false,
    models: { lite: 'lite', smart: 'smart', image: 'image', tts: 'tts' },
    json,
    image: async () => { throw new Error('not used'); },
    speech: async () => { throw new Error('not used'); },
  };
}

describe('Hindi and English wording', () => {
  test('times and windows read the way people say them', () => {
    expect(enTime(570)).toBe('9:30 AM');
    expect(enTime(720)).toBe('12 PM');
    expect(enWindow(600, 720)).toBe('10 AM–12 PM');
    expect(enWindow(540, 660)).toBe('9–11 AM');
    expect(enWindow(1080, 1200)).toBe('6–8 PM');
    expect(hiTime(570)).toBe('सुबह 9:30 बजे');
    expect(hiWindow(600, 720)).toBe('सुबह 10 से दोपहर 12 बजे तक');
    expect(hiWindow(1080, 1200)).toBe('शाम 6 से रात 8 बजे तक');
    expect(hiWindow(780, 840)).toBe('दोपहर 1 से 2 बजे तक');
  });

  test('every heritage site has a Devanagari name', () => {
    for (const site of SITES) expect(DEVANAGARI.test(HINDI_NAMES[site.id] ?? '')).toBe(true);
  });
});

describe('the template fallback', () => {
  test('names the site, window, calmer site and calmer time in both languages', () => {
    const { messageEn, messageHi } = templateMessages(facts);
    expect(messageEn).toBe('Heads up: City Palace is expected packed 10 AM–12 PM. Bagore ki Haveli is calm then, or come at 9:30 AM for a quieter visit.');
    expect(DEVANAGARI.test(messageHi)).toBe(true);
    expect(messageHi.includes('सिटी पैलेस')).toBe(true);
    expect(messageHi.includes('बागोर की हवेली')).toBe(true);
    expect(messageHi.includes('सुबह 10 से दोपहर 12 बजे तक')).toBe(true);
    expect(messageHi.includes('सुबह 9:30 बजे')).toBe(true);
  });

  test('busy is gentler than packed, and each missing alternative has its own sentence', () => {
    expect(templateMessages({ ...facts, level: 'busy' }).messageEn.includes('expected busy')).toBe(true);
    const siteOnly = templateMessages({ ...facts, alternativeTime: null });
    expect(siteOnly.messageEn.includes('staying quiet till 6 PM')).toBe(true);
    const timeOnly = templateMessages({ ...facts, alternativeSite: null });
    expect(timeOnly.messageEn.endsWith('Coming at 9:30 AM is quieter.')).toBe(true);
    const neither = templateMessages({ ...facts, alternativeSite: null, alternativeTime: null });
    expect(neither.messageEn.endsWith('Allow a little extra time at the gate.')).toBe(true);
    expect(DEVANAGARI.test(neither.messageHi)).toBe(true);
  });

  test('no message is alarming or red-flagged', () => {
    const { messageEn } = templateMessages(facts);
    expect(/danger|warning|avoid|unsafe/i.test(messageEn)).toBe(false);
  });
});

describe('validating what Gemini returns', () => {
  const en = 'Heads up: City Palace is expected packed from 10 AM to 12 PM. Try Bagore ki Haveli instead.';
  const hi = 'ध्यान दें: सुबह 10 से दोपहर 12 बजे तक सिटी पैलेस में बहुत भीड़ रहेगी। बागोर की हवेली जाएँ।';

  test('accepts an English and a Hindi message and tidies the spacing', () => {
    expect(cleanMessages({ messageEn: `  ${en}\n`, messageHi: hi })).toEqual({ messageEn: en, messageHi: hi });
  });

  test('rejects missing, short, wrong-script and over-long messages', () => {
    expect(cleanMessages(null)).toBe(null);
    expect(cleanMessages({ messageEn: en })).toBe(null);
    expect(cleanMessages({ messageEn: 'Busy.', messageHi: hi })).toBe(null);
    expect(cleanMessages({ messageEn: hi, messageHi: hi })).toBe(null);
    expect(cleanMessages({ messageEn: en, messageHi: en })).toBe(null);
    expect(cleanMessages({ messageEn: en.repeat(5), messageHi: hi })).toBe(null);
    expect(cleanMessages({ messageEn: 42, messageHi: hi })).toBe(null);
  });

  test('rejects wording tied to a day, and Hindi that is really English', () => {
    expect(cleanMessages({ messageEn: 'Heads up: City Palace will be packed tomorrow 10 AM–12 PM.', messageHi: hi })).toBe(null);
    expect(cleanMessages({ messageEn: en, messageHi: 'ध्यान दें: कल सुबह 10 से दोपहर 12 बजे तक सिटी पैलेस में बहुत भीड़ रहेगी।' })).toBe(null);
    expect(cleanMessages({ messageEn: en, messageHi: 'ध्यान दें: Or visit Jagdish Temple at 7 AM instead, when it is calmer.' })).toBe(null);
    // "कला" (as in Lok Kala Mandal) contains "कल" but is not "tomorrow"
    expect(cleanMessages({ messageEn: en, messageHi: 'ध्यान दें: भारतीय लोक कला मंडल में शाम 6 से 7 बजे तक काफ़ी भीड़ रहेगी।' })?.messageHi.includes('कला')).toBe(true);
  });

  test('the prompt hands Gemini the facts and the baseline wording to polish', () => {
    const prompt = promptFor(facts);
    expect(prompt.includes('Site: City Palace (Hindi: सिटी पैलेस)')).toBe(true);
    expect(prompt.includes('Expected crowd: packed')).toBe(true);
    expect(prompt.includes('Window: 10 AM–12 PM (Hindi: सुबह 10 से दोपहर 12 बजे तक)')).toBe(true);
    expect(prompt.includes('Bagore ki Haveli (Hindi: बागोर की हवेली) stays calm through that window, quiet until 6 PM')).toBe(true);
    expect(prompt.includes('City Palace is calmer at 9:30 AM (Hindi: सुबह 9:30 बजे)')).toBe(true);
    expect(prompt.includes(`English draft: ${templateMessages(facts).messageEn}`)).toBe(true);
    expect(promptFor({ ...facts, alternativeSite: null, alternativeTime: null }).includes('There is no calmer option')).toBe(true);
  });
});

describe('drafting', () => {
  test('uses Gemini when it answers well', async () => {
    const gemini = fakeGemini(async () => ({
      messageEn: 'City Palace will be packed 10 AM–12 PM. Bagore ki Haveli is calm, or arrive at 9:30 AM.',
      messageHi: 'सुबह 10 से दोपहर 12 बजे सिटी पैलेस में बहुत भीड़ रहेगी। बागोर की हवेली शांत है।',
    }) as never);
    const drafted = await draftMessages(gemini, facts);
    expect(drafted.source).toBe('gemini');
    expect(drafted.messageEn.startsWith('City Palace will be packed')).toBe(true);
  });

  test('falls back to the template when Gemini is off, errors, or answers badly', async () => {
    const template = templateMessages(facts);
    const off = await draftMessages(undefined, facts);
    expect(off.source).toBe('template');
    expect(off.messageEn).toBe(template.messageEn);
    expect((await draftMessages(fakeGemini(async () => ({}) as never, false), facts)).source).toBe('template');
    expect((await draftMessages(fakeGemini(async () => { throw new Error('quota'); }), facts)).source).toBe('template');
    expect((await draftMessages(fakeGemini(async () => ({ messageEn: 'ok ok ok ok ok ok ok ok', messageHi: 'no hindi here at all' }) as never), facts)).source).toBe('template');
  });
});
