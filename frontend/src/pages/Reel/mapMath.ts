import type { ReelPlace } from '../../services/reelsService'

// Web Mercator maths for the map scene: where a place sits on the world map at a zoom level, which 256px tiles
// cover the frame, and a zoom that fits every pin.

export const TILE = 256

export type Point = { x: number; y: number }

/** A place's position in world pixels at zoom `z`. */
export function project(lat: number, lng: number, z: number): Point {
  const size = TILE * 2 ** z
  const sin = Math.sin((lat * Math.PI) / 180)
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  }
}

/** The middle of the pins. */
export function centreOf(places: ReelPlace[]) {
  const lat = places.reduce((s, p) => s + p.lat, 0) / places.length
  const lng = places.reduce((s, p) => s + p.lng, 0) / places.length
  return { lat, lng }
}

/**
 * The closest whole zoom at which every pin fits inside a box of this size: up to 16, so landmarks a few hundred metres
 * apart still get their own spot. A lone pin gets the city around it.
 */
export function fitZoom(places: ReelPlace[], width: number, height: number) {
  if (places.length < 2) return 14
  for (let z = 16; z > 3; z--) {
    const points = places.map((p) => project(p.lat, p.lng, z))
    const w = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x))
    const h = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y))
    if (w <= width && h <= height) return z
  }
  return 4
}

export type Tile = { key: string; url: string; left: number; top: number }

/**
 * Where tiles come from. CARTO basemaps come through the backend, which adds CARTO_API_KEY (served from this origin, so
 * the MP4 export can read them); without a key, Esri's keyless tiles, which allow cross-origin reads.
 */
export type MapTiles = 'carto' | 'esri'
export type CartoStyle = 'voyager' | 'light_all' | 'dark_all'
export type EsriStyle = 'satellite' | 'streets'

/** A look's basemap and tile filter for each source */
export type MapLook = { carto: CartoStyle; cartoFilter: string; esri: EsriStyle; esriFilter: string }

const ESRI_SERVICES: Record<EsriStyle, string> = {
  satellite: 'World_Imagery',
  streets: 'World_Street_Map',
}

export const MAP_CREDIT: Record<MapTiles, string> = {
  carto: '© OpenStreetMap contributors © CARTO',
  esri: 'Tiles © Esri — Esri, Maxar, Earthstar Geographics, GIS User Community',
}

export const mapFilter = (look: MapLook, tiles: MapTiles) => (tiles === 'carto' ? look.cartoFilter : look.esriFilter)

function tileUrl(look: MapLook, tiles: MapTiles, z: number, x: number, y: number) {
  return tiles === 'carto'
    ? `/api/reels/tiles/carto/${look.carto}/${z}/${x}/${y}.png`
    : `https://server.arcgisonline.com/ArcGIS/rest/services/${ESRI_SERVICES[look.esri]}/MapServer/tile/${z}/${y}/${x}`
}

/**
 * The tiles of zoom `z` that cover a frame of `width` × `height` centred on `centre`, positioned in frame pixels at
 * scale 1, for a camera that never shows the layer smaller than `minScale`.
 */
export function tilesFor(look: MapLook, tiles: MapTiles, centre: Point, z: number, width: number, height: number, minScale: number): Tile[] {
  const halfW = width / 2 / minScale
  const halfH = height / 2 / minScale
  const count = 2 ** z
  const found: Tile[] = []
  for (let tx = Math.floor((centre.x - halfW) / TILE); tx <= Math.floor((centre.x + halfW) / TILE); tx++) {
    for (let ty = Math.floor((centre.y - halfH) / TILE); ty <= Math.floor((centre.y + halfH) / TILE); ty++) {
      if (ty < 0 || ty >= count) continue
      const x = ((tx % count) + count) % count
      found.push({
        key: `${z}/${tx}/${ty}`,
        url: tileUrl(look, tiles, z, x, ty),
        left: width / 2 + tx * TILE - centre.x,
        top: height / 2 + ty * TILE - centre.y,
      })
    }
  }
  return found
}

// Zoom levels between the far, middle and near tile layers
const STEP = 3
// A layer fades in over the last part of the zoom before its own level
export const LAYER_FADE = 0.35

/** The map camera for these pins: their centre, the zoom that fits them, and the tile layers it flies through. */
export function mapView(places: ReelPlace[], width: number, height: number) {
  const centre = centreOf(places)
  const near = fitZoom(places, width - 260, height - 640)
  const levels = [Math.max(3, near - 2 * STEP), Math.max(3, near - STEP), near].filter((z, i, all) => all.indexOf(z) === i)
  return { centre, near, levels }
}

/** Every tile a map scene can show, layer by layer. */
export function mapLayers(look: MapLook, tiles: MapTiles, places: ReelPlace[], width: number, height: number) {
  const { centre, levels } = mapView(places, width, height)
  return levels.map((z, i) => ({ z, tiles: tilesFor(look, tiles, project(centre.lat, centre.lng, z), z, width, height, i === 0 ? 1 : 2 ** -LAYER_FADE) }))
}

