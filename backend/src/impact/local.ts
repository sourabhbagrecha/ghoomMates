// Where the squad's money went: how much stays with local people. Trip expenses are classified by keyword rules over
// their descriptions; whatever the rules can't place goes to Gemini when it is available (answers are cached), and
// otherwise falls back to a stated assumption. Pure functions, no I/O.
import type { HeritageCity } from '../heritage/sites.ts';

export const LOCAL_CLASSES = ['local-artisan', 'local-food', 'heritage-stay', 'guide', 'entry-fees', 'transport', 'other'] as const;
export type LocalClass = (typeof LOCAL_CLASSES)[number];
export const isLocalClass = (value: unknown): value is LocalClass => typeof value === 'string' && (LOCAL_CLASSES as readonly string[]).includes(value);

export const CLASS_LABELS: Record<LocalClass, { label: string; note: string }> = {
  'local-artisan': { label: 'Local artisans', note: 'Bought from the maker' },
  'local-food': { label: 'Local food', note: 'Family kitchens, dhabas and street stalls' },
  'heritage-stay': { label: 'Heritage stays', note: 'Havelis, homestays and guesthouses' },
  guide: { label: 'Guides & hosts', note: 'Guides, workshop hosts and performers' },
  'entry-fees': { label: 'Entry fees', note: 'Supports heritage upkeep, not counted as local income' },
  transport: { label: 'Local transport', note: 'Autos, rickshaws, cabs and boatmen' },
  other: { label: 'Everything else', note: 'Chains, apps, trains and flights' },
};

export type Classified = {
  class: LocalClass;
  /** The money lands with a person or family in Udaipur */
  local: boolean;
  by: 'rule' | 'gemini' | 'assumed';
};

export type ExpenseRow = { id: string; description: string; amountPaise: number; category: string };

const words = (description: string) => ` ${description.toLowerCase().replace(/[^a-z0-9&]+/g, ' ').trim()} `;
const re = (alternatives: string) => new RegExp(`\\b(?:${alternatives})\\b`);

// Brands and platforms: the money leaves town
const CHAINS = re('mcdonald|mcdonalds|domino|dominos|pizza hut|kfc|burger king|subway|starbucks|ccd|cafe coffee day|barista|costa coffee|haldiram|haldirams|taj|oberoi|leela|marriott|hyatt|hilton|radisson|ibis|novotel|itc|lemon tree|treebo|oyo|fabhotel|zostel|swiggy|zomato|amazon|flipkart|decathlon|reliance|dmart|d mart|big bazaar|duty free');
const FAR_TRANSPORT = re('ola|uber|rapido|bus|redbus|train|irctc|flight|flights|indigo|air india|vistara|spicejet|metro|makemytrip|ixigo|fuel|petrol|diesel|toll|parking');
const LOCAL_TRANSPORT = re('auto|autos|rickshaw|rickshaws|e rick|erick|tuk tuk|tuktuk|taxi|taxis|cab|cabs|driver|scooter|scooty|bike|bikes|cycle|cycles|ferry|tonga');
const ENTRY = re('ticket|tickets|entry|entrance|admission|pass|fee|fees|museum|ropeway|cable car|boat ride|boat trip|boating|boat|show|dharohar|camera fee');
const GUIDE = re('guide|guides|guided|storyteller|naturalist|instructor|host|hosts|workshop|workshops|class|classes|lesson|lessons|walk|walks|tour|tours|puppeteer|puppeteers|musician|musicians|performer|performers');
const STAY = re('stay|stays|room|rooms|homestay|home stay|guest house|guesthouse|hostel|lodge|accommodation|bnb|bed and breakfast|heritage hotel|heritage stay');
const ARTISAN = re('pottery|potter|miniature|miniatures|painting|paintings|painter|block print|block printing|bandhani|handicraft|handicrafts|handloom|artisan|artisans|weaver|weavers|weaving|textile|textiles|saree|sari|safa|turban|souvenir|souvenirs|jewellery|jewelry|silver|leather|juti|mojari|carving|marble|stole|stoles|scarf|scarves|dupatta|rug|rugs|molela|terracotta|craft|crafts|shilpgram|hathi pol|puppet|puppets');
const FOOD = re('thali|thalis|dal baati|baati|churma|kachori|kachoris|chaat|samosa|jalebi|lassi|chai|tea|dhaba|bhojanalaya|rasoi|kitchen|home cooked|homecooked|family|street food|vada|poha|paratha|makki|ghewar|malpua|kulhad|sabzi|gatte|laal maas|mewari|rajasthani|farm|organic|village|lunch|dinner|breakfast|brunch|snack|snacks|meal|meals|food|sweets|mithai|ice cream|kulfi|juice|coffee|cafe|restaurant|rooftop|eatery|bakery');

