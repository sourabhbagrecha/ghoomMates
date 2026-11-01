import { fmtHours, fmtKg, fmtRupees } from './impactData'

/**
 * The shareable Squad Impact Card, drawn straight onto a canvas (no server, no screenshot): squad name, who is in it,
 * the three numbers, the badge and "Planned with Ghoomates". A 4:5 portrait that fits an Instagram post or a story card.
 * Colours come from the design tokens at draw time; sizes are canvas pixels.
 */

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

export type SquadCardData = {
  groupName: string
  place: string
  /** "12–15 Nov", or empty */
  dates: string
  /** Up to 7 are drawn; `colour` is a CSS colour or var(--token) */
  members: { initial: string; colour: string }[]
  squadSize: number
  kgPerPerson: number
  savedPct: number
  crowdHours: number
  quietVisits: number
  keptPaise: number
  keptPct: number
  hasSpend: boolean
  badge: { name: string; level: number }
  score: number
}

const FONT = "Poppins, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MARGIN = 72

/* Lucide icon shapes on a 24 × 24 grid (ISC licence, see assets/icons/LICENSE) */
type Shape = string | { circle: [number, number, number] }
const ICONS: Record<string, Shape[]> = {
  leaf: [
    'M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20',
    'M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13',
  ],
  hourglass: [
    'M5 22h14',
    'M5 2h14',
    'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22',
    'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2',
  ],
  coins: [
    'M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17',
    'm7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9',
    'm2 16 6 6',
    { circle: [16, 9, 2.9] },
    { circle: [6, 5, 3] },
  ],
  award: [
    'm15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526',
    { circle: [12, 8, 6] },
  ],
}

type Tokens = {
  primary: string
  primaryBright: string
  sky: string
  skyLight: string
  yellow: string
  ink: string
  muted: string
  surface: string
  tint: string
  success: string
  onBrandMuted: string
  divider: string
}

function readTokens(): Tokens {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim()
  return {
    primary: token('--color-primary'),
    primaryBright: token('--color-primary-bright'),
    sky: token('--color-sky'),
    skyLight: token('--color-sky-light'),
    yellow: token('--color-yellow'),
    ink: token('--color-ink'),
    muted: token('--color-muted'),
    surface: token('--color-surface'),
    tint: token('--color-tint'),
    success: token('--color-success'),
    onBrandMuted: token('--color-on-brand-muted'),
    divider: token('--color-divider'),
  }
}

/** Resolves `var(--color-person-riya)` and friends to a colour the canvas understands */
function resolveColour(value: string): string {
  if (!value.includes('var(')) return value
  const probe = document.createElement('span')
  probe.style.color = value
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return resolved
}

/** Black or white initials, whichever reads better on the avatar colour (amber and sky are light) */
function initialColour(background: string, dark: string): string {
  const match = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(background)
  if (!match) return '#fff'
  const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? dark : '#fff'
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, colour: string) {
  ctx.save()
  ctx.translate(x, y)
  const scale = size / 24
  ctx.scale(scale, scale)
  ctx.strokeStyle = colour
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const shape of ICONS[name]) {
    if (typeof shape === 'string') ctx.stroke(new Path2D(shape))
    else {
      const [cx, cy, r] = shape.circle
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Text with extra space between letters (canvas letterSpacing isn't available everywhere) */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  let cursor = x
  for (const ch of text) {
    ctx.fillText(ch, cursor, y)
    cursor += ctx.measureText(ch).width + tracking
  }
}

/** Breaks text into at most `maxLines` lines that fit `maxWidth`, with an ellipsis if it runs over */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  const words = text.split(/\s+/)
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next
      continue
    }
    lines.push(line)
    line = words[i]
    if (lines.length === maxLines - 1) {
      line = words.slice(i).join(' ')
      break
    }
  }
  if (line) lines.push(line)
  return lines.map((l, i) => {
    if (i < lines.length - 1 || ctx.measureText(l).width <= maxWidth) return l
    let cut = l
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
    return `${cut.trimEnd()}…`
  })
}

