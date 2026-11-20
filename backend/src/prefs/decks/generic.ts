// The trip deck for destinations without a catalogue: kinds of activity rather than bookable experiences, so a squad
// heading anywhere still learns what everyone wants to do there.
import type { Axis, Card, Effects } from '../taste.ts';

type Archetype = { slug: string; prompt: string; label: string; topic: string; tone: Axis; icon: string; effects: Effects };

const ARCHETYPES: Archetype[] = [
  { slug: 'sunrise-hike', prompt: 'Sunrise hike', label: 'Sunrise hike', topic: 'Adventure', tone: 'adventure', icon: 'sunrise', effects: { axes: { adventure: 0.9, chill: 0.2 }, style: { mornings: 1, walking: 0.9 }, tags: ['hikes', 'sunrise', 'viewpoints'] } },
  { slug: 'street-food-crawl', prompt: 'Street-food crawl with a local', label: 'Street-food crawl', topic: 'Food', tone: 'food', icon: 'sandwich', effects: { axes: { food: 1, culture: 0.3 }, style: { budget: 0.2, walking: 0.7 }, tags: ['street-food'] } },
  { slug: 'cooking-class', prompt: 'Cook with a local family', label: 'Cooking class', topic: 'Food', tone: 'food', icon: 'chef-hat', effects: { axes: { food: 0.9, culture: 0.5 }, tags: ['cooking'] } },
  { slug: 'heritage-walk', prompt: 'Old town heritage walk', label: 'Heritage walk', topic: 'Culture', tone: 'culture', icon: 'footprints', effects: { axes: { culture: 1, adventure: 0.1 }, style: { walking: 0.9, mornings: 0.7 }, tags: ['heritage', 'heritage-walks'] } },
  { slug: 'museum-afternoon', prompt: 'An afternoon at the museum', label: 'Museum afternoon', topic: 'Culture', tone: 'culture', icon: 'landmark', effects: { axes: { culture: 0.9, chill: 0.4 }, style: { pace: 0.3 }, tags: ['museums'] } },
  { slug: 'night-market', prompt: 'Night market wander', label: 'Night market', topic: 'Shopping', tone: 'shops', icon: 'shopping-bag', effects: { axes: { shops: 0.9, food: 0.5, nightlife: 0.3 }, style: { mornings: 0.2 }, tags: ['markets', 'street-food'] } },
  { slug: 'rooftop-bar', prompt: 'Rooftop bar at sunset', label: 'Rooftop bar', topic: 'Nightlife', tone: 'nightlife', icon: 'martini', effects: { axes: { nightlife: 0.8, chill: 0.5 }, style: { budget: 0.7, mornings: 0.2 }, tags: ['rooftops', 'sunsets'] } },
  { slug: 'live-music', prompt: 'Live music night', label: 'Live music', topic: 'Nightlife', tone: 'nightlife', icon: 'music', effects: { axes: { nightlife: 0.9, culture: 0.3 }, style: { mornings: 0 }, tags: ['live-music'] } },
  { slug: 'spa-day', prompt: 'A slow spa day', label: 'Spa day', topic: 'Chill', tone: 'chill', icon: 'flower-2', effects: { axes: { chill: 1 }, style: { pace: 0, budget: 0.7 }, tags: ['spa', 'wellness'] } },
  { slug: 'kayaking', prompt: 'Paddle a kayak', label: 'Kayaking', topic: 'Adventure', tone: 'adventure', icon: 'sailboat', effects: { axes: { adventure: 0.8, chill: 0.4 }, style: { eco: 0.7 }, tags: ['kayaking'] } },
  { slug: 'cycling-tour', prompt: 'Cycle the back roads', label: 'Cycling tour', topic: 'Adventure', tone: 'adventure', icon: 'bike', effects: { axes: { adventure: 0.7, culture: 0.3 }, style: { eco: 1, walking: 0.7 }, tags: ['cycling'] } },
  { slug: 'artisan-workshop', prompt: 'Make something with an artisan', label: 'Artisan workshop', topic: 'Culture', tone: 'culture', icon: 'palette', effects: { axes: { culture: 0.8, shops: 0.5 }, style: { eco: 0.7 }, tags: ['artisans', 'workshops'] } },
  { slug: 'local-festival', prompt: 'Catch a local festival', label: 'Local festival', topic: 'Culture', tone: 'culture', icon: 'party-popper', effects: { axes: { culture: 0.8, nightlife: 0.4, food: 0.3 }, style: { crowds: 0.9 }, tags: ['festivals', 'events'] } },
  { slug: 'temple-visit', prompt: 'Temple or ritual visit', label: 'Temple visit', topic: 'Culture', tone: 'culture', icon: 'sparkles', effects: { axes: { culture: 0.9, chill: 0.3 }, style: { mornings: 0.7 }, tags: ['temples', 'rituals'] } },
  { slug: 'lazy-shore', prompt: 'Lazy day by the water', label: 'Lazing by water', topic: 'Chill', tone: 'chill', icon: 'tree-palm', effects: { axes: { chill: 1 }, style: { pace: 0 }, tags: ['beaches', 'lakes'] } },
  { slug: 'photo-walk', prompt: 'Photo walk', label: 'Photo walk', topic: 'Culture', tone: 'culture', icon: 'camera', effects: { axes: { culture: 0.6, adventure: 0.3 }, style: { walking: 0.8 }, tags: ['photography'] } },
  { slug: 'farm-to-table', prompt: 'Farm-to-table meal', label: 'Farm-to-table meal', topic: 'Food', tone: 'food', icon: 'sprout', effects: { axes: { food: 0.8, culture: 0.3, chill: 0.3 }, style: { eco: 1 }, tags: ['farm-to-table'] } },
  { slug: 'wildlife-safari', prompt: 'Wildlife safari', label: 'Wildlife safari', topic: 'Adventure', tone: 'adventure', icon: 'binoculars', effects: { axes: { adventure: 0.8, chill: 0.3 }, style: { mornings: 0.9, budget: 0.7 }, tags: ['wildlife', 'safari'] } },
];

export const GENERIC_DECK: Card[] = ARCHETYPES.map(({ slug, prompt, label, topic, tone, icon, effects }) => ({
  id: `gen:${slug}`,
  format: 'swipe',
  topic,
  prompt,
  art: { kind: 'illustrated', tone, icon },
  options: [{ id: slug, label, icon, effects }],
}));
