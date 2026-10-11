import { MAPS, MAP_IDS, mapPath, posterPath } from './maps/registry';

/** Date the static pages were last revised, used as <lastmod> in the sitemap. */
export const SITE_UPDATED = '2026-10-11';

/** Every canonical, indexable page that is not a guide. The sitemap and the tests read this list. */
export const STATIC_ROUTES: string[] = [
  '/',
  '/maps/',
  ...MAP_IDS.map((id) => mapPath(MAPS[id])),
  ...MAP_IDS.map((id) => posterPath(MAPS[id])),
  '/travel-map-poster/',
  '/how-it-works/',
  '/guides/',
  '/methodology/',
  '/about/',
  '/contact/',
  '/privacy/',
  '/terms/',
];
