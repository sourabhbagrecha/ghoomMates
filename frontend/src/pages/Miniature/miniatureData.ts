import type { ArtworkStyleId } from '../../services/artworksService'
import type { TripPhoto } from '../../services/tripsService'

export type StyleCard = {
  id: ArtworkStyleId
  name: string
  /** One line on the tradition behind the style, shown on its card */
  tradition: string
  /** A sample painting of a made-up squad, in public/miniature */
  sample: string
  /** What the painter says about this style while it is being made */
  painting: string
}

/** Ids match backend/src/artworks/styles.ts */
export const STYLES: StyleCard[] = [
  {
    id: 'mewar-miniature',
    name: 'Mewar miniature',
    tradition: 'Udaipur’s royal court painting: flat space, mineral colours, ornate borders.',
    sample: '/miniature/mewar-miniature.jpg',
    painting: 'Painting Lake Pichola behind you…',
  },
  {
    id: 'royal-procession',
    name: 'Royal procession',
    tradition: 'Court painters adored a grand sawari: parasols, drums and a painted elephant.',
    sample: '/miniature/royal-procession.jpg',
    painting: 'Lining up the elephant and the parasols…',
  },
  {
    id: 'jharokha-portrait',
    name: 'Jharokha portrait',
    tradition: 'Faces framed in a carved palace window, like the jharokhas of the City Palace.',
    sample: '/miniature/jharokha-portrait.jpg',
    painting: 'Carving the palace window around you…',
  },
  {
    id: 'phad-scroll',
    name: 'Phad scroll',
    tradition: 'Rajasthan’s story scrolls on cloth, unrolled by bhopa singers. This one tells your trip.',
    sample: '/miniature/phad-scroll.jpg',
    painting: 'Unrolling the scroll to tell your trip…',
  },
]

export const styleById = (id: string) => STYLES.find((style) => style.id === id)

/** The painter's running commentary while the picture renders, three seconds a line */
export const painterLines = (style: StyleCard) => [
  'Grinding mineral colours…',
  'Sketching your squad with a squirrel-hair brush…',
  style.painting,
  'Dressing everyone in their festive best…',
  'Laying gold leaf on the jewellery…',
  'Painting the border, petal by petal…',
  'Counting heads, so nobody is left out…',
]

/**
 * True things about the craft, shown while the painter works. Sources are listed in backend/docs/artworks.md.
 * `only` pins a fact to one style.
 */
export const DID_YOU_KNOW: { text: string; only?: ArtworkStyleId }[] = [
  { text: 'Miniature painters grind minerals and semi-precious stones into colour: lapis lazuli for blue, malachite for green, orpiment for yellow.' },
  { text: 'The finest miniature brushes are traditionally made from squirrel hair.' },
  { text: 'Gold and silver leaf go on jewellery and domes, for a shimmer fit for a palace.' },
  { text: 'Mewar’s court painters recorded processions, festivals and palace life in fine detail.' },
  { text: 'Udaipur’s City Palace Museum keeps centuries of Mewar paintings.' },
  { text: 'Sahibdin, one of Mewar’s great court painters, worked in Udaipur around 1628 to 1655.', only: 'mewar-miniature' },
  { text: 'A jharokha is a carved, projecting window balcony. The City Palace has many.', only: 'jharokha-portrait' },
  { text: 'Phad scrolls are unrolled by bhopa singers, who tell the story by lamplight.', only: 'phad-scroll' },
]

/** Where the "real thing" link goes: the makers directory, filtered to miniature painters near City Palace */
export const COMMISSION = {
  title: 'Want the real thing?',
  text: 'A Mewar miniature painter near City Palace can paint this squad by hand.',
  action: 'Meet painters near City Palace',
  href: '#/trip/explore/makers?craft=miniature-painting',
}

/** What the screen says when a painting can't be made; the photo then gets a miniature frame instead. */
export type FailureNote = { title: string; text: string; retry: boolean }

const NOTES: Record<string, FailureNote> = {
  ARTWORK_UNAVAILABLE: {
    title: 'The painters are busy',
    text: 'They’re all at work right now. Here’s your squad in a miniature frame while they catch up.',
    retry: true,
  },
  ARTWORK_TIMEOUT: {
    title: 'The painter is taking too long',
    text: 'This one needs more time than we have. Here’s your squad in a miniature frame for now.',
    retry: true,
  },
  ARTWORK_BLOCKED: {
    title: 'That photo can’t be painted',
    text: 'Try another photo of the squad. Here’s this one in a miniature frame.',
    retry: false,
  },
  ARTWORK_LIMIT: {
    title: 'The painters are resting',
    text: 'Your squad has used today’s paintings. Come back tomorrow. Here’s this photo in a miniature frame.',
    retry: false,
  },
  NETWORK_ERROR: {
    title: 'No connection',
    text: 'Can’t reach Ghoomates right now. Here’s your squad in a miniature frame.',
    retry: true,
  },
}

const GENERIC_NOTE: FailureNote = {
  title: 'The painter couldn’t finish this one',
  text: 'Here’s your squad in a miniature frame. Try again in a moment.',
  retry: true,
}

export const failureNote = (code: string): FailureNote => NOTES[code] ?? GENERIC_NOTE

/**
 * Errors that mean the request itself was wrong (the photo went away, the file type, the session ended): they stay
 * on the picker with a message, since a framed copy of the same photo wouldn't help.
 */
export const INLINE_ERRORS: Record<string, string> = {
  PHOTO_NOT_FOUND: 'That photo is no longer in the album. Pick another one.',
  UNSUPPORTED_PHOTO: 'The painter works from JPEG, PNG, WebP or HEIC photos. Pick another one.',
  PHOTO_TOO_LARGE: 'That photo is too big for the painter. Pick a smaller one.',
  UNAUTHORIZED: 'Your session ended. Sign in again to paint.',
  NOT_FOUND: 'We couldn’t find this trip. Head back and open it again.',
}

/** Faces the cloud pipeline found in a photo; 0 until it has been indexed */
export const faceCount = (photo: TripPhoto) => (photo.faces?.status === 'indexed' ? photo.faces.count : 0)

/**
 * Group shots first: the closer a photo's face count is to the squad's size, the better it paints.
 * Photos with fewer than two faces come last, newest first within each group.
 */
export function rankPhotos(photos: TripPhoto[], squadSize: number) {
  const score = (photo: TripPhoto) => {
    const faces = faceCount(photo)
    return faces >= 2 ? 100 - Math.abs(faces - squadSize) : 0
  }
  return [...photos].sort((a, b) => score(b) - score(a))
}

/** "just now", "5 min ago", "3 h ago", "2 days ago" */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}
