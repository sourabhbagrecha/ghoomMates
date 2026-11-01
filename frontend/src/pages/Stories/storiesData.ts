import type { CatalogueItem, Grade, StoryAudience, StoryLang } from '../../services/storiesService'

/** Who is listening: the chips under the title. Everything but Classic is retold by Gemini. */
export const AUDIENCES: { id: StoryAudience; label: string; retold: string }[] = [
  { id: 'classic', label: 'Classic', retold: 'the classic telling' },
  { id: 'family', label: 'Family', retold: 'a family with kids' },
  { id: 'friends', label: 'Friends', retold: 'a squad of friends' },
  { id: 'couple', label: 'Couple', retold: 'a couple' },
  { id: 'history', label: 'History buffs', retold: 'history buffs' },
]

export const audienceLabel = (id: StoryAudience) => AUDIENCES.find((a) => a.id === id)?.retold ?? 'the squad'

export const LANGUAGES: { id: StoryLang; short: string; name: string }[] = [
  { id: 'en', short: 'EN', name: 'English' },
  { id: 'hi', short: 'हिं', name: 'हिन्दी' },
]

const LANG_KEY = 'ghoommates:storyLang'

/** The language the squad listened in last time (the grandparents’ choice sticks) */
export function savedLang(): StoryLang {
  try {
    return localStorage.getItem(LANG_KEY) === 'hi' ? 'hi' : 'en'
  } catch {
    return 'en'
  }
}

export function saveLang(lang: StoryLang) {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    // Blocked storage: the choice lasts until the page reloads
  }
}

/** "culture+food" → "culture and food" */
export const vibeWords = (vibe: string) => (vibe === 'balanced' ? 'a bit of everything' : vibe.split('+').join(' and '))

