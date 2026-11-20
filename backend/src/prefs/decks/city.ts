// Trip decks for the cities with a catalogue: every guide experience in voice/experiences.ts as a swipe card, plus
// (Udaipur) a few maker workshops and a farm-to-table thali. Built from the catalogues, so a new experience gets a
// card without touching this file; EXTRAS only adds a short label, a couple of specific tags and an icon.
import { HOSTS } from '../../hospitality/partners.ts';
import { CRAFT_BY_ID } from '../../makers/crafts.ts';
import { MAKER_BY_ID } from '../../makers/makers.ts';
import { EXPERIENCES, minutesOf, type CatalogueExperience, type ExperienceCity, type ExperienceTag } from '../../voice/experiences.ts';
import type { Card, StyleKey } from '../taste.ts';

const EXTRAS: Record<string, { label: string; tags: string[]; icon: string }> = {
  // Goa
  'dudhsagar-spice-trek': { label: 'Waterfall trek', tags: ['waterfalls', 'treks'], icon: 'mountain' },
  'fontainhas-heritage-walk': { label: 'Heritage lanes walk', tags: ['heritage-walks', 'bakeries'], icon: 'landmark' },
  'saligao-fish-curry-class': { label: 'Fish curry class', tags: ['cooking', 'seafood'], icon: 'chef-hat' },
  'mapusa-market-food-trail': { label: 'Market food trail', tags: ['markets', 'street-food'], icon: 'shopping-bag' },
  'chorao-kayak-birding': { label: 'Sunrise kayak', tags: ['kayaking', 'birding'], icon: 'sailboat' },
  'anjuna-flea-market-crawl': { label: 'Flea market crawl', tags: ['markets', 'bargains'], icon: 'shopping-bag' },
  'old-goa-churches-walk': { label: 'Old Goa churches', tags: ['churches', 'heritage'], icon: 'landmark' },
  'arambol-sunset-drum-circle': { label: 'Sunset drum circle', tags: ['live-music', 'sunsets'], icon: 'music' },
  'sinquerim-dolphin-cruise': { label: 'Dolphin boat ride', tags: ['boats', 'wildlife'], icon: 'sailboat' },
  'chapora-fort-sunset': { label: 'Fort sunset hike', tags: ['forts', 'sunsets'], icon: 'castle' },
  'divar-island-cycling': { label: 'Island cycle ride', tags: ['cycling', 'villages'], icon: 'bike' },
  'palolem-butterfly-island': { label: 'Canoe to a cove', tags: ['kayaking', 'beaches'], icon: 'sailboat' },
  'baga-night-out': { label: 'Baga night out', tags: ['clubs', 'live-music'], icon: 'party-popper' },
  'cashew-feni-distillery': { label: 'Feni distillery', tags: ['distilleries', 'tastings'], icon: 'wine' },
  // Udaipur
  'pichola-sunset-boat': { label: 'Sunset boat ride', tags: ['boats', 'sunsets'], icon: 'sailboat' },
  'udaipur-old-city-food-walk': { label: 'Old city food walk', tags: ['street-food', 'bazaars'], icon: 'sandwich' },
  'haveli-rajasthani-cooking': { label: 'Haveli cooking class', tags: ['cooking', 'havelis'], icon: 'chef-hat' },
  'mewar-miniature-painting': { label: 'Miniature painting', tags: ['artisans', 'painting'], icon: 'palette' },
  'sajjangarh-sunset-cycle': { label: 'Sunset cycle ride', tags: ['cycling', 'sunsets'], icon: 'bike' },
  'bagore-dharohar-folk-evening': { label: 'Folk dance evening', tags: ['folk-dance', 'live-music'], icon: 'music' },
  'molela-pottery-workshop': { label: 'Pottery workshop', tags: ['artisans', 'pottery'], icon: 'palette' },
  'block-print-bandhani': { label: 'Block print and tie-dye', tags: ['artisans', 'textiles'], icon: 'palette' },
  'city-palace-royal-walk': { label: 'City Palace walk', tags: ['palaces', 'heritage'], icon: 'castle' },
  'kumbhalgarh-ranakpur-day-trip': { label: 'Fort and temple trip', tags: ['forts', 'temples'], icon: 'castle' },
  'menar-bird-village': { label: 'Sunrise birding', tags: ['birding', 'villages'], icon: 'binoculars' },
  'aravalli-horse-safari': { label: 'Horse safari', tags: ['horse-riding', 'villages'], icon: 'mountain' },
  'fateh-sagar-sunrise-yoga': { label: 'Sunrise yoga', tags: ['yoga', 'sunrise'], icon: 'flower-2' },
  'badi-lake-kayak': { label: 'Lake kayak picnic', tags: ['kayaking', 'picnics'], icon: 'sailboat' },
  'ambrai-rooftop-folk-dinner': { label: 'Rooftop folk dinner', tags: ['rooftops', 'live-music'], icon: 'utensils' },
  'lake-city-night-photo-walk': { label: 'Night photo walk', tags: ['photography', 'rooftops'], icon: 'camera' },
  'shilpgram-turban-tying': { label: 'Craft village visit', tags: ['artisans', 'crafts'], icon: 'store' },
};

/** Icon for an experience without an EXTRAS entry, from its first tag */
const TAG_ICON: Record<ExperienceTag, string> = {
  Food: 'utensils',
  Culture: 'landmark',
  Workshops: 'palette',
  Adventure: 'mountain',
  Nature: 'leaf',
  Wellness: 'flower-2',
  Nightlife: 'moon',
  'Hidden gems': 'gem',
  Events: 'party-popper',
};

