import { getToken } from './authService'
import type { StopCrowd } from './heritageService'

/* Types mirror backend/src/trips/service.ts. Money is integer paise. */

export type TripMember = {
  memberId: string
  userId: string
  name: string
  username?: string
  picture: string | null
  colour: string | null
  persona?: string | null
  /** Personality-quiz scores, 0–1 per vibe axis */
  vibe?: Record<string, number> | null
  role: 'organiser' | 'mate'
  joinedAt?: string
  balancePaise: number
}

export type TripSummaryMember = Pick<TripMember, 'memberId' | 'userId' | 'name' | 'picture' | 'colour'>

type TripBase = {
  id: string
  name: string
  groupName: string
  destination: string
  /** YYYY-MM-DD */
  startDate: string | null
  endDate: string | null
  budget: string
  /** A create-flow destination id, used to pick a cover image */
  cover: string
  details: Record<string, unknown>
  createdBy: string
  createdAt: string
}

export type TripListItem = TripBase & {
  role: TripMember['role']
  memberId: string
  memberCount: number
  photoCount: number
  totalSpentPaise: number
  myBalancePaise: number
  members: TripSummaryMember[]
}

export type TripDetail = TripBase & {
  role: TripMember['role']
  /** Your ledger member id in this trip */
  memberId: string
  inviteCode: string
  inviteUrl: string
  members: TripMember[]
}

/** What a trip update returns: the trip, plus how many stops moved to the new last day because the trip got shorter */
export type TripUpdate = TripDetail & { movedStops: number }

export type InvitePreview = TripBase & {
  code: string
  invitedBy: { name: string; picture: string | null } | null
  members: Pick<TripMember, 'memberId' | 'name' | 'picture' | 'colour'>[]
  alreadyMember: boolean
}

export type ExpenseCategory = 'food' | 'stays' | 'travel' | 'fun' | 'other'

export type Expense = {
  id: string
  description: string
  amountPaise: number
  payerMemberId: string
  splitType: 'equal' | 'exact' | 'percentage'
  category: ExpenseCategory
  shares: { memberId: string; amountPaise: number }[]
  receiptUrl: string | null
  createdBy: string | null
  createdAt: string
}

export type Transfer = { fromMemberId: string; toMemberId: string; amountPaise: number }

export type TripSummary = {
  currency: 'INR'
  memberId: string
  totalSpentPaise: number
  expenseCount: number
  balances: { memberId: string; netPaise: number }[]
  transfers: Transfer[]
  naiveTransferCount: number
  categories: { category: ExpenseCategory; amountPaise: number; count: number }[]
}

export type Settlement = {
  id: string
  fromMemberId: string
  toMemberId: string
  amountPaise: number
  note: string
  createdAt: string
}

export type TripPhoto = {
  id: string
  url: string
  width: number | null
  height: number | null
  caption: string
  uploadedBy: { userId: string; name: string }
  createdAt: string
  /** Filled in by the cloud pipeline a few seconds after upload */
  faces?: { status: 'pending' | 'indexed' | 'no_faces' | 'error'; count: number }
}

export type FaceSummary = { indexed: number; noFaces: number; pending: number; failed: number; faces: number }

export type TripPhotos = { items: TripPhoto[]; total: number; faceSummary?: FaceSummary }

export type FindMeMatch = {
  photoId: string
  distance: number
  width: number
  height: number
  faces: { x: number; y: number; w: number; h: number; distance: number }[]
}

export type Rsvp = 'going' | 'maybe' | 'skip'

export type ItineraryStop = {
  id: string
  dayNumber: number
  /** "05:30 PM", or empty when not set */
  time: string
  title: string
  tag: string
  place: string
  notes: string
  /** Member ids of everyone going */
  going: string[]
  myRsvp: Rsvp | null
  /** Crowd forecast when the stop is a known heritage site */
  crowd?: StopCrowd | null
}

export type ItineraryDay = { number: number; title: string; stops: ItineraryStop[] }

export type DraftStop = { time: string; title: string; tag: string; place: string; notes: string }

/** A suggested plan: each slot lists the pick first, then alternatives to swap to */
export type DraftPlan = { days: { title: string; slots: DraftStop[][] }[]; tip: string; source: 'gemini' | 'template' }

export type StopInput = { dayNumber: number; time: string; title: string; tag: string; place?: string; notes?: string }

export type NewTrip = {
  name: string
  groupName?: string
  destination?: string
  startDate?: string | null
  endDate?: string | null
  budget?: string
  cover?: string
  details?: Record<string, unknown>
}

export type NewExpense = {
  description: string
  amountPaise: number
  payerMemberId: string
  category: ExpenseCategory
  split:
    | { type: 'equal'; participants: { memberId: string }[] }
    | { type: 'exact'; participants: { memberId: string; value: number }[] }
  receiptKey?: string
}

export class ApiRequestError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function request<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Can’t reach Ghoommates. Check your connection.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiRequestError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? `Request failed (${res.status})`)
  }
  return data as T
}

const trip = (id: string) => `/api/trips/${encodeURIComponent(id)}`

export const tripsApi = {
  list: () => request<{ items: TripListItem[] }>('/api/trips').then((r) => r.items),
  create: (input: NewTrip) => request<TripDetail>('/api/trips', { body: input }),
  get: (id: string) => request<TripDetail>(trip(id)),
  update: (id: string, patch: Partial<NewTrip>) => request<TripUpdate>(trip(id), { method: 'PATCH', body: patch }),
  previewInvite: (code: string) => request<InvitePreview>(`/api/trips/invites/${encodeURIComponent(code)}`),
  join: (code: string) => request<TripDetail>('/api/trips/join', { body: { code } }),
  summary: (id: string) => request<TripSummary>(`${trip(id)}/summary`),
  expenses: (id: string) => request<{ items: Expense[] }>(`${trip(id)}/expenses?limit=100`).then((r) => r.items),
  addExpense: (id: string, input: NewExpense, idempotencyKey: string) =>
    request<Expense>(`${trip(id)}/expenses`, { body: input, idempotencyKey }),
  settlements: (id: string) => request<{ items: Settlement[] }>(`${trip(id)}/settlements?limit=100`).then((r) => r.items),
  settle: (id: string, transfer: Transfer & { note?: string }, idempotencyKey: string) =>
    request<Settlement>(`${trip(id)}/settlements`, { body: transfer, idempotencyKey }),
  photos: (id: string) => request<TripPhotos>(`${trip(id)}/photos?limit=500`),
  findMe: (id: string, selfies: string[]) =>
    request<{ matches: FindMeMatch[]; threshold: number; truncated: boolean }>(`${trip(id)}/photos/find-me`, { body: { selfies } }),
  addPhotos: (id: string, photos: { key: string; width?: number; height?: number }[]) =>
    request<{ added: number }>(`${trip(id)}/photos`, { body: { photos } }),
  itinerary: (id: string) => request<{ days: ItineraryDay[] }>(`${trip(id)}/itinerary`).then((r) => r.days),
  saveItinerary: (id: string, days: { title: string; stops: DraftStop[] }[]) =>
    request<{ days: ItineraryDay[] }>(`${trip(id)}/itinerary`, { method: 'PUT', body: { days } }).then((r) => r.days),
  /** Asks GhoomMate (Gemini) for a plan, or a fresh take on one day */
  draft: (id: string, options: { day?: number; tweaks?: string[] } = {}) => request<DraftPlan>(`${trip(id)}/itinerary/draft`, { body: options }),
  addStop: (id: string, stop: StopInput) => request<{ id: string }>(`${trip(id)}/stops`, { body: stop }),
  updateStop: (id: string, stopId: string, stop: StopInput) =>
    request<{ id: string }>(`${trip(id)}/stops/${stopId}`, { method: 'PATCH', body: stop }),
  deleteStop: (id: string, stopId: string) => request<null>(`${trip(id)}/stops/${stopId}`, { method: 'DELETE' }),
  rsvp: (id: string, stopId: string, rsvp: Rsvp) => request<{ rsvp: Rsvp }>(`${trip(id)}/stops/${stopId}/rsvp`, { method: 'PUT', body: { rsvp } }),
}

const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
const MAX_EDGE = 2048

export const isHeicFile = (f: File) => /^image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)

/** iPhone HEIC photos don't render in Chrome, so they're turned into JPEGs before previewing or uploading */
export async function toJpegIfHeic(file: File): Promise<File> {
  if (!isHeicFile(file)) return file
  try {
    const { heicTo } = await import('heic-to')
    const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 })
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/** Downscales big camera photos to a 2048px JPEG so uploads stay quick; small or unsupported files go as they are. */
async function prepareImage(original: File): Promise<{ blob: Blob; type: string; width?: number; height?: number }> {
  const file = await toJpegIfHeic(original)
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
    if (scale === 1 && file.size < 2_500_000 && UPLOAD_TYPES.includes(file.type)) {
      bitmap.close()
      return { blob: file, type: file.type, width, height }
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (blob) return { blob, type: 'image/jpeg', width: canvas.width, height: canvas.height }
  } catch {
    // The browser can't decode it: upload the original
  }
  return { blob: file, type: UPLOAD_TYPES.includes(file.type) ? file.type : 'image/jpeg' }
}

/**
 * Browser → bucket upload: the backend hands out a short-lived signed URL, the file goes straight
 * to Google Cloud Storage (or the backend's local fallback), and the returned key is then attached
 * to a photo or expense.
 */
export async function uploadImage(tripId: string, kind: 'photo' | 'receipt', file: File) {
  const image = await prepareImage(file)
  const { key, upload } = await request<{ key: string; upload: { url: string; method: 'PUT'; headers: Record<string, string> } }>(
    `${trip(tripId)}/uploads`,
    { body: { kind, contentType: image.type, size: image.blob.size } },
  )
  const res = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: image.blob }).catch(() => null)
  if (!res?.ok) throw new ApiRequestError(res?.status ?? 0, 'UPLOAD_FAILED', 'Upload failed. Try again.')
  return { key, width: image.width, height: image.height }
}

export const newIdempotencyKey = () => crypto.randomUUID()
