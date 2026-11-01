/**
 * Dresses a photo in the miniature frame on a canvas, so the "painter is busy" fallback is still something the
 * squad can share or keep. The colours match MiniatureFrame.css.
 */
const VERMILION = '#b0281c'
const GOLD = '#e0a93b'
const IVORY = '#f8efd8'
const LONG_EDGE = 1400

function rosette(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = IVORY
  ctx.fill()
  ctx.lineWidth = radius * 0.11
  ctx.strokeStyle = GOLD
  ctx.stroke()
  ctx.fillStyle = VERMILION
  for (let i = 0; i < 8; i++) {
    ctx.save()
    ctx.rotate((i * Math.PI) / 4)
    ctx.beginPath()
    ctx.ellipse(0, -radius * 0.5, radius * 0.18, radius * 0.36, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.24, 0, Math.PI * 2)
  ctx.fillStyle = GOLD
  ctx.fill()
  ctx.restore()
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const r = height / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

/** The photo at `photoUrl` inside a vermilion-and-gold frame with `label` on a name plate, as a JPEG. */
export async function framePhoto(photoUrl: string, label: string): Promise<Blob> {
  const res = await fetch(photoUrl)
  if (!res.ok) throw new Error(`Could not load the photo (${res.status})`)
  const bitmap = await createImageBitmap(await res.blob())
  await document.fonts?.load('800 24px Poppins').catch(() => [])

  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const band = Math.round(Math.max(w, h) * 0.04)
  const mat = Math.max(4, Math.round(band * 0.3))
  const inset = band + mat
  const plateRoom = Math.round(band * 1.2)
  const width = w + inset * 2
  const height = h + inset * 2 + plateRoom

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas')

  // Vermilion border with gold studs along its middle
  ctx.fillStyle = VERMILION
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = GOLD
  const stud = (x: number, y: number) => {
    ctx.beginPath()
    ctx.arc(x, y, band * 0.09, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let x = band; x < width - band / 2; x += band) {
    stud(x, band / 2)
    stud(x, height - band / 2)
  }
  for (let y = band; y < height - band / 2; y += band) {
    stud(band / 2, y)
    stud(width - band / 2, y)
  }

  // Ivory mount with a gold hairline, then the photo
  const line = Math.max(2, band * 0.07)
  ctx.fillStyle = IVORY
  ctx.fillRect(band, band, width - band * 2, h + mat * 2)
  ctx.lineWidth = line
  ctx.strokeStyle = GOLD
  ctx.strokeRect(band - line / 2, band - line / 2, width - band * 2 + line, h + mat * 2 + line)
  ctx.drawImage(bitmap, inset, inset, w, h)
  bitmap.close()

  // Name plate on the wider lower border
  const fontSize = Math.round(band * 0.5)
  ctx.font = `800 ${fontSize}px Poppins, system-ui, sans-serif`
  const text = label.toUpperCase()
  const plateWidth = Math.min(width - band * 4, ctx.measureText(text).width + fontSize * 2.4)
  const plateHeight = fontSize * 2
  const borderTop = band + h + mat * 2
  const plateY = borderTop + (height - borderTop - plateHeight) / 2
  pill(ctx, (width - plateWidth) / 2, plateY, plateWidth, plateHeight)
  ctx.fillStyle = IVORY
  ctx.fill()
  ctx.lineWidth = line
  ctx.strokeStyle = GOLD
  ctx.stroke()
  ctx.fillStyle = VERMILION
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, plateY + plateHeight / 2 + fontSize * 0.04, plateWidth - fontSize)

  // A lotus in every corner
  const radius = band * 0.8
  const corner = band * 0.3
  rosette(ctx, corner, corner, radius)
  rosette(ctx, width - corner, corner, radius)
  rosette(ctx, corner, height - corner, radius)
  rosette(ctx, width - corner, height - corner, radius)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not frame the photo'))), 'image/jpeg', 0.92)
  })
}
