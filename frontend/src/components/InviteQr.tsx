import { useMemo } from 'react'
import QRCode from 'qrcode'

type InviteQrProps = {
  value: string
  size?: number
  className?: string
  /** Class for the dark modules, so the colour comes from design tokens */
  inkClassName: string
}

/** Scannable QR code for a link, drawn as SVG squares. */
export function InviteQr({ value, size = 168, className, inkClassName }: InviteQrProps) {
  const { count, cells } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' })
    const dark: [number, number][] = []
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) if (modules.get(y, x)) dark.push([x, y])
    }
    return { count: modules.size, cells: dark }
  }, [value])

  // A 2-module quiet zone keeps phone cameras happy
  const view = count + 4
  return (
    <svg className={className} viewBox={`-2 -2 ${view} ${view}`} width={size} height={size} role="img" aria-label="Invite QR code" shapeRendering="crispEdges">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} className={inkClassName} />
      ))}
    </svg>
  )
}
