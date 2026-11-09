// The app was renamed from Ghoomates to GhoomMates, and its storage keys with it. Move anything saved under the
// old "ghoomates:" prefix once, before any module reads it, so signed-in users and their saved state carry over.
const OLD_PREFIX = 'ghoomates:'
const NEW_PREFIX = 'ghoommates:'

for (const store of [localStorage, sessionStorage]) {
  try {
    const oldKeys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter(
      (key): key is string => key?.startsWith(OLD_PREFIX) ?? false,
    )
    for (const key of oldKeys) {
      const newKey = NEW_PREFIX + key.slice(OLD_PREFIX.length)
      const value = store.getItem(key)
      if (value !== null && store.getItem(newKey) === null) store.setItem(newKey, value)
      store.removeItem(key)
    }
  } catch {
    // Storage blocked (private mode): nothing to move
  }
}
