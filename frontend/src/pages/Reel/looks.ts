import { loadFont as loadAnton } from '@remotion/google-fonts/Anton'
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka'
import { loadFont as loadPacifico } from '@remotion/google-fonts/Pacifico'
import { loadFont as loadPermanentMarker } from '@remotion/google-fonts/PermanentMarker'
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay'
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins'
import type { ReelStyle } from '../../services/reelsService'
import type { MapLook } from './mapMath'

// Each look's fonts, colours and grade. Fonts load through Remotion so the Player and the MP4 export wait for them.
// Colours are literal values, not the app's CSS variables: the MP4 renderer draws SVG (routes, underlines) as standalone
// images, where those variables don't exist. They match src/styles/tokens.css.

const poppins = loadPoppins('normal', { weights: ['600', '700', '800'], subsets: ['latin'] }).fontFamily
const playfair = loadPlayfair('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily
const anton = loadAnton('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily
const pacifico = loadPacifico('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily
const marker = loadPermanentMarker('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily
const fredoka = loadFredoka('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily

export type Look = {
  /** Titles, text cards and big numbers */
  display: string
  displayWeight: number
  /** Captions and labels */
  body: string
  /** Colour grade over every photo */
  grade: string
  /** Black bars top and bottom */
  letterbox: boolean
  /** Photos as white-bordered prints */
  print: boolean
  /** A wash over photos for warmth or glow */
  wash?: string
  /** Behind text, stats and title cards */
  background: string
  /** The look's highlight colour and the ink that sits on it */
  accent: string
  onAccent: string
  /** Basemap style and tile filter, for CARTO (with a key) and for Esri (without) */
  map: MapLook
  /** Text cards and stats use upper case */
  shout: boolean
}

export const LOOKS: Record<ReelStyle, Look> = {
  cinematic: {
    display: playfair,
    displayWeight: 700,
    body: poppins,
    grade: 'contrast(1.08) saturate(0.88)',
    letterbox: true,
    print: false,
    wash: 'linear-gradient(180deg, rgba(11, 23, 71, 0.25), transparent 30%, transparent 60%, rgba(11, 23, 71, 0.7))',
    background: 'linear-gradient(180deg, #0b1747 0%, #050a24 100%)',
    accent: '#e9c46a',
    onAccent: '#0b1747',
    map: { carto: 'dark_all', cartoFilter: 'none', esri: 'satellite', esriFilter: 'brightness(0.8) saturate(0.85) contrast(1.1)' },
    shout: false,
  },
  energetic: {
    display: anton,
    displayWeight: 400,
    body: poppins,
    grade: 'contrast(1.12) saturate(1.2)',
    letterbox: false,
    print: false,
    wash: 'linear-gradient(180deg, transparent 55%, rgba(7, 42, 200, 0.55))',
    background: 'linear-gradient(152deg, #072ac8 8%, #1557e6 92%)',
    accent: '#fcf300',
    onAccent: '#072ac8',
    map: { carto: 'voyager', cartoFilter: 'saturate(1.3)', esri: 'satellite', esriFilter: 'saturate(1.3) contrast(1.08)' },
    shout: true,
  },
  dreamy: {
    display: pacifico,
    displayWeight: 400,
    body: poppins,
    grade: 'brightness(1.06) saturate(1.05) contrast(0.94)',
    letterbox: false,
    print: false,
    wash: 'linear-gradient(180deg, rgba(255, 198, 0, 0.18), rgba(255, 122, 168, 0.12) 50%, rgba(11, 23, 71, 0.5))',
    background: 'linear-gradient(180deg, #ffb38a 0%, #ff7aa8 45%, #7b61ff 100%)',
    accent: '#fff4d6',
    onAccent: '#7b3f61',
    map: { carto: 'voyager', cartoFilter: 'sepia(0.2) saturate(1.1)', esri: 'satellite', esriFilter: 'brightness(1.08) saturate(0.95) sepia(0.2)' },
    shout: false,
  },
  retro: {
    display: marker,
    displayWeight: 400,
    body: poppins,
    grade: 'sepia(0.35) contrast(0.95) saturate(0.85)',
    letterbox: false,
    print: true,
    background: 'linear-gradient(180deg, #3b2f22 0%, #2b2118 100%)',
    accent: '#f4ecdc',
    onAccent: '#3b2f22',
    map: { carto: 'light_all', cartoFilter: 'sepia(0.6) contrast(0.95)', esri: 'streets', esriFilter: 'sepia(0.6) contrast(0.95)' },
    shout: false,
  },
  playful: {
    display: fredoka,
    displayWeight: 700,
    body: fredoka,
    grade: 'saturate(1.25) brightness(1.04)',
    letterbox: false,
    print: false,
    wash: 'linear-gradient(180deg, transparent 60%, rgba(11, 23, 71, 0.45))',
    background: 'linear-gradient(160deg, #22c39a 0%, #1e96fc 55%, #7b61ff 100%)',
    accent: '#ffc600',
    onAccent: '#0b1747',
    map: { carto: 'voyager', cartoFilter: 'saturate(1.4)', esri: 'streets', esriFilter: 'saturate(1.4)' },
    shout: false,
  },
}

export const lookOf = (style: ReelStyle) => LOOKS[style] ?? LOOKS.cinematic

/** Ink for text on white in the video (--color-ink) */
export const INK = '#0b1747'

/** The squad's colours (--color-person-*), for confetti, shapes and number cards */
export const SQUAD_COLOURS = ['#ffc600', '#1e96fc', '#ff7aa8', '#7b61ff', '#22c39a', '#fcf300']
