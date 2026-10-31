// An invite link opened before signing in, joined once onboarding is done.
const KEY = 'ghoomates:pendingInvite'

export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setPendingInvite(code: string | null): void {
  try {
    if (code) localStorage.setItem(KEY, code)
    else localStorage.removeItem(KEY)
  } catch {
    // Blocked storage: the user can open the link again
  }
}

/** Accepts a full invite link ("…/#/join/abc123") or just the code */
export function inviteCodeFrom(input: string): string | null {
  const match = /(?:join\/)?([a-z0-9]{4,32})\/?\s*$/i.exec(input.trim())
  return match ? match[1].toLowerCase() : null
}