/** One expense by the keyword rules, or null when they can't place it */
export function classifyByRules(description: string, category: string): Classified | null {
  const text = words(description);
  const rule = (cls: LocalClass, local: boolean): Classified => ({ class: cls, local, by: 'rule' });
  if (CHAINS.test(text)) return rule('other', false);
  if (FAR_TRANSPORT.test(text)) return rule('transport', false);
  if (LOCAL_TRANSPORT.test(text)) return rule('transport', true);
  if (STAY.test(text) || (category === 'stays' && /\bhaveli\b/.test(text))) return rule('heritage-stay', true);
  if (ENTRY.test(text)) return rule('entry-fees', false);
  if (GUIDE.test(text)) return rule('guide', true);
  if (ARTISAN.test(text)) return rule('local-artisan', true);
  if (FOOD.test(text)) return rule('local-food', true);
  return null;
}

/** Stable cache key for a description, so the same words are only classified once */
export const normaliseDescription = (description: string) => description.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);

/** Descriptions the rules can't place, for Gemini (distinct, in first-seen order) */
export function leftovers(rows: ExpenseRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (classifyByRules(row.description, row.category)) continue;
    const key = normaliseDescription(row.description);
    if (key) seen.add(key);
  }
  return [...seen];
}

/** What Gemini says a leftover is, by normalised description. "local" tells transport apart from trains and apps. */
export type AiAnswers = Map<string, { class: LocalClass; local: boolean }>;

/** The classification of one expense: rules, then Gemini's answer, then the assumption for food */
export function classify(row: ExpenseRow, ai: AiAnswers, city: HeritageCity | null): Classified {
  const byRule = classifyByRules(row.description, row.category);
  if (byRule) return byRule;
  const answer = ai.get(normaliseDescription(row.description));
  if (answer) return { class: answer.class, local: answer.class === 'other' || answer.class === 'entry-fees' ? false : answer.local, by: 'gemini' };
  // No rule fits and nobody to ask: an unlabelled meal in Udaipur is far more likely a family-run place than a chain
  if (row.category === 'food' && city === 'Udaipur') return { class: 'local-food', local: true, by: 'assumed' };
  return { class: 'other', local: false, by: 'rule' };
}

export type LocalSpend = {
  trackedPaise: number;
  /** Paid to local people: artisans, cooks, hosts, guides, drivers */
  keptPaise: number;
  /** 0–100 of the tracked spend */
  sharePct: number;
  expenseCount: number;
  byClass: { id: LocalClass; label: string; note: string; paise: number; keptPaise: number; count: number }[];
  /** The biggest expenses and how each was counted */
  items: { id: string; description: string; amountPaise: number; class: LocalClass; local: boolean; by: Classified['by'] }[];
  /** How many expenses were counted by assumption or by Gemini rather than by a clear keyword */
  estimated: number;
  /** How many of those Gemini sorted */
  byGemini: number;
};

export function localSpend(rows: ExpenseRow[], ai: AiAnswers, city: HeritageCity | null): LocalSpend {
  const classified = rows.map(row => ({ row, c: classify(row, ai, city) }));
  const trackedPaise = classified.reduce((total, { row }) => total + row.amountPaise, 0);
  const keptPaise = classified.reduce((total, { row, c }) => total + (c.local ? row.amountPaise : 0), 0);
  const byClass = LOCAL_CLASSES.map(id => {
    const mine = classified.filter(({ c }) => c.class === id);
    return {
      id,
      ...CLASS_LABELS[id],
      paise: mine.reduce((total, { row }) => total + row.amountPaise, 0),
      keptPaise: mine.reduce((total, { row, c }) => total + (c.local ? row.amountPaise : 0), 0),
      count: mine.length,
    };
  }).filter(c => c.count > 0).sort((a, b) => b.paise - a.paise);
  return {
    trackedPaise,
    keptPaise,
    sharePct: trackedPaise > 0 ? Math.round((keptPaise / trackedPaise) * 100) : 0,
    expenseCount: rows.length,
    byClass,
    items: [...classified]
      .sort((a, b) => b.row.amountPaise - a.row.amountPaise)
      .slice(0, 6)
      .map(({ row, c }) => ({ id: row.id, description: row.description, amountPaise: row.amountPaise, class: c.class, local: c.local, by: c.by })),
    estimated: classified.filter(({ c }) => c.by !== 'rule').length,
    byGemini: classified.filter(({ c }) => c.by === 'gemini').length,
  };
}
