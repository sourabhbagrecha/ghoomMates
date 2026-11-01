import { bestWindow, formatTime } from '../heritage/crowd.ts';
import { SITES, type HeritageSite, type SiteKind } from '../heritage/sites.ts';
import { shuffleQuiz } from './quiz.ts';
import type { StoryBody } from './types.ts';

// The story for a site that has no hand-written telling, built from what the heritage module knows: its one-line history,
// when it is quietest and how to visit lightly. Used when Gemini is off, slow or not trusted, so every site still opens.

const KIND_LABEL: Record<SiteKind, string> = {
  Palace: 'a palace', Temple: 'a temple', Haveli: 'one of the grand old mansions of Mewar’s nobles', Ghat: 'one of the old stone stairways down to the water', Garden: 'a garden',
  Lake: 'a lake', Viewpoint: 'a viewpoint', Museum: 'a museum', Crafts: 'a crafts village', Bazaar: 'a bazaar',
};

const KIND_SHORT: Record<SiteKind, string> = {
  Palace: 'A palace', Temple: 'A temple', Haveli: 'A haveli', Ghat: 'A ghat', Garden: 'A garden', Lake: 'A lake', Viewpoint: 'A viewpoint',
  Museum: 'A museum', Crafts: 'A crafts village', Bazaar: 'A bazaar',
};

const LOOK_FOR: Record<SiteKind, string> = {
  Palace: 'Look up at the balconies and domes. Which part do you think is the oldest?',
  Temple: 'Notice the carvings around the doorway and on the spire above.',
  Haveli: 'Look for carved balconies, painted walls and coloured glass.',
  Ghat: 'Watch where the steps meet the water and see who comes down to it.',
  Garden: 'Find the oldest tree and the fountain or pool nearest you.',
  Lake: 'Look across the water and find the farthest hill you can see.',
  Viewpoint: 'Turn slowly in a circle and name three things you can see.',
  Museum: 'Find the smallest object in the room and guess what it was for.',
  Crafts: 'Find an artisan at work and watch their hands for one minute.',
  Bazaar: 'Follow your nose: what is the first smell you notice?',
};

const clock = (minutes: number) => formatTime(minutes).replace(/^0/, '');
const hash = (text: string) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export function basicStory(site: HeritageSite): StoryBody {
  const best = bestWindow(site, null);
  const peakHour = site.curve.reduce((peak, level, hour) => (level > site.curve[peak] ? hour : peak), 0);
  const quiet = best ? clock(best.minutes) : null;
  const busiest = clock(peakHour * 60);

  const panels: StoryBody['panels'] = [
    {
      heading: site.name,
      text: `Khamma ghani! Welcome to ${site.name}, ${KIND_LABEL[site.kind]} in ${site.city}. ${site.story}`,
      lookFor: LOOK_FOR[site.kind],
    },
    {
      heading: 'When to come',
      text: quiet
        ? `Ghoommates’ crowd forecast says ${site.name} is usually quietest around ${quiet} and busiest around ${busiest}. Arrive in the quiet window and your whole squad gets more space, while the place gets a little room to breathe.`
        : `Ghoommates’ crowd forecast says ${site.name} is usually busiest around ${busiest}. Come away from that hour and your whole squad gets more space, while the place gets a little room to breathe.`,
      lookFor: 'Count the people around you. Is it as quiet as the forecast promised?',
    },
    {
      heading: 'Visit lightly',
      text: `${site.care} A squad of friends can leave a place better than it found it, and every small choice you make together adds up.`,
      lookFor: 'Spot one thing your squad can do right now to leave this place as you found it.',
    },
  ];

  const otherKinds = (Object.keys(KIND_SHORT) as SiteKind[]).filter(k => k !== site.kind).sort((a, b) => hash(site.id + a) - hash(site.id + b));
  const otherCare = SITES.filter(s => s.id !== site.id && s.care !== site.care).sort((a, b) => hash(site.id + a.id) - hash(site.id + b.id));
  const otherHours = [...new Set(site.curve.map((_, hour) => hour).filter(hour => hour !== peakHour && site.curve[hour] > 0).map(hour => clock(hour * 60)))]
    .filter(time => time !== quiet && time !== busiest);
  const hours = [quiet ?? clock((peakHour + 4) * 60), busiest, otherHours[hash(site.id) % Math.max(1, otherHours.length)] ?? clock(((peakHour + 8) % 24) * 60)];

  const quiz = [
    { question: `What kind of place is ${site.name}?`, options: [KIND_SHORT[site.kind], KIND_SHORT[otherKinds[0]], KIND_SHORT[otherKinds[1]]], answerIndex: 0, fact: site.story },
    { question: `When is ${site.name} usually quietest?`, options: hours, answerIndex: 0, fact: quiet ? `Around ${quiet}. It is busiest around ${busiest}.` : `It is busiest around ${busiest}.` },
    { question: `Which tip fits ${site.name}?`, options: [site.care, otherCare[0].care, otherCare[1].care], answerIndex: 0, fact: site.care },
  ];

  return { title: site.name, panels, quiz: shuffleQuiz(quiz, site.id), careNote: site.care };
}
