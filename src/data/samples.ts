import type { MapId } from '../lib/maps/types';
import type { PosterSettings } from '../lib/poster/settings';

/**
 * Example posters shown on the site. Every one is drawn by the real poster engine from the
 * made-up selections below, and every one carries "Sample traveller" on the poster itself, so it
 * is never mistaken for a real person's travels. scripts/assets/build-assets.ts renders them.
 */
export interface Sample {
  id: string;
  map: MapId;
  /** Shown under the poster and used as alt text. */
  caption: string;
  width: number;
  height: number;
  settings: Partial<PosterSettings>;
  visited: string[];
  wishlist: string[];
}

const CANADA_A = ['CA-ON', 'CA-QC', 'CA-BC', 'CA-AB', 'CA-NS', 'CA-PE', 'CA-YT'];
const CANADA_B = ['CA-BC', 'CA-AB', 'CA-SK', 'CA-MB', 'CA-ON', 'CA-QC', 'CA-NB', 'CA-NS', 'CA-PE', 'CA-NL'];
const WORLD_A = [
  'CAN', 'USA', 'MEX', 'CUB', 'GBR', 'FRA', 'ESP', 'PRT', 'ITA', 'DEU', 'NLD', 'CHE', 'GRC', 'TUR', 'MAR', 'EGY', 'KEN',
  'ZAF', 'ARE', 'IND', 'BGD', 'THA', 'VNM', 'SGP', 'JPN', 'AUS', 'NZL', 'BRA', 'PER', 'ARG', 'ISL', 'MLT',
];
const CITIES_A = [
  'toronto', 'montreal', 'vancouver', 'ottawa-gatineau', 'calgary', 'quebec-city', 'halifax', 'victoria', 'winnipeg',
  'st-johns', 'kelowna', 'hamilton', 'whitehorse',
];

export const SAMPLES: Sample[] = [
  {
    id: 'canada-midnight-atlas',
    map: 'canada',
    caption: 'Midnight Atlas, Canada, as a 4:5 post',
    width: 1080,
    height: 1350,
    settings: { template: 'midnight-atlas', format: 'post', title: 'My Canada Journey', name: 'Sample traveller', dates: '2015–2026', badge: 'halfway-there' },
    visited: CANADA_A,
    wishlist: ['CA-NL', 'CA-NU'],
  },
  {
    id: 'canada-nordic-explorer',
    map: 'canada',
    caption: 'Nordic Explorer, Canada, as an upright print',
    width: 1080,
    height: 1440,
    settings: { template: 'nordic-explorer', format: 'print', title: 'Places I’ve Explored', name: 'Sample traveller', showWishlist: true },
    visited: CANADA_A,
    wishlist: ['CA-NL', 'CA-NU'],
  },
  {
    id: 'world-midnight-atlas',
    map: 'world',
    caption: 'Midnight Atlas, the world, as a wide print',
    width: 1440,
    height: 1080,
    settings: { template: 'midnight-atlas', format: 'print-wide', title: 'Places I’ve Explored', name: 'Sample traveller' },
    visited: WORLD_A,
    wishlist: [],
  },
  {
    id: 'canada-modern-cartographer',
    map: 'canada',
    caption: 'Modern Cartographer, Canada, as a 4:5 post',
    width: 1080,
    height: 1350,
    settings: { template: 'modern-cartographer', format: 'post', title: 'Canada Explorer', name: 'Sample traveller', dates: '2015–2026' },
    visited: CANADA_B,
    wishlist: [],
  },
  {
    id: 'canada-travel-journal',
    map: 'canada',
    caption: 'Travel Journal, Canada, as a 4:5 post',
    width: 1080,
    height: 1350,
    settings: { template: 'travel-journal', format: 'post', title: 'My Travel Story', name: 'Sample traveller', dates: 'Summer 2026', caption: 'Every road led somewhere good.' },
    visited: CANADA_A,
    wishlist: [],
  },
  {
    id: 'world-nordic-explorer',
    map: 'world',
    caption: 'Nordic Explorer, the world, as a 4:5 post',
    width: 1080,
    height: 1350,
    settings: { template: 'nordic-explorer', format: 'post', title: 'Places I’ve Explored', name: 'Sample traveller', showWishlist: true },
    visited: WORLD_A,
    wishlist: ['NOR', 'CHL', 'NPL', 'MDG'],
  },
  {
    id: 'cities-modern-cartographer',
    map: 'canada-cities',
    caption: 'Modern Cartographer, Canadian cities, as a wide print',
    width: 1440,
    height: 1080,
    settings: { template: 'modern-cartographer', format: 'print-wide', name: 'Sample traveller' },
    visited: CITIES_A,
    wishlist: [],
  },
  {
    id: 'world-travel-journal',
    map: 'world',
    caption: 'Travel Journal, the world, as a 2:3 pin',
    width: 1080,
    height: 1620,
    settings: { template: 'travel-journal', format: 'pin', title: 'Places I’ve Explored', name: 'Sample traveller', caption: 'Thirty-two countries and counting.' },
    visited: WORLD_A,
    wishlist: [],
  },
];

export function sample(id: string): Sample {
  const found = SAMPLES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown sample "${id}"`);
  return found;
}
