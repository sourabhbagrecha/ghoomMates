export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/** A picture to hand to the share sheet or the downloads folder */
type Picture = {
  /** The signed link to the image: shared as a link where files can't be shared */
  url: string
  filename: string
  /** Builds the file to share when it isn't simply what `url` serves (e.g. a photo dressed in its frame) */
  makeBlob?: () => Promise<Blob>
}

async function blobOf({ url, makeBlob }: Picture): Promise<Blob> {
  if (makeBlob) return makeBlob()
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load the picture (${res.status})`)
  return res.blob()
}

/**
 * Shares the picture itself where the browser can (phones), so it doesn't depend on an expiring link; otherwise
 * copies the link, which works for 12 hours.
 */
export async function sharePicture(picture: Picture, title: string, text: string): Promise<ShareOutcome> {
  try {
    const blob = await blobOf(picture)
    const file = new File([blob], picture.filename, { type: blob.type || 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text })
      return 'shared'
    }
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return 'cancelled'
  }
  try {
    await navigator.clipboard.writeText(picture.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/** Saves the picture to the device. False when it couldn't be fetched. */
export async function downloadPicture(picture: Picture): Promise<boolean> {
  try {
    const href = URL.createObjectURL(await blobOf(picture))
    Object.assign(document.createElement('a'), { href, download: picture.filename }).click()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    return true
  } catch {
    return false
  }
}

/** "Mewar miniature" → "mewar-miniature" */
export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