/** m:ss */
export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The painted stories shown before the catalogue loads (or if it can't): the app never opens to a blank carousel */
export const FALLBACK_CATALOGUE: CatalogueItem[] = [
  ['bagore-ki-haveli', 'Bagore ki Haveli', 'Haveli', 'The Prime Minister’s House by the Ghat'],
  ['city-palace', 'City Palace', 'Palace', 'The Palace Four Centuries in the Making'],
  ['jagdish-temple', 'Jagdish Temple', 'Temple', 'Thirty-Two Steps to Jagannath'],
  ['pichola-boat', 'Lake Pichola boat ride', 'Lake', 'The Lake That Grew a City'],
  ['saheliyon-ki-bari', 'Saheliyon ki Bari', 'Garden', 'The Garden of the Companions'],
  ['sajjangarh', 'Sajjangarh Monsoon Palace', 'Palace', 'The Palace That Waits for Rain'],
  ['fateh-sagar', 'Fateh Sagar Lake', 'Lake', 'The Lake That Was Rebuilt'],
].map(([siteId, name, kind, title]) => ({
  siteId,
  name,
  kind,
  gem: false,
  curated: true,
  title,
  titleHi: null,
  art: `/stories/${siteId}/1.jpg`,
  panels: 4,
  narrated: { en: true, hi: siteId === 'bagore-ki-haveli' },
}))

/** The words around the story, in the language it is told in (the grandparents read along in Hindi) */
export type Copy = {
  panelOf: (index: number, count: number) => string
  lookFor: string
  tapToOpen: string
  back: string
  backToStory: string
  next: string
  quiz: string
  play: string
  pause: string
  replay: string
  question: (index: number, count: number) => string
  right: string
  wrong: string
  answerWas: (answer: string) => string
  nextQuestion: string
  seeScore: string
  yourScore: (score: number, total: number) => string
  whoListened: string
  whoListenedHint: string
  stampIt: string
  stamping: string
  stampedWith: (names: string) => string
  squadCount: (stamped: number, total: number) => string
  passportCount: (stamped: number, total: number) => string
  grade: Record<Grade, { title: string; line: string }>
  firstStamp: string
  bestKept: string
  savedOnPhone: string
  openPassport: string
  anotherStory: string
}

export const COPY: Record<StoryLang, Copy> = {
  en: {
    panelOf: (i, n) => `Panel ${i} of ${n}`,
    lookFor: 'Look for',
    tapToOpen: 'Tap to open',
    back: 'Back',
    backToStory: 'Back to the story',
    next: 'Next panel',
    quiz: 'Take the quiz',
    play: 'Play the story',
    pause: 'Pause',
    replay: 'Hear it again',
    question: (i, n) => `Question ${i} of ${n}`,
    right: 'Right!',
    wrong: 'Not quite.',
    answerWas: (a) => `It’s “${a}”.`,
    nextQuestion: 'Next question',
    seeScore: 'See my score',
    yourScore: (s, t) => `You got ${s} of ${t}`,
    whoListened: 'Who listened with you?',
    whoListenedHint: 'One phone, the whole squad: tap anyone who wasn’t there to leave them out.',
    stampIt: 'Stamp the passport',
    stamping: 'Stamping…',
    stampedWith: (names) => `Stamped for ${names} too`,
    squadCount: (s, t) => `Your squad: ${s}/${t} have this stamp`,
    passportCount: (s, t) => `${s} of ${t} sites collected`,
    grade: {
      gold: { title: 'Gold stamp!', line: 'Every answer right. The Kavadiya Bhat bows to you.' },
      silver: { title: 'Silver stamp!', line: 'Well listened. Most of the tale stayed with you.' },
      bronze: { title: 'Stamp earned!', line: 'You stayed to the end. Hear it again for the gold.' },
    },
    firstStamp: 'New in your Heritage Passport',
    bestKept: 'Your best round here is kept',
    savedOnPhone: 'The passport desk is closed, so this stamp is kept on your phone.',
    openPassport: 'Open my passport',
    anotherStory: 'Hear another story',
  },
  hi: {
    panelOf: (i, n) => `पैनल ${i} / ${n}`,
    lookFor: 'यहाँ देखिए',
    tapToOpen: 'खोलने के लिए छूइए',
    back: 'पीछे',
    backToStory: 'कहानी पर लौटिए',
    next: 'अगला पैनल',
    quiz: 'सवाल-जवाब',
    play: 'कहानी सुनिए',
    pause: 'रोकिए',
    replay: 'फिर से सुनिए',
    question: (i, n) => `सवाल ${i} / ${n}`,
    right: 'सही!',
    wrong: 'ठीक नहीं।',
    answerWas: (a) => `सही जवाब: “${a}”।`,
    nextQuestion: 'अगला सवाल',
    seeScore: 'मेरा स्कोर देखिए',
    yourScore: (s, t) => `${t} में से ${s} सही`,
    whoListened: 'आपके साथ किसने सुना?',
    whoListenedHint: 'एक फ़ोन, पूरी टोली: जो वहाँ नहीं था, उसे छूकर हटा दीजिए।',
    stampIt: 'पासपोर्ट पर मुहर लगाइए',
    stamping: 'मुहर लग रही है…',
    stampedWith: (names) => `${names} को भी मुहर मिली`,
    squadCount: (s, t) => `आपकी टोली: ${t} में से ${s} के पास यह मुहर है`,
    passportCount: (s, t) => `${t} में से ${s} जगहें जमा`,
    grade: {
      gold: { title: 'सोने की मुहर!', line: 'हर जवाब सही। कावड़िया भाट भी आपको सलाम करते हैं।' },
      silver: { title: 'चाँदी की मुहर!', line: 'ध्यान से सुना। ज़्यादातर किस्सा आपको याद रहा।' },
      bronze: { title: 'मुहर मिल गई!', line: 'आप आख़िर तक रुके। सोने की मुहर के लिए एक बार और सुनिए।' },
    },
    firstStamp: 'हेरिटेज पासपोर्ट में नई मुहर',
    bestKept: 'यहाँ आपका सबसे अच्छा स्कोर रखा गया है',
    savedOnPhone: 'पासपोर्ट डेस्क अभी बंद है, इसलिए यह मुहर आपके फ़ोन में रखी गई है।',
    openPassport: 'मेरा पासपोर्ट खोलिए',
    anotherStory: 'एक और कहानी सुनिए',
  },
}
