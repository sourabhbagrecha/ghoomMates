// Swipe kit playground: the Vibe Swipe stack with a small local deck that has every card format and every kind
// of art, so the kit can be tried without the prefs API. Answers are logged with their exact Reply shape.
import { useState } from 'react'
import { LinkButton } from '../../components/Button'
import type { Tone } from '../../components/swipe/art'
import { CardArt } from '../../components/swipe/CardArt'
import { QuizStack, type CataloguePhoto } from '../../components/swipe/QuizStack'
import type { Card, Fan, Reply } from '../../data/taste'
import { EXPERIENCE_PHOTOS } from '../Explore/experiencePhotos'

/** Stand-in for the Explore catalogue: one known experience, everything else has no photo (illustrated fallback) */
const CATALOGUE: Record<string, CataloguePhoto> = {
  'pichola-boat': EXPERIENCE_PHOTOS.pichola[0],
}
const photoFor = (experienceId: string) => CATALOGUE[experienceId]

const PALACE = EXPERIENCE_PHOTOS.cityPalace[0]

const DECK: Card[] = [
  {
    id: 'demo-sunrise-yoga',
    format: 'swipe',
    topic: 'Mornings',
    prompt: 'Sunrise yoga by the lake',
    hint: 'Drag the card, use the buttons, or the arrow keys',
    art: { kind: 'illustrated', tone: 'chill', icon: 'sunrise' },
    options: [
      {
        id: 'sunrise-yoga',
        label: 'Sunrise yoga',
        icon: 'sunrise',
        detail: 'An hour of slow stretches while the lake turns gold',
        effects: { axes: { chill: 0.8 }, style: { mornings: 1, pace: 0.3 }, tags: ['sunrise', 'yoga'] },
      },
    ],
  },
  {
    id: 'demo-pichola-boat',
    format: 'swipe',
    topic: 'Lake Pichola',
    prompt: 'Sunset boat ride',
    art: { kind: 'catalog', experienceId: 'pichola-boat' },
    place: { area: 'Old city', startTime: '05:30 PM', duration: '1 hr', priceRupees: 700, rating: 4.6, pitch: 'Glide past Jag Mandir as the palaces light up' },
    fans: [
      { name: 'Riya', verdict: 'love' },
      { name: 'Kabir', verdict: 'love' },
    ],
    options: [
      { id: 'pichola-boat', label: 'Sunset boat ride', icon: 'sailboat', effects: { axes: { chill: 0.7, culture: 0.4 }, tags: ['lakes', 'sunset'] } },
    ],
  },
  {
    id: 'demo-city-palace',
    format: 'swipe',
    topic: 'Heritage',
    prompt: 'City Palace with a local guide',
    art: { kind: 'photo', src: PALACE.src, alt: PALACE.alt, credit: PALACE.credit, license: PALACE.license, source: PALACE.source },
    place: { area: 'City Palace', startTime: '09:30 AM', duration: '3 hrs', priceRupees: 1250, rating: 4.7, pitch: 'Courtyards, mirror work and the peacock mosaics of Mor Chowk' },
    fans: [{ name: 'Meera', verdict: 'like' }],
    options: [
      { id: 'city-palace', label: 'City Palace tour', icon: 'castle', effects: { axes: { culture: 0.9 }, style: { walking: 0.7 }, tags: ['palaces'] } },
    ],
  },
  {
    id: 'demo-cooking-class',
    format: 'swipe',
    topic: 'Food',
    prompt: 'Rajasthani cooking class',
    // Not in the catalogue stub, so it falls back to the illustrated food tone with the option's icon
    art: { kind: 'catalog', experienceId: 'not-in-catalogue' },
    place: { area: 'Ambamata', startTime: '11:00 AM', duration: '2.5 hrs', priceRupees: 12500, rating: 4.8, pitch: 'Roll your own dal baati with a home cook, then eat it all' },
    options: [
      { id: 'cooking-class', label: 'Cooking class', icon: 'chef-hat', effects: { axes: { food: 0.9, culture: 0.4 }, tags: ['cooking-class'] } },
    ],
  },
  {
    id: 'demo-evenings',
    format: 'this-or-that',
    topic: 'Evenings',
    prompt: 'Your kind of night out?',
    options: [
      { id: 'rooftop', label: 'Rooftop dinner', icon: 'wine', detail: 'Lake views, slow courses', effects: { axes: { chill: 0.6, food: 0.6 }, style: { budget: 0.7 } } },
      { id: 'night-market', label: 'Night market', icon: 'shopping-bag', detail: 'Street food and stalls', effects: { axes: { shops: 0.7, food: 0.5 }, style: { crowds: 0.8 } } },
    ],
  },
  {
    id: 'demo-pace',
    format: 'pick',
    topic: 'Pace',
    prompt: 'How full should a day be?',
    art: { kind: 'illustrated', tone: 'style', icon: 'clock' },
    options: [
      { id: 'one-thing', label: 'One big thing', icon: 'armchair', detail: 'Then a long lunch', effects: { style: { pace: 0 } } },
      { id: 'few-stops', label: 'Two or three', icon: 'map', detail: 'With breaks between', effects: { style: { pace: 0.4 } } },
      { id: 'packed', label: 'Dawn to dusk', icon: 'zap', detail: 'Sleep on the way home', effects: { style: { pace: 1 } } },
      { id: 'wing-it', label: 'Wing it', icon: 'sparkles', detail: 'See where the day goes', effects: { style: { pace: 0.5 } } },
    ],
  },
  {
    id: 'demo-food-rules',
    format: 'multi',
    topic: 'Food',
    prompt: 'Anything off the menu?',
    hint: 'Pick all that apply',
    art: { kind: 'illustrated', tone: 'food', icon: 'salad' },
    options: [
      { id: 'veg', label: 'No meat', icon: 'salad', effects: { diet: 'veg' } },
      { id: 'no-egg', label: 'No eggs', icon: 'egg', effects: { diet: 'veg' } },
      { id: 'jain', label: 'Jain food', icon: 'sprout', effects: { diet: 'jain' } },
      { id: 'not-spicy', label: 'Not too spicy', icon: 'flame', effects: { dealbreaker: 'spicy' } },
      { id: 'no-fish', label: 'No seafood', icon: 'fish', effects: { tags: ['no-seafood'] } },
      { id: 'easy', label: 'None, I’m easy', icon: 'thumbs-up', exclusive: true, effects: { diet: 'non-veg' } },
    ],
  },
  {
    id: 'demo-afternoon',
    format: 'best-worst',
    topic: 'Afternoons',
    prompt: 'Best and worst way to spend one?',
    // A catalogue photo as a short band above the options
    art: { kind: 'catalog', experienceId: 'pichola-boat' },
    options: [
      { id: 'palace', label: 'Palace tour', icon: 'castle', detail: 'Guides, courtyards, stories', effects: { axes: { culture: 0.9 } } },
      { id: 'boat', label: 'Lake boat', icon: 'sailboat', detail: 'Feet up on the water', effects: { axes: { chill: 0.8 } } },
      { id: 'bazaar', label: 'Bazaar crawl', icon: 'shopping-bag', detail: 'Bandhej, silver, haggling', effects: { axes: { shops: 0.9 } } },
      { id: 'hike', label: 'Hill hike', icon: 'mountain', detail: 'Up to Sajjangarh on foot', effects: { axes: { adventure: 0.8 }, style: { walking: 1 } } },
    ],
  },
  {
    id: 'demo-budget',
    format: 'spectrum',
    topic: 'Budget',
    prompt: 'How much do you like to spend?',
    art: { kind: 'illustrated', tone: 'style', icon: 'wallet' },
    options: [
      { id: 'b0', label: 'Thrifty', icon: 'piggy-bank', detail: 'Street food and walking', effects: { style: { budget: 0 } } },
      { id: 'b1', label: 'Careful', icon: 'wallet', detail: 'Splurge once, save the rest', effects: { style: { budget: 0.25 } } },
      { id: 'b2', label: 'Middle', icon: 'scale', detail: 'Good value over cheap', effects: { style: { budget: 0.5 } } },
      { id: 'b3', label: 'Treat yourself', icon: 'gem', detail: 'Nice dinners, comfy rides', effects: { style: { budget: 0.75 } } },
      { id: 'b4', label: 'Splurge', icon: 'trophy', detail: 'It’s a holiday, mate', effects: { style: { budget: 1 } } },
    ],
  },
  {
    id: 'demo-live-music',
    format: 'swipe',
    topic: 'Nights',
    prompt: 'Live music till late',
    art: { kind: 'illustrated', tone: 'nightlife', icon: 'music' },
    options: [
      { id: 'live-music', label: 'Live music', icon: 'music', detail: 'Folk sets on a rooftop, then a late chai', effects: { axes: { nightlife: 0.9 }, style: { mornings: 0 } } },
    ],
  },
]

