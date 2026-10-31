// Remembers on this device that sign-up is finished, and the name used to greet
// the user. Replace with the real session/profile once auth is wired up.
const ONBOARDED_KEY = 'ghoomates:onboarded'
const NAME_KEY = 'ghoomates:name'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode / blocked storage: the user just sees onboarding again next time
  }
}

export const hasOnboarded = (): boolean => read(ONBOARDED_KEY) === '1'

export function markOnboarded(name: string): void {
  write(ONBOARDED_KEY, '1')
  if (name.trim()) write(NAME_KEY, name.trim())
}

export const getProfileName = (): string | null => read(NAME_KEY)
