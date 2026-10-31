// Remembers on this device that sign-up is finished. Replace with the real
// session once auth is wired up.
const KEY = 'ghoomates:onboarded'

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Private mode / blocked storage: the user just sees onboarding again next time
  }
}