const TONES: { tone: Tone; icon: string }[] = [
  { tone: 'culture', icon: 'landmark' },
  { tone: 'food', icon: 'chef-hat' },
  { tone: 'adventure', icon: 'mountain' },
  { tone: 'chill', icon: 'waves' },
  { tone: 'nightlife', icon: 'martini' },
  { tone: 'shops', icon: 'shopping-bag' },
  { tone: 'style', icon: 'sparkles' },
]

/** “Riya and Kabir loved this”. Only likes and loves are ever named; nopes stay private. */
function fansLine(fans: Fan[] = []) {
  if (!fans.length) return null
  const names = fans.map((f) => f.name)
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  const loved = fans.every((f) => f.verdict === 'love')
  return <p className="swipe-demo__fans">{`${who} ${loved ? 'loved' : 'liked'} this`}</p>
}

type Logged = { card: Card; reply: Reply; ms: number }

export function SwipeDemo() {
  const [cards, setCards] = useState(DECK)
  const [log, setLog] = useState<Logged[]>([])
  const [round, setRound] = useState(0)

  const onAnswer = (card: Card, reply: Reply, ms: number) => {
    setCards((prev) => prev.filter((c) => c.id !== card.id))
    setLog((prev) => [...prev, { card, reply, ms }])
  }

  const onUndo = () => {
    const last = log.at(-1)
    if (!last) return
    setLog(log.slice(0, -1))
    setCards((prev) => [last.card, ...prev])
  }

  const reset = () => {
    setCards(DECK)
    setLog([])
    setRound((r) => r + 1)
  }

  return (
    <>
      <p className="states-page__caption">
        The Vibe Swipe card stack with every card format and kind of art. Answers land in the log below with the
        reply the API gets.
      </p>
      <div className="swipe-demo__stage">
        <QuizStack
          key={round}
          cards={cards}
          onAnswer={onAnswer}
          onUndo={onUndo}
          canUndo={log.length > 0}
          photoFor={photoFor}
          footer={(card) => fansLine(card.fans)}
          empty={
            <div className="card swipe-demo__done">
              <p className="swipe-demo__done-title">That’s the lot, mate</p>
              <p className="swipe-demo__done-text">Every card answered. Undo the last one, or deal the deck again.</p>
            </div>
          }
        />
      </div>
      <LinkButton className="states-page__reset" onClick={reset}>
        Deal the deck again
      </LinkButton>

      <section className="card swipe-demo__log" aria-labelledby="swipe-demo-log">
        <p id="swipe-demo-log" className="overline">
          Answers · {log.length} of {DECK.length}
        </p>
        {log.length === 0 ? (
          <p className="swipe-demo__empty">Nothing yet. Answer a card and it shows up here.</p>
        ) : (
          <ol className="swipe-demo__rows" reversed>
            {log
              .map((entry, i) => (
                <li key={`${entry.card.id}-${i}`} className="swipe-demo__row">
                  <span className="swipe-demo__row-head">
                    <span className="swipe-demo__prompt">{entry.card.prompt}</span>
                    <span className="swipe-demo__ms">{(entry.ms / 1000).toFixed(1)}s</span>
                  </span>
                  <code className="swipe-demo__reply">{JSON.stringify(entry.reply)}</code>
                </li>
              ))
              .reverse()}
          </ol>
        )}
      </section>

      <section className="swipe-demo__tones" aria-labelledby="swipe-demo-tones">
        <p id="swipe-demo-tones" className="overline">
          Illustrated tones
        </p>
        <ul className="swipe-demo__tone-grid">
          {TONES.map(({ tone, icon }) => (
            <li key={tone} className="swipe-demo__tone">
              <CardArt art={{ kind: 'illustrated', tone, icon }} size="band" />
              <span className="swipe-demo__tone-name">{tone}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
