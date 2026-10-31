// Udaipur's heritage sites and how busy each one gets through a normal peak-season weekday.
// Curves are hand-tuned from typical footfall patterns (opening rush, midday tour buses, sunset crush);
// in production they would come from ticket scans and live footfall feeds. Levels are 0–100.

export const HERITAGE_CITIES = ['Udaipur'] as const;
export type HeritageCity = (typeof HERITAGE_CITIES)[number];

export type SiteKind = 'Palace' | 'Temple' | 'Haveli' | 'Ghat' | 'Garden' | 'Lake' | 'Viewpoint' | 'Museum' | 'Crafts' | 'Bazaar';

export type HeritageSite = {
  id: string;
  city: HeritageCity;
  name: string;
  kind: SiteKind;
  /** Lower-case names people write in stop titles; the first one found wins */
  aliases: string[];
  lat: number;
  lng: number;
  /** Opening hours as [open, close] minutes after midnight */
  hours: [number, number][];
  /** Busyness by hour of day (index 0–23); the minutes in between are interpolated */
  curve: number[];
  /** Lesser-known spot the app nudges squads towards */
  gem: boolean;
  /** Ids of nearby sites with the same feel, used when the squad can't simply go earlier or later */
  alternatives: string[];
  /** Stop title and itinerary tag used when a squad swaps to this site */
  visitTitle: string;
  tag: 'Culture' | 'Chill' | 'Adventure' | 'Shops';
  /** One line of history */
  story: string;
  /** How to visit lightly: respect, waste, transport */
  care: string;
};

const h = (hour: number, minute = 0) => hour * 60 + minute;

/** Hour → level anchors, linearly filled in between and 0 outside the first and last anchors */
function curve(anchors: Record<number, number>): number[] {
  const points = Object.entries(anchors).map(([hour, level]) => [Number(hour), level] as const).sort((a, b) => a[0] - b[0]);
  return Array.from({ length: 24 }, (_, hour) => {
    const after = points.findIndex(([at]) => at >= hour);
    if (after === -1 || (after === 0 && points[0][0] > hour)) return 0;
    const [x1, y1] = points[after];
    if (x1 === hour || after === 0) return y1;
    const [x0, y0] = points[after - 1];
    return Math.round(y0 + (y1 - y0) * (hour - x0) / (x1 - x0));
  });
}

