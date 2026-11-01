import { createHash } from 'node:crypto';
import type { Lang, Panel } from './types.ts';

// What the narrator says. Written text keeps digits and Roman numerals; the voice gets them spelled out so years and
// royal names come out the way a storyteller would say them.

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const DECADE_TENS = ['', '', 'twenties', 'thirties', 'forties', 'fifties', 'sixties', 'seventies', 'eighties', 'nineties'];

const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`);

/** 1651 → "sixteen fifty-one", 1905 → "nineteen oh five", 1600 → "sixteen hundred" */
export function englishYear(year: number): string {
  const high = Math.floor(year / 100);
  const low = year % 100;
  if (year < 1100 || year > 2099) return String(year);
  if (year >= 2000 && year < 2010) return `two thousand${low ? ` ${ONES[low]}` : ''}`;
  return `${below100(high)} ${low === 0 ? 'hundred' : low < 10 ? `oh ${ONES[low]}` : below100(low)}`;
}

/** 1550s → "fifteen-fifties", 1600s → "sixteen-hundreds" */
function englishDecade(year: number) {
  const tens = Math.floor((year % 100) / 10);
  return `${below100(Math.floor(year / 100))}-${tens === 0 ? 'hundreds' : DECADE_TENS[tens]}`;
}

const HI_BELOW_100 = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
  'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस',
  'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस',
  'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चौवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास',
  'पचास', 'इक्यावन', 'बावन', 'तिरपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
  'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सड़सठ', 'अड़सठ', 'उनहत्तर',
  'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उन्यासी',
  'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी',
  'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पंचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे',
];

/** 1651 → "सोलह सौ इक्यावन" */
export function hindiYear(year: number): string {
  if (year < 1100 || year > 2099) return String(year);
  const high = Math.floor(year / 100);
  const low = year % 100;
  return `${HI_BELOW_100[high]} सौ${low ? ` ${HI_BELOW_100[low]}` : ''}`;
}

const ROMAN: Record<string, [string, string]> = { I: ['the First', 'प्रथम'], II: ['the Second', 'द्वितीय'], III: ['the Third', 'तृतीय'] };

/** The text as it should be read aloud */
export function spokenText(text: string, lang: Lang): string {
  const years = (digits: string) => (lang === 'hi' ? hindiYear(Number(digits)) : englishYear(Number(digits)));
  let out = text;
  if (lang === 'en') {
    out = out.replace(/\b(1[1-9]\d)0s\b/g, (_m, three: string) => englishDecade(Number(`${three}0`)));
    out = out.replace(/\b([A-Z][a-z]+ Singh) (I{1,3})\b/g, (_m, name: string, roman: string) => `${name} ${ROMAN[roman][0]}`);
  } else {
    out = out.replace(/\b([A-Z][a-z]+ Singh) (I{1,3})\b/g, (_m, name: string, roman: string) => `${name} ${ROMAN[roman][1]}`);
  }
  out = out.replace(/\b(1[1-9]\d{2}|20\d{2})\b/g, (digits: string) => years(digits));
  return out;
}

/** The "director’s notes" that steer Gemini speech. Plain "narrate like…" instructions get read aloud; this layout doesn't. */
export function directorNotes(siteName: string, lang: Lang): string {
  const accent = lang === 'hi' ? 'natural Hindi as spoken in Rajasthan' : 'soft, clear Indian English';
  return [
    '# AUDIO PROFILE: The Kavadiya Bhat',
    `## THE SCENE: An evening in a Mewar village. The storyteller has opened the painted doors of his Kaavad shrine for the children and grandparents gathered round him, and is telling the tale of ${siteName}.`,
    '### DIRECTOR’S NOTES',
    `Style: warm, unhurried and a little playful; every sentence is given room to breathe. Pacing: slow and measured, with gentle pauses at the full stops. Accent: ${accent}.`,
    '#### TRANSCRIPT',
  ].join('\n');
}

/** One prompt per panel for Gemini speech */
export const panelPrompts = (panels: Panel[], siteName: string, lang: Lang) =>
  panels.map(panel => `${directorNotes(siteName, lang)}\n${spokenText(panel.text, lang)}`);

/** Identifies the narration for a given text, so stored audio never plays against words it wasn't recorded for */
export function narrationHash(panels: Panel[], lang: Lang, voice: string): string {
  const script = panels.map(panel => spokenText(panel.text, lang)).join('\n\n');
  return createHash('sha256').update(`${lang}\n${voice}\n${script}`).digest('hex').slice(0, 16);
}
