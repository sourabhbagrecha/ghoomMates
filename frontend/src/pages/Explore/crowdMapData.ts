// A simple schematic of Udaipur for the crowd map: the lakes as soft shapes, sites placed by latitude and longitude.

export const MAP_WIDTH = 330
export const MAP_HEIGHT = 230

const BOUNDS = { north: 24.632, south: 24.566, west: 73.622, east: 73.726 }

/** Latitude and longitude → map x, y */
export function project(lat: number, lng: number): [number, number] {
  const x = ((lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * MAP_WIDTH
  const y = ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * MAP_HEIGHT
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
}

/** Closed path through points given as [lat, lng] */
function shape(points: [number, number][]) {
  const xy = points.map(([lat, lng]) => project(lat, lng))
  return `M${xy.map(([x, y]) => `${x} ${y}`).join(' L')} Z`
}

/** Lake names sit to the side (`end` anchors the text's right edge) so they don't cover site dots */
export const LAKES: { name: string; path: string; label: [number, number]; anchor: 'start' | 'end' }[] = [
  {
    name: 'Pichola',
    path: shape([
      [24.5905, 73.6745], [24.5870, 73.6790], [24.5815, 73.6808], [24.5770, 73.6822], [24.5735, 73.6818],
      [24.5690, 73.6800], [24.5668, 73.6760], [24.5690, 73.6712], [24.5745, 73.6700], [24.5810, 73.6715], [24.5868, 73.6722],
    ]),
    label: project(24.5745, 73.6690),
    anchor: 'end',
  },
  {
    name: 'Fateh Sagar',
    path: shape([
      [24.6115, 73.6700], [24.6100, 73.6762], [24.6060, 73.6790], [24.6008, 73.6788], [24.5978, 73.6758],
      [24.5985, 73.6712], [24.6030, 73.6680], [24.6080, 73.6672],
    ]),
    label: project(24.6060, 73.6665),
    anchor: 'end',
  },
  {
    name: 'Badi',
    path: shape([
      [24.6305, 73.6255], [24.6300, 73.6300], [24.6270, 73.6320], [24.6240, 73.6300], [24.6238, 73.6262], [24.6265, 73.6240],
    ]),
    label: project(24.6215, 73.6238),
    anchor: 'start',
  },
]