export const SITES: HeritageSite[] = [
  {
    id: 'city-palace', city: 'Udaipur', name: 'City Palace', kind: 'Palace',
    aliases: ['city palace', 'palace museum', 'mardana mahal', 'zenana mahal'],
    lat: 24.5764, lng: 73.6835, hours: [[h(9, 30), h(17, 30)]],
    curve: curve({ 9: 26, 10: 52, 11: 86, 12: 96, 13: 92, 14: 80, 15: 68, 16: 56, 17: 40 }),
    gem: false, alternatives: ['ahar-cenotaphs'], visitTitle: 'City Palace museum', tag: 'Culture',
    story: 'Built over four centuries by 22 Mewar rulers, starting with Maharana Udai Singh II in 1559.',
    care: 'Book tickets online, carry a refillable bottle and keep to the marked route in the zenana wing.',
  },
  {
    id: 'jagdish-temple', city: 'Udaipur', name: 'Jagdish Temple', kind: 'Temple',
    aliases: ['jagdish temple', 'jagdish mandir', 'jagannath temple'],
    lat: 24.5797, lng: 73.6840, hours: [[h(5), h(14)], [h(16), h(22)]],
    curve: curve({ 5: 20, 6: 34, 7: 24, 8: 32, 9: 48, 10: 74, 11: 86, 12: 78, 13: 58, 14: 40, 15: 30, 16: 36, 17: 52, 18: 72, 19: 92, 20: 66, 21: 40, 22: 18 }),
    gem: false, alternatives: [], visitTitle: 'Jagdish Temple', tag: 'Culture',
    story: 'Raised in 1651 by Maharana Jagat Singh I, its carved spire is dedicated to Vishnu as Jagannath.',
    care: 'Dress modestly, leave shoes at the steps and skip photos of the main shrine.',
  },
  {
    id: 'bagore-ki-haveli', city: 'Udaipur', name: 'Bagore ki Haveli', kind: 'Haveli',
    aliases: ['bagore', 'dharohar'],
    lat: 24.5800, lng: 73.6818, hours: [[h(9, 30), h(17, 30)], [h(18), h(20, 15)]],
    curve: curve({ 9: 20, 11: 38, 13: 44, 15: 40, 17: 30, 18: 72, 19: 100, 20: 78, 21: 20 }),
    gem: false, alternatives: ['lok-kala-mandal'], visitTitle: 'Bagore ki Haveli', tag: 'Culture',
    story: 'An 18th-century haveli of Mewar’s prime minister Amar Chand Badwa; Dharohar folk dances run every evening.',
    care: 'The evening show sells out: queue by 6:15 PM or see the haveli’s rooms by day instead.',
  },
  {
    id: 'gangaur-ghat', city: 'Udaipur', name: 'Gangaur Ghat', kind: 'Ghat',
    aliases: ['gangaur'],
    lat: 24.5803, lng: 73.6823, hours: [[h(6), h(22)]],
    curve: curve({ 6: 14, 8: 20, 10: 30, 12: 30, 15: 42, 16: 58, 17: 78, 18: 96, 19: 90, 20: 70, 21: 50, 22: 28 }),
    gem: false, alternatives: ['neemach-mata', 'moti-magri'], visitTitle: 'Gangaur Ghat', tag: 'Chill',
    story: 'Named for the spring Gangaur festival, when women carry idols of Gauri down these steps to the lake.',
    care: 'Feed nothing to the fish and pigeons, and keep plastic out of Lake Pichola.',
  },
  {
    id: 'ambrai-ghat', city: 'Udaipur', name: 'Ambrai Ghat', kind: 'Ghat',
    aliases: ['ambrai', 'hanuman ghat'],
    lat: 24.5781, lng: 73.6797, hours: [[h(6), h(23)]],
    curve: curve({ 6: 18, 9: 20, 12: 24, 15: 38, 16: 52, 17: 82, 18: 92, 19: 84, 20: 70, 22: 40, 23: 24 }),
    gem: false, alternatives: ['neemach-mata', 'moti-magri'], visitTitle: 'Ambrai Ghat', tag: 'Chill',
    story: 'The ghat facing the City Palace across Pichola, famous for the palace lit up after dark.',
    care: 'Walk over from the old city by the Chandpol bridge instead of taking a cab round the lake.',
  },
  {
    id: 'pichola-boat', city: 'Udaipur', name: 'Lake Pichola boat ride', kind: 'Lake',
    aliases: ['pichola', 'boat ride', 'jag mandir', 'jagmandir', 'rameshwar ghat'],
    lat: 24.5745, lng: 73.6830, hours: [[h(10), h(18)]],
    curve: curve({ 10: 30, 11: 44, 13: 50, 14: 54, 15: 62, 16: 82, 17: 100, 18: 60 }),
    gem: false, alternatives: ['badi-lake'], visitTitle: 'Lake Pichola boat ride', tag: 'Chill',
    story: 'A Banjara grain trader dug Pichola in 1362; Udaipur was founded on its banks two centuries later.',
    care: 'Pick the electric boats from Rameshwar Ghat; they’re quiet and don’t leak diesel into the lake.',
  },
  {
    id: 'saheliyon-ki-bari', city: 'Udaipur', name: 'Saheliyon ki Bari', kind: 'Garden',
    aliases: ['saheliyon', 'sahelion', 'garden of the maidens'],
    lat: 24.6006, lng: 73.6886, hours: [[h(9), h(19)]],
    curve: curve({ 9: 24, 10: 46, 11: 80, 12: 86, 13: 70, 14: 54, 15: 60, 16: 80, 17: 86, 18: 60, 19: 30 }),
    gem: false, alternatives: ['gulab-bagh', 'moti-magri'], visitTitle: 'Saheliyon ki Bari', tag: 'Culture',
    story: 'Laid out by Maharana Sangram Singh II for the queen’s companions; its fountains run on lake pressure, not pumps.',
    care: 'The fountains run on gravity from Fateh Sagar; no coins in the pools.',
  },
  {
    id: 'sajjangarh', city: 'Udaipur', name: 'Sajjangarh Monsoon Palace', kind: 'Palace',
    aliases: ['sajjangarh', 'monsoon palace'],
    lat: 24.5946, lng: 73.6420, hours: [[h(8), h(19)]],
    curve: curve({ 8: 14, 10: 28, 12: 34, 14: 40, 15: 54, 16: 74, 17: 96, 18: 100, 19: 50 }),
    gem: false, alternatives: ['neemach-mata', 'badi-lake'], visitTitle: 'Sajjangarh Monsoon Palace', tag: 'Culture',
    story: 'Built in 1884 by Maharana Sajjan Singh on a hilltop to watch the monsoon clouds roll in.',
    care: 'Share one cab for the squad: the single hill road jams with cars at sunset.',
  },
  {
    id: 'fateh-sagar', city: 'Udaipur', name: 'Fateh Sagar Lake', kind: 'Lake',
    aliases: ['fateh sagar', 'fatehsagar'],
    lat: 24.6000, lng: 73.6770, hours: [[h(5), h(23)]],
    curve: curve({ 5: 20, 6: 40, 8: 30, 10: 24, 12: 20, 15: 34, 16: 52, 17: 74, 18: 90, 19: 96, 20: 88, 21: 70, 23: 30 }),
    gem: false, alternatives: ['badi-lake', 'neemach-mata'], visitTitle: 'Fateh Sagar Lake', tag: 'Chill',
    story: 'Rebuilt by Maharana Fateh Singh in the 1880s after floods breached the older dam.',
    care: 'Hire a cycle at the pal instead of driving the lake road.',
  },
  {
    id: 'karni-mata', city: 'Udaipur', name: 'Karni Mata ropeway', kind: 'Viewpoint',
    aliases: ['karni mata', 'ropeway', 'dudh talai'],
    lat: 24.5735, lng: 73.6845, hours: [[h(9), h(21)]],
    curve: curve({ 9: 20, 11: 40, 13: 36, 15: 50, 16: 68, 17: 86, 18: 96, 19: 70, 21: 30 }),
    gem: false, alternatives: ['neemach-mata', 'moti-magri'], visitTitle: 'Karni Mata ropeway', tag: 'Chill',
    story: 'The cable car climbs from Dudh Talai to the hilltop Karni Mata temple, high above Pichola.',
    care: 'Walk up the stone path if you’re able and leave the cars for elders.',
  },
  {
    id: 'hathi-pol', city: 'Udaipur', name: 'Hathi Pol Bazaar', kind: 'Bazaar',
    aliases: ['hathi pol', 'hathipol'],
    lat: 24.5880, lng: 73.6880, hours: [[h(10), h(21, 30)]],
    curve: curve({ 10: 22, 12: 36, 15: 42, 17: 62, 18: 78, 19: 84, 20: 80, 21: 52 }),
    gem: false, alternatives: ['shilpgram'], visitTitle: 'Hathi Pol Bazaar', tag: 'Shops',
    story: 'The elephant-gate bazaar, where miniature painters still work out of tiny upstairs studios.',
    care: 'Ask for the painter or weaver; buying from the maker keeps the craft alive.',
  },

  // Lesser-known gems
  {
    id: 'neemach-mata', city: 'Udaipur', name: 'Neemach Mata hilltop', kind: 'Viewpoint',
    aliases: ['neemach'],
    lat: 24.6040, lng: 73.6735, hours: [[h(6), h(19)]],
    curve: curve({ 6: 22, 7: 26, 9: 16, 12: 10, 16: 20, 17: 34, 18: 40, 19: 16 }),
    gem: true, alternatives: [], visitTitle: 'Sunset hike to Neemach Mata', tag: 'Adventure',
    story: 'A hilltop shrine above Fateh Sagar, reached by a 20-minute stone path, with the whole lake below.',
    care: 'Carry your water up in a bottle you take back down; there are no bins on the hill.',
  },
  {
    id: 'moti-magri', city: 'Udaipur', name: 'Moti Magri', kind: 'Viewpoint',
    aliases: ['moti magri', 'maharana pratap memorial', 'pratap memorial'],
    lat: 24.5960, lng: 73.6808, hours: [[h(7), h(19)]],
    curve: curve({ 7: 14, 9: 20, 11: 30, 13: 26, 16: 34, 18: 40, 19: 18 }),
    gem: true, alternatives: [], visitTitle: 'Moti Magri and the Maharana Pratap memorial', tag: 'Culture',
    story: 'Pearl Hill’s memorial to Maharana Pratap and his horse Chetak, looking over Fateh Sagar.',
    care: 'Hear Pratap’s story from a local guide at the gate; they’re from the families who’ve told it for generations.',
  },
  {
    id: 'shilpgram', city: 'Udaipur', name: 'Shilpgram crafts village', kind: 'Crafts',
    aliases: ['shilpgram', 'crafts village'],
    lat: 24.6170, lng: 73.6440, hours: [[h(11), h(19)]],
    curve: curve({ 11: 20, 13: 30, 15: 34, 17: 40, 19: 16 }),
    gem: true, alternatives: [], visitTitle: 'Shilpgram crafts village', tag: 'Shops',
    story: 'A living crafts village where potters, weavers and painters from four states work in traditional huts.',
    care: 'Buy straight from the artisans at their huts; every rupee stays with the maker.',
  },
  {
    id: 'lok-kala-mandal', city: 'Udaipur', name: 'Bhartiya Lok Kala Mandal', kind: 'Museum',
    aliases: ['lok kala', 'puppet show', 'kathputli'],
    lat: 24.5882, lng: 73.6975, hours: [[h(9), h(17, 30)], [h(18), h(19)]],
    curve: curve({ 9: 10, 11: 24, 13: 24, 15: 30, 17: 20, 18: 46, 19: 20 }),
    gem: true, alternatives: [], visitTitle: 'Puppet show at Bhartiya Lok Kala Mandal', tag: 'Culture',
    story: 'Founded in 1952 to keep Rajasthani puppetry and folk arts alive; the kathputli show runs every evening.',
    care: 'Puppeteers here are often third-generation; tip the performers directly.',
  },
  {
    id: 'ahar-cenotaphs', city: 'Udaipur', name: 'Ahar cenotaphs', kind: 'Museum',
    aliases: ['ahar cenotaph', 'ahar museum', 'mahasatiya', 'cenotaph'],
    lat: 24.5870, lng: 73.7190, hours: [[h(10), h(17)]],
    curve: curve({ 10: 10, 12: 20, 14: 20, 16: 24, 17: 14 }),
    gem: true, alternatives: [], visitTitle: 'Ahar royal cenotaphs and museum', tag: 'Culture',
    story: 'Over 250 cenotaphs of Mewar’s royals, beside a dig of the 4,000-year-old Ahar culture.',
    care: 'It’s a memorial ground: keep voices low and stay off the chhatri platforms.',
  },
  {
    id: 'gulab-bagh', city: 'Udaipur', name: 'Gulab Bagh', kind: 'Garden',
    aliases: ['gulab bagh', 'sajjan niwas'],
    lat: 24.5725, lng: 73.6905, hours: [[h(5), h(21)]],
    curve: curve({ 5: 20, 6: 34, 8: 24, 11: 18, 14: 14, 17: 38, 19: 32, 21: 10 }),
    gem: true, alternatives: [], visitTitle: 'Gulab Bagh garden walk', tag: 'Chill',
    story: 'Udaipur’s biggest garden, laid out by Maharana Sajjan Singh, with the old Saraswati Bhawan library inside.',
    care: 'Stick to the paths; the rose beds are over a century old.',
  },
  {
    id: 'vintage-cars', city: 'Udaipur', name: 'Vintage car collection', kind: 'Museum',
    aliases: ['vintage car', 'classic car', 'car museum'],
    lat: 24.5862, lng: 73.6952, hours: [[h(9), h(21)]],
    curve: curve({ 9: 10, 12: 24, 15: 26, 18: 20, 21: 10 }),
    gem: true, alternatives: [], visitTitle: 'The Maharanas’ vintage car collection', tag: 'Culture',
    story: 'The Maharanas’ own cars, including the Rolls-Royces used for state visits.',
    care: 'Walk over from Gulab Bagh; it’s ten minutes on foot.',
  },
  {
    id: 'badi-lake', city: 'Udaipur', name: 'Badi Lake', kind: 'Lake',
    aliases: ['badi lake', 'bari lake', 'jiyan sagar'],
    lat: 24.6262, lng: 73.6290, hours: [[h(6), h(19)]],
    curve: curve({ 6: 14, 8: 20, 12: 24, 15: 30, 16: 40, 18: 48, 19: 20 }),
    gem: true, alternatives: [], visitTitle: 'Badi Lake at golden hour', tag: 'Chill',
    story: 'Dug by Maharana Raj Singh I in the 1650s to carry nearby villages through a famine.',
    care: 'It’s a drinking-water reservoir: no swimming, soap or snacks by the water.',
  },
];

export const SITE_BY_ID = new Map(SITES.map(s => [s.id, s]));
