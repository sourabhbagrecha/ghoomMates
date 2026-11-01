import type { CuratedSite } from '../types.ts';
import { bagoreKiHaveli } from './bagore-ki-haveli.ts';
import { cityPalace } from './city-palace.ts';
import { fatehSagar } from './fateh-sagar.ts';
import { jagdishTemple } from './jagdish-temple.ts';
import { picholaBoat } from './pichola-boat.ts';
import { saheliyonKiBari } from './saheliyon-ki-bari.ts';
import { sajjangarh } from './sajjangarh.ts';

/** The hand-written stories: the classic telling of each key site in English and Hindi, with painted panels */
export const CURATED: Map<string, CuratedSite> = new Map(
  [cityPalace, jagdishTemple, picholaBoat, saheliyonKiBari, bagoreKiHaveli, sajjangarh, fatehSagar].map(site => [site.siteId, site]),
);
