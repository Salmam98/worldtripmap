import type { MapId, MapLevel } from '../lib/maps/types';

/**
 * What the site shows on the "Explore maps" page and the home page chooser.
 * Live maps link to a working tool. Planned maps are listed without a link and are always
 * labelled "Coming soon", so nothing unfinished looks like a feature.
 */
export interface CatalogEntry {
  level: MapLevel;
  title: string;
  detail: string;
  /** Present only for maps that are live. */
  map?: MapId;
}

export const LEVELS: { level: MapLevel; name: string; summary: string }[] = [
  { level: 'country', name: 'World', summary: 'Mark the countries you have been to.' },
  { level: 'region', name: 'Regions', summary: 'Go province by province, state by state.' },
  { level: 'city', name: 'Cities', summary: 'Track the cities you have explored.' },
];

export const CATALOG: CatalogEntry[] = [
  { level: 'country', title: 'World', detail: '195 countries, plus 42 territories you can mark separately', map: 'world' },
  { level: 'region', title: 'Canada', detail: '10 provinces and 3 territories', map: 'canada' },
  { level: 'region', title: 'United States', detail: '50 states' },
  { level: 'region', title: 'Bangladesh', detail: '64 districts' },
  { level: 'city', title: 'Canadian cities', detail: '45 major cities, including every capital', map: 'canada-cities' },
  { level: 'city', title: 'World cities', detail: 'Major cities on every continent' },
  { level: 'city', title: 'City neighbourhoods', detail: 'Districts within a single city, where reliable boundary data exists' },
];
