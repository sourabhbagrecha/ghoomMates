import { useRef, useState } from 'react'
import {
  ApiRequestError,
  tripsApi,
  type PhotoExpression,
  type PhotoFilter,
  type PhotoSearchResult,
  type TripDetail,
  type TripPhoto,
} from '../../services/tripsService'
import { setPhotoFilter, usePhotoFilter } from './faceSearch'

export const EXPRESSION_CHIPS: { expression: PhotoExpression; label: string }[] = [
  { expression: 'happy', label: 'Smiling' },
  { expression: 'surprise', label: 'Surprised' },
  { expression: 'neutral', label: 'Serious' },
]
const SCENE_CHIPS = 6

const SEARCH_ERRORS: Record<string, string> = {
  NO_SELFIE: 'They haven’t added a selfie yet, so they can’t be found',
  SELFIE_PROCESSING: 'Still reading their selfie, try again in a minute',
  NOT_IN_TRIP: 'Couldn’t tell whose photos or which moment, try “Bhavya at the haldi”',
  FACE_SEARCH_UNAVAILABLE: 'Photo search is busy right now, try again in a minute',
}

const isEmpty = (f: PhotoFilter) => !f.userIds.length && !f.expression && !f.scene

/** The trip's most common scene tags (from the cloud tagger), for one-tap chips */
function topTags(photos: TripPhoto[]) {
  const counts = new Map<string, number>()
  photos.forEach((p) => p.tags?.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)))
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, SCENE_CHIPS)
    .map(([tag]) => tag)
}

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const nameList = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

type PhotoSearchOptions = {
  trip: TripDetail | null
  photos: TripPhoto[]
  onSearching: (searching: boolean) => void
  showToast: (message: string) => void
}

/**
 * Search the album by who is in a photo, their expression and the scene: a sentence in the box ("me smiling at the
 * haldi"), or taps on people and chips. Both land in the shared photo filter, as do GhoomMate's voice searches, so
 * the controls always show how the current filter was understood. The box lives on the blue header and the people
 * and chips sit under it, so the state is shared through this hook.
 */
export function usePhotoSearch({ trip, photos, onSearching, showToast }: PhotoSearchOptions) {
  const state = usePhotoFilter()
  const [query, setQuery] = useState('')
  // The filter being searched for, shown in the controls until its result lands
  const [pending, setPending] = useState<PhotoFilter | null>(null)
  const latest = useRef(0)

  const shown: PhotoFilter = pending ?? state?.filter ?? { userIds: [], match: 'any' }
  const me = trip?.members.find((m) => m.memberId === trip.memberId)
  const members = [...(trip?.members ?? [])].sort((a, b) => Number(b.memberId === trip?.memberId) - Number(a.memberId === trip?.memberId))
  const sceneTags = topTags(photos)
  if (shown.scene && !sceneTags.includes(shown.scene)) sceneTags.unshift(shown.scene)

  const run = async (search: () => Promise<PhotoSearchResult>, draft: PhotoFilter | null) => {
    if (!trip) return
    const id = ++latest.current
    setPending(draft)
    onSearching(true)
    try {
      const result = await search()
      if (id !== latest.current) return
      setPhotoFilter({ ids: new Set(result.photoIds), label: capitalise(result.label), filter: result.filter, source: 'search' })
      const skipped = result.skipped.map((s) => (s.userId === me?.userId ? 'You' : s.name))
      const notes = [
        result.unmatched?.length ? `No one called ${nameList(result.unmatched)} in this trip` : '',
        skipped.length ? `${nameList(skipped)} ${skipped.length === 1 && skipped[0] !== 'You' ? 'has' : 'have'} no selfie yet, so ${skipped.length === 1 && skipped[0] !== 'You' ? 'wasn’t' : 'weren’t'} searched` : '',
      ].filter(Boolean)
      if (notes.length) showToast(notes.join(' · '))
    } catch (err) {
      if (id !== latest.current) return
      const code = err instanceof ApiRequestError ? err.code : ''
      showToast(SEARCH_ERRORS[code] ?? 'Couldn’t search the photos right now, try again')
    } finally {
      if (id === latest.current) {
        setPending(null)
        onSearching(false)
      }
    }
  }

  const apply = (next: PhotoFilter) => {
    if (!trip) return
    if (next.userIds.length < 2) next = { ...next, match: 'any' }
    if (isEmpty(next)) {
      latest.current++
      setPending(null)
      onSearching(false)
      setPhotoFilter(null)
      return
    }
    void run(() => tripsApi.findPhotos(trip.id, next), next)
  }

  const submit = () => {
    const text = query.trim()
    if (!text || !trip) return
    void run(() => tripsApi.searchPhotos(trip.id, text), null)
  }

  return {
    query,
    setQuery,
    submit,
    shown,
    members,
    sceneTags,
    togglePerson: (userId: string) => {
      const userIds = shown.userIds.includes(userId) ? shown.userIds.filter((id) => id !== userId) : [...shown.userIds, userId]
      apply({ ...shown, userIds })
    },
    toggleExpression: (expression: PhotoExpression) => apply({ ...shown, expression: shown.expression === expression ? undefined : expression }),
    toggleScene: (scene: string) => apply({ ...shown, scene: shown.scene === scene ? undefined : scene }),
    toggleTogether: () => apply({ ...shown, match: shown.match === 'all' ? 'any' : 'all' }),
  }
}

export type PhotoSearch = ReturnType<typeof usePhotoSearch>
