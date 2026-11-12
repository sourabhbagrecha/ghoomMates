import iconBell from '../../assets/figma/icon-perm-bell.svg'
import iconImage from '../../assets/figma/icon-perm-image.svg'
import iconMapPin from '../../assets/figma/icon-perm-map-pin.svg'
import iconMic from '../../assets/figma/icon-perm-mic.svg'
import iconMicPrimary from '../../assets/figma/icon-mic-primary.svg'
import iconScanFace from '../../assets/figma/icon-scan-face-primary-20.svg'
import iconVote from '../../assets/figma/icon-vote-primary.svg'
import iconWallet from '../../assets/figma/icon-wallet-primary.svg'

export type OnboardingStep = 'welcome' | 'sign-in' | 'selfie' | 'about-you' | 'permissions'

export const ONBOARDING_STEPS: OnboardingStep[] = ['welcome', 'sign-in', 'selfie', 'about-you']

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

/* Intro carousel on Welcome: what GhoomMates does and how it works */

export const INTRO_SLIDE_COUNT = 4

/** Slide 2: you ask, GhoomMate answers with a day plan (stops from the Udaipur guide trips) */
export const PLAN_PREVIEW = {
  ask: 'Plan 4 days in Udaipur for the 5 of us',
  reply: 'Done! Here’s Day 1, tuned to your squad’s vibe:',
  stops: [
    { time: '10:30 AM', title: 'Molela pottery workshop' },
    { time: '01:30 PM', title: 'Haveli thali by the lake' },
    { time: '05:00 PM', title: 'Pichola sunset boat' },
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
