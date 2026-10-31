import iconBell from '../../assets/figma/icon-perm-bell.svg'
import iconImage from '../../assets/figma/icon-perm-image.svg'
import iconMapPin from '../../assets/figma/icon-perm-map-pin.svg'
import iconMic from '../../assets/figma/icon-perm-mic.svg'
import iconMicPrimary from '../../assets/figma/icon-mic-primary.svg'
import iconScanFace from '../../assets/figma/icon-scan-face-primary-20.svg'
import iconVote from '../../assets/figma/icon-vote-primary.svg'
import iconWallet from '../../assets/figma/icon-wallet-primary.svg'
import type { PersonId } from '../../data/people'

export type OnboardingStep = 'welcome' | 'sign-in' | 'selfie' | 'about-you' | 'permissions' | 'invite'

export const ONBOARDING_STEPS: OnboardingStep[] = ['welcome', 'sign-in', 'selfie', 'about-you', 'invite']

export const isOnboardingStep = (route: string): route is OnboardingStep =>
  (ONBOARDING_STEPS as string[]).includes(route)

/** What the user fills in while signing up */
export type SignUpDetails = {
  email: string
  name: string
  username: string
  colour: string
  photo: string | null
  selfie: string | null
  googleId?: string
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

/* Intro carousel on Welcome: what Ghoomate does and how it works */

export const INTRO_SLIDE_COUNT = 4

/** Slide 2: you ask, GhoomMate answers with a day plan (stops from the Goa itinerary) */
export const PLAN_PREVIEW = {
  ask: 'Plan 4 days in Goa for the 5 of us',
  reply: 'Done! Here’s Day 1, tuned to your squad’s vibe:',
  stops: [
    { time: '06:00 AM', title: 'Sunrise at Chapora Fort' },
    { time: '01:00 PM', title: 'Beach-shack seafood crawl' },
    { time: '05:30 PM', title: 'Mandovi sunset cruise' },
  ],
}

/** Slide 3 */
export const HOW_IT_WORKS = [
  { title: 'Pick a place and dates', detail: 'Or let GhoomMate suggest one' },
  { title: 'Invite your squad', detail: 'Everyone takes a 1-minute vibe quiz' },
  { title: 'Get your plan and go', detail: 'Vote on the bits you like, and you’re set' },
]

/** Slide 4 */
export const TOP_FEATURES = [
  { icon: iconVote, title: 'Vote, don’t argue', detail: 'Stays, days and plans decided in a tap' },
  { icon: iconScanFace, title: 'Find every pic of you', detail: 'Face match sorts the whole album' },
  { icon: iconWallet, title: 'Settle up in 1 tap', detail: 'All your dues become one UPI payment' },
  { icon: iconMicPrimary, title: 'Just say it', detail: '“Add ₹600 for the cab” and it’s done' },
]
