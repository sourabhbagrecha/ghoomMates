import iconBell from '../../assets/figma/icon-perm-bell.svg'
import iconImage from '../../assets/figma/icon-perm-image.svg'
import iconMapPin from '../../assets/figma/icon-perm-map-pin.svg'
import iconMic from '../../assets/figma/icon-perm-mic.svg'
import type { PersonId } from '../../data/people'

export type OnboardingStep = 'welcome' | 'sign-in' | 'verify' | 'profile' | 'selfie' | 'permissions' | 'invite'

export const ONBOARDING_STEPS: OnboardingStep[] = ['welcome', 'sign-in', 'verify', 'profile', 'selfie', 'permissions', 'invite']

export const isOnboardingStep = (route: string): route is OnboardingStep =>
  (ONBOARDING_STEPS as string[]).includes(route)

/** What the user fills in while signing up */
export type SignUpDetails = {
  phone: string
  name: string
  username: string
  colour: string
  photo: string | null
  selfie: string | null
}

export const COUNTRY_CODE = '+91'
export const PHONE_LENGTH = 10
export const OTP_LENGTH = 6
export const RESEND_SECONDS = 30

export const COLOURS = [
  { id: 'sunshine', label: 'Sunshine', value: 'var(--color-amber)' },
  { id: 'sky', label: 'Sky', value: 'var(--color-sky)' },
  { id: 'pink', label: 'Pink', value: 'var(--color-person-kabir)' },
  { id: 'purple', label: 'Purple', value: 'var(--color-person-meera)' },
  { id: 'green', label: 'Green', value: 'var(--color-person-dev)' },
  { id: 'blue', label: 'Blue', value: 'var(--color-primary)' },
]

export type PermissionId = 'microphone' | 'notifications' | 'photos' | 'location'

export const PERMISSIONS: { id: PermissionId; title: string; description: string; icon: string }[] = [
  { id: 'microphone', title: 'Microphone', description: 'Talk to GhoomMate hands-free', icon: iconMic },
  { id: 'notifications', title: 'Notifications', description: 'Votes, payment requests and new photos', icon: iconBell },
  { id: 'photos', title: 'Photos', description: 'Find and share your trip pics', icon: iconImage },
  { id: 'location', title: 'Location', description: 'Live trip map and spots nearby', icon: iconMapPin },
]

export const INVITE: {
  from: PersonId
  group: string
  members: PersonId[]
  trip: string
  dates: string
  place: string
  badge: string
  vibe: string
  match: number
} = {
  from: 'riya',
  group: 'Goa Gang',
  members: ['riya', 'kabir', 'meera', 'dev'],
  trip: 'Goa Trip',
  dates: 'Fri 30 Oct – Mon 2 Nov',
  place: 'North Goa, India',
  badge: '4 days · 5 mates',
  vibe: 'The Thrill-Seeking Foodies',
  match: 92,
}

/** "9876543210" → "98765 43210" */
export const formatPhone = (digits: string) =>
  digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits
