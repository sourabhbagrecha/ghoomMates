import { iconUrl } from '../../assets/icons'
import type { Axis, Card } from '../../data/taste'
import { strongestAxis } from './motion'
import type { CataloguePhoto } from './QuizStack'

export type Tone = Axis | 'style'

/** What the top of a card shows once the catalogue photo (or its absence) is known */
export type ResolvedArt =
  | { kind: 'photo'; src: string; alt: string; credit?: string; license?: string; source?: string }
  | { kind: 'illustrated'; tone: Tone; icon: string }

/** Yellow and pale tones carry a primary icon (white on yellow is unreadable); the rest a white one */
export const ICON_ON_TONE: Record<Tone, 'white' | 'primary'> = {
  culture: 'white',
  food: 'primary',
  adventure: 'white',
  chill: 'primary',
  nightlife: 'white',
  shops: 'white',
  style: 'white',
}

/** An icon a deck names but the app doesn't have falls back to sparkles instead of breaking the stack */
export function safeIcon(name: string, colour: 'primary' | 'white'): string {
  try {
    return iconUrl(name, colour)
  } catch {
    return iconUrl('sparkles', colour)
  }
}

/**
 * Swipe cards always have art (an illustration from the subject's strongest axis when the deck gives none);
 * other formats only when the deck asks for it. A catalogue card with no photo, or a photo that failed to load,
 * falls back to the illustration.
 */
export function resolveArt(
  card: Card,
  photoFor: ((experienceId: string) => CataloguePhoto | undefined) | undefined,
  photoFailed: boolean,
): ResolvedArt | undefined {
  const subject = card.options[0]
  const illustrated = (): ResolvedArt => ({ kind: 'illustrated', tone: strongestAxis(subject) ?? 'style', icon: subject?.icon ?? 'sparkles' })
  const art = card.art
  if (!art) return card.format === 'swipe' ? illustrated() : undefined
  if (art.kind === 'illustrated') return art
  const photo = art.kind === 'catalog' ? photoFor?.(art.experienceId) : art
  if (!photo?.src || photoFailed) return illustrated()
  return { kind: 'photo', src: photo.src, alt: photo.alt, credit: photo.credit, license: photo.license, source: photo.source }
}
