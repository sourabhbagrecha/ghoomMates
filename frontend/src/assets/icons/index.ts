// Lucide icons (ISC, see LICENSE) with the colour baked in: icon-<name>-<colour>.svg
const urls = import.meta.glob<string>('./icon-*.svg', { eager: true, import: 'default' })

export function iconUrl(name: string, colour: 'primary' | 'white'): string {
  const url = urls[`./icon-${name}-${colour}.svg`]
  if (!url) throw new Error(`Missing icon: icon-${name}-${colour}.svg`)
  return url
}