/** One sentence under the numbers: the footprint saving when there is one, else what the squad did right */
export function cardLine(data: SquadCardData): string {
  if (data.savedPct > 0) return `We cut our getting-around footprint ${data.savedPct}% against everyone taking their own cab.`
  if (data.quietVisits > 0) return `${data.quietVisits} heritage ${data.quietVisits === 1 ? 'visit' : 'visits'} planned at quiet hours, so the old city breathes easier.`
  return 'Planned with care for Udaipur’s lakes, lanes and makers.'
}

async function loadFonts(texts: string) {
  try {
    await Promise.all(['800 80px', '700 32px', '600 32px'].map((spec) => document.fonts.load(`${spec} Poppins`, texts)))
  } catch {
    // Without Poppins the card falls back to the system font
  }
}

/** Draws the card and returns it as a PNG */
export async function renderSquadCard(data: SquadCardData): Promise<Blob> {
  const t = readTokens()
  const kpis = [
    {
      icon: 'leaf',
      value: fmtKg(data.kgPerPerson),
      unit: ' kg',
      label: 'CO₂e per person',
      note: data.savedPct > 0 ? `−${data.savedPct}% vs solo cabs` : 'getting around',
    },
    {
      icon: 'hourglass',
      value: fmtHours(data.crowdHours),
      unit: ' h',
      label: 'crowd-hours avoided',
      note: data.quietVisits > 0 ? `${data.quietVisits} quiet ${data.quietVisits === 1 ? 'visit' : 'visits'}` : 'by timing visits',
    },
    {
      icon: 'coins',
      value: fmtRupees(data.keptPaise),
      unit: '',
      label: 'kept with local people',
      note: data.hasSpend ? `${data.keptPct}% of our spend` : 'makers and cooks',
    },
  ]
  await loadFonts(`${kpis.map((k) => k.value + k.unit + k.label + k.note).join('')}${data.groupName}${data.badge.name}₹−·`)

  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.textBaseline = 'alphabetic'

  // Background: the deep brand gradient with the header's soft circles
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH * 0.45, CARD_HEIGHT)
  gradient.addColorStop(0.08, t.primary)
  gradient.addColorStop(0.92, t.primaryBright)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  const circle = (x: number, y: number, r: number, colour: string, alpha: number) => {
    ctx.globalAlpha = alpha
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  circle(980, 130, 300, t.yellow, 0.18)
  circle(60, 1290, 230, t.skyLight, 0.22)

  // Eyebrow and leaf
  ctx.fillStyle = t.onBrandMuted
  ctx.font = `600 30px ${FONT}`
  spaced(ctx, 'GREEN TRIP', MARGIN, 124, 6)
  circle(CARD_WIDTH - MARGIN - 36, 110, 36, t.yellow, 1)
  drawIcon(ctx, 'leaf', CARD_WIDTH - MARGIN - 36 - 20, 90, 40, t.primary)

  // Squad name, shrunk to fit one line
  const inner = CARD_WIDTH - MARGIN * 2
  let size = 104
  ctx.font = `800 ${size}px ${FONT}`
  while (size > 56 && ctx.measureText(data.groupName).width > inner) {
    size -= 4
    ctx.font = `800 ${size}px ${FONT}`
  }
  ctx.fillStyle = '#fff'
  ctx.fillText(wrap(ctx, data.groupName, inner, 1)[0] ?? '', MARGIN, 232)
  ctx.fillStyle = t.onBrandMuted
  ctx.font = `600 38px ${FONT}`
  ctx.fillText([data.place, data.dates].filter(Boolean).join(' · '), MARGIN, 290)

  // The squad: overlapping initials
  const shown = data.members.slice(0, 7)
  const diameter = 104
  const step = diameter - 30
  shown.forEach((member, i) => {
    const cx = MARGIN + diameter / 2 + i * step
    const colour = resolveColour(member.colour)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(cx, 384, diameter / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.arc(cx, 384, diameter / 2 - 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = initialColour(colour, t.ink)
    ctx.font = `800 46px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(member.initial, cx, 400)
    ctx.textAlign = 'left'
  })
  ctx.fillStyle = '#fff'
  ctx.font = `700 34px ${FONT}`
  const more = data.squadSize > shown.length ? ` +${data.squadSize - shown.length}` : ''
  ctx.fillText(`${data.squadSize} ${data.squadSize === 1 ? 'mate' : 'mates'}${more}`, MARGIN + diameter + (shown.length - 1) * step + 24, 396)

  // The three numbers
  const panelY = 470
  const panelH = 440
  ctx.save()
  ctx.shadowColor = 'rgba(7, 42, 200, 0.35)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 24
  ctx.fillStyle = t.surface
  roundedRect(ctx, MARGIN, panelY, inner, panelH, 56)
  ctx.fill()
  ctx.restore()
  const colW = inner / 3
  kpis.forEach((kpi, i) => {
    const cx = MARGIN + colW * i + colW / 2
    if (i > 0) {
      ctx.fillStyle = t.divider
      ctx.fillRect(MARGIN + colW * i - 1, panelY + 56, 2, panelH - 112)
    }
    ctx.fillStyle = t.tint
    roundedRect(ctx, cx - 44, panelY + 52, 88, 88, 28)
    ctx.fill()
    drawIcon(ctx, kpi.icon, cx - 22, panelY + 74, 44, t.primary)

    ctx.textAlign = 'center'
    // The value and its unit are centred together
    ctx.font = `800 ${kpi.value.length > 5 ? 62 : 76}px ${FONT}`
    const valueW = ctx.measureText(kpi.value).width
    ctx.font = `800 34px ${FONT}`
    const unitW = ctx.measureText(kpi.unit).width
    const left = cx - (valueW + unitW) / 2
    ctx.textAlign = 'left'
    ctx.fillStyle = t.ink
    ctx.font = `800 ${kpi.value.length > 5 ? 62 : 76}px ${FONT}`
    ctx.fillText(kpi.value, left, panelY + 226)
    ctx.font = `800 34px ${FONT}`
    ctx.fillText(kpi.unit, left + valueW, panelY + 226)

    ctx.textAlign = 'center'
    ctx.fillStyle = t.muted
    ctx.font = `700 29px ${FONT}`
    wrap(ctx, kpi.label, colW - 40, 2).forEach((line, n) => ctx.fillText(line, cx, panelY + 282 + n * 38))
    ctx.fillStyle = t.success
    ctx.font = `800 27px ${FONT}`
    ctx.fillText(kpi.note, cx, panelY + 392)
    ctx.textAlign = 'left'
  })

  // Badge
  const badgeY = 944
  ctx.fillStyle = t.yellow
  roundedRect(ctx, MARGIN, badgeY, inner, 140, 70)
  ctx.fill()
  ctx.fillStyle = t.primary
  ctx.beginPath()
  ctx.arc(MARGIN + 70, badgeY + 70, 48, 0, Math.PI * 2)
  ctx.fill()
  drawIcon(ctx, 'award', MARGIN + 70 - 24, badgeY + 70 - 24, 48, '#fff')
  ctx.fillStyle = t.primary
  ctx.font = `800 58px ${FONT}`
  ctx.fillText(data.badge.name, MARGIN + 140, badgeY + 74)
  ctx.font = `700 30px ${FONT}`
  ctx.fillText(`Green Trip score ${data.score}/100`, MARGIN + 140, badgeY + 114)

  // One sentence, then the signature
  ctx.fillStyle = '#fff'
  ctx.font = `600 36px ${FONT}`
  wrap(ctx, cardLine(data), inner, 2).forEach((line, n) => ctx.fillText(line, MARGIN, 1168 + n * 50))
  ctx.font = `800 34px ${FONT}`
  ctx.fillText('Planned with Ghoomates', MARGIN, 1292)
  ctx.textAlign = 'right'
  ctx.fillStyle = t.onBrandMuted
  ctx.font = `600 24px ${FONT}`
  ctx.fillText('Estimates, not measurements', CARD_WIDTH - MARGIN, 1292)
  ctx.textAlign = 'left'

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the card'))), 'image/png')
  })
}

export type ShareResult = 'shared' | 'saved' | 'cancelled'

/** The phone's share sheet when it can send an image, otherwise a download */
export async function shareSquadCard(blob: Blob, text: string, title: string): Promise<ShareResult> {
  const file = new File([blob], 'ghoomates-squad-impact.png', { type: 'image/png' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text })
      return 'shared'
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled'
      // Anything else (blocked, not allowed here): fall through to saving the file
    }
  }
  downloadSquadCard(blob)
  return 'saved'
}

export function downloadSquadCard(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'ghoomates-squad-impact.png'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