export const kebab = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Price → the budget it votes for: ≤ ₹800 thrifty, ≤ ₹1,500 middling, else splurge */
export const budgetFor = (rupees: number) => (rupees <= 800 ? 0.2 : rupees <= 1500 ? 0.5 : 0.8);

/** Style hints from the facts: early starts are for early birds, late ones for night owls; hidden gems dodge crowds */
export function experienceStyle(experience: Pick<CatalogueExperience, 'startTime' | 'priceRupees' | 'tags'>) {
  const style: Partial<Record<StyleKey, number>> = {};
  const start = minutesOf(experience.startTime);
  if (start < 8 * 60) style.mornings = 1;
  else if (start >= 21 * 60) style.mornings = 0;
  style.budget = budgetFor(experience.priceRupees);
  if (experience.tags.includes('Hidden gems')) style.crowds = 0;
  return style;
}

export function experienceCard(experience: CatalogueExperience): Card {
  const extra = EXTRAS[experience.id];
  const label = extra?.label ?? experience.title.split(/\s+/).slice(0, 4).join(' ');
  const tags = [...new Set([...experience.tags.map(kebab), ...(extra?.tags ?? [])])];
  return {
    id: `exp:${experience.id}`,
    format: 'swipe',
    topic: experience.tags[0] ?? 'Experience',
    prompt: experience.title,
    art: { kind: 'catalog', experienceId: experience.id },
    place: {
      area: experience.area,
      priceRupees: experience.priceRupees,
      startTime: experience.startTime,
      duration: experience.duration,
      rating: experience.rating,
      pitch: experience.pitch,
    },
    options: [
      {
        id: experience.id,
        label,
        icon: extra?.icon ?? TAG_ICON[experience.tags[0]] ?? 'sparkles',
        effects: { axes: { ...experience.vibe }, style: experienceStyle(experience), tags },
      },
    ],
  };
}

/** 90 → "1.5 hrs", 60 → "1 hr", 75 → "75 min" */
export function durationLabel(minutes: number) {
  if (minutes % 30 !== 0) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
}

/** Old-city workshops in crafts the experience cards don't already cover */
export const DECK_MAKERS = ['rukmani-rangrez', 'puran-bhat', 'aslam-sikligar', 'naresh-sonigara'] as const;

const MAKER_LABEL: Record<(typeof DECK_MAKERS)[number], string> = {
  'rukmani-rangrez': 'Leheriya tie-dye',
  'puran-bhat': 'String puppets',
  'aslam-sikligar': 'Koftgari inlay',
  'naresh-sonigara': 'Silver ring',
};

/** The makers' pictures are the craft cover art in frontend/public/makers: AI-generated illustrations, not photos of
 * real people (frontend/PHOTO_CREDITS.md), so that is the credit they carry. */
export const GENERATED_CREDIT = 'AI-generated illustration';

function makerCard(makerId: (typeof DECK_MAKERS)[number]): Card {
  const maker = MAKER_BY_ID.get(makerId);
  if (!maker) throw new Error(`Vibe Swipe deck: unknown maker ${makerId}`);
  const craft = CRAFT_BY_ID.get(maker.craftIds[0]);
  const workshop = maker.workshop;
  return {
    id: `maker:${maker.id}`,
    format: 'swipe',
    topic: 'Makers',
    prompt: workshop.title,
    hint: `With ${maker.name.split(' ')[0]}, ${maker.area}`,
    art: craft
      ? { kind: 'photo', src: craft.cover, alt: `${craft.name}, illustrated`, credit: GENERATED_CREDIT }
      : { kind: 'illustrated', tone: 'culture', icon: 'palette' },
    place: {
      area: maker.area,
      priceRupees: workshop.pricePerPerson,
      startTime: workshop.weekly[0]?.times[0],
      duration: durationLabel(workshop.durationMin),
      pitch: workshop.blurb,
    },
    options: [
      {
        id: maker.id,
        label: MAKER_LABEL[makerId],
        icon: 'palette',
        effects: { axes: { culture: 0.9, shops: 0.4 }, style: { eco: 0.7 }, tags: ['artisans', 'workshops', ...(craft ? [kebab(craft.id)] : [])] },
      },
    ],
  };
}

/** The farm-to-table dinner from the hospitality module's flagship host */
function hostCard(): Card {
  const host = HOSTS.find(h => h.id === 'kesar-pol-haveli');
  if (!host) throw new Error('Vibe Swipe deck: unknown host kesar-pol-haveli');
  return {
    id: `host:${host.id}`,
    format: 'swipe',
    topic: 'Farm to table',
    prompt: `Farm-to-table thali at ${host.name}`,
    art: { kind: 'photo', src: '/hospitality/thali.jpg', alt: 'A Mewari thali on a brass plate', credit: GENERATED_CREDIT },
    place: {
      area: host.area,
      priceRupees: host.pricePerThali,
      startTime: '08:00 PM',
      pitch: host.tagline,
    },
    options: [
      {
        id: host.id,
        label: 'Farm-to-table thali',
        icon: 'utensils',
        effects: { axes: { food: 0.9, culture: 0.5, chill: 0.3 }, style: { eco: 0.9, budget: budgetFor(host.pricePerThali) }, tags: ['farm-to-table', 'thali', 'local-food'] },
      },
    ],
  };
}

const experiencesIn = (city: ExperienceCity) => EXPERIENCES.filter(e => e.city === city).map(experienceCard);

export const UDAIPUR_DECK: Card[] = [...experiencesIn('Udaipur'), ...DECK_MAKERS.map(makerCard), hostCard()];
export const GOA_DECK: Card[] = experiencesIn('Goa');
