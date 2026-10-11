import type { FeatureDef, MapDefinition } from '../../lib/maps/types';
import { CANADA_GROUPS, CANADA_REGIONS } from './canada';

/**
 * Canada: major cities.
 *
 * Which cities are on the map: every census metropolitan area (CMA) in the 2021 Census of
 * Population, 41 in all, plus the four provincial and territorial capitals that are not CMAs
 * (Charlottetown, Whitehorse, Yellowknife and Iqaluit). That gives 45 cities and every capital.
 * Source for the CMA list: Statistics Canada, The Daily, 9 February 2022, "Canada's large urban
 * centres continue to grow and spread". Checked 10 October 2026.
 *
 * Coordinates: `ne` names the matching record in Natural Earth 1:10m Populated Places (public
 * domain). Three cities are not in that dataset; their city-centre coordinates are entered here by
 * hand, rounded to two decimal places (about 1 km), which is finer than the map can show.
 */

export interface CanadaCity {
  id: string;
  name: string;
  province: string;
  /** Natural Earth populated place name, when it differs from `name`. */
  ne?: string;
  /** [longitude, latitude] for cities missing from Natural Earth. */
  lonLat?: [number, number];
  capital?: 'national' | 'provincial' | 'territorial';
  cma: boolean;
  aliases?: string[];
}

// prettier-ignore
export const CANADA_CITIES: CanadaCity[] = [
  { id: 'toronto', name: 'Toronto', province: 'CA-ON', capital: 'provincial', cma: true, aliases: ['GTA', 'Mississauga', 'Brampton', 'Markham', 'Vaughan'] },
  { id: 'montreal', name: 'Montréal', province: 'CA-QC', cma: true, aliases: ['Montreal', 'Laval', 'Longueuil'] },
  { id: 'vancouver', name: 'Vancouver', province: 'CA-BC', cma: true, aliases: ['Surrey', 'Burnaby', 'Richmond'] },
  { id: 'ottawa-gatineau', name: 'Ottawa–Gatineau', province: 'CA-ON', ne: 'Ottawa', capital: 'national', cma: true, aliases: ['Ottawa', 'Gatineau', 'Hull'] },
  { id: 'calgary', name: 'Calgary', province: 'CA-AB', cma: true },
  { id: 'edmonton', name: 'Edmonton', province: 'CA-AB', capital: 'provincial', cma: true },
  { id: 'quebec-city', name: 'Québec City', province: 'CA-QC', ne: 'Québec', capital: 'provincial', cma: true, aliases: ['Quebec City', 'Québec', 'Lévis'] },
  { id: 'winnipeg', name: 'Winnipeg', province: 'CA-MB', capital: 'provincial', cma: true },
  { id: 'hamilton', name: 'Hamilton', province: 'CA-ON', cma: true, aliases: ['Burlington'] },
  { id: 'kitchener-cambridge-waterloo', name: 'Kitchener–Cambridge–Waterloo', province: 'CA-ON', ne: 'Kitchener', cma: true, aliases: ['Kitchener', 'Cambridge', 'Waterloo', 'KW'] },
  { id: 'london', name: 'London', province: 'CA-ON', cma: true },
  { id: 'halifax', name: 'Halifax', province: 'CA-NS', capital: 'provincial', cma: true, aliases: ['Dartmouth'] },
  { id: 'st-catharines-niagara', name: 'St. Catharines–Niagara', province: 'CA-ON', lonLat: [-79.24, 43.16], cma: true, aliases: ['St. Catharines', 'St Catharines', 'Niagara Falls', 'Niagara'] },
  { id: 'windsor', name: 'Windsor', province: 'CA-ON', cma: true },
  { id: 'oshawa', name: 'Oshawa', province: 'CA-ON', cma: true, aliases: ['Whitby'] },
  { id: 'victoria', name: 'Victoria', province: 'CA-BC', capital: 'provincial', cma: true },
  { id: 'saskatoon', name: 'Saskatoon', province: 'CA-SK', cma: true },
  { id: 'regina', name: 'Regina', province: 'CA-SK', capital: 'provincial', cma: true },
  { id: 'sherbrooke', name: 'Sherbrooke', province: 'CA-QC', cma: true },
  { id: 'kelowna', name: 'Kelowna', province: 'CA-BC', cma: true },
  { id: 'barrie', name: 'Barrie', province: 'CA-ON', cma: true },
  { id: 'st-johns', name: 'St. John’s', province: 'CA-NL', ne: "St. John's", capital: 'provincial', cma: true, aliases: ["St. John's", 'St Johns', 'Saint Johns'] },
  { id: 'abbotsford-mission', name: 'Abbotsford–Mission', province: 'CA-BC', ne: 'Abbotsford', cma: true, aliases: ['Abbotsford', 'Mission'] },
  { id: 'kingston', name: 'Kingston', province: 'CA-ON', cma: true },
  { id: 'greater-sudbury', name: 'Greater Sudbury', province: 'CA-ON', ne: 'Sudbury', cma: true, aliases: ['Sudbury'] },
  { id: 'guelph', name: 'Guelph', province: 'CA-ON', lonLat: [-80.25, 43.55], cma: true },
  { id: 'saguenay', name: 'Saguenay', province: 'CA-QC', ne: 'Chicoutimi', cma: true, aliases: ['Chicoutimi', 'Jonquière'] },
  { id: 'trois-rivieres', name: 'Trois-Rivières', province: 'CA-QC', cma: true, aliases: ['Trois Rivieres', 'Three Rivers'] },
  { id: 'moncton', name: 'Moncton', province: 'CA-NB', cma: true, aliases: ['Dieppe'] },
  { id: 'brantford', name: 'Brantford', province: 'CA-ON', lonLat: [-80.26, 43.14], cma: true },
  { id: 'saint-john', name: 'Saint John', province: 'CA-NB', cma: true },
  { id: 'peterborough', name: 'Peterborough', province: 'CA-ON', cma: true },
  { id: 'lethbridge', name: 'Lethbridge', province: 'CA-AB', cma: true },
  { id: 'thunder-bay', name: 'Thunder Bay', province: 'CA-ON', cma: true },
  { id: 'nanaimo', name: 'Nanaimo', province: 'CA-BC', cma: true },
  { id: 'kamloops', name: 'Kamloops', province: 'CA-BC', cma: true },
  { id: 'chilliwack', name: 'Chilliwack', province: 'CA-BC', cma: true },
  { id: 'belleville-quinte-west', name: 'Belleville–Quinte West', province: 'CA-ON', ne: 'Belleville', cma: true, aliases: ['Belleville', 'Trenton', 'Quinte West'] },
  { id: 'fredericton', name: 'Fredericton', province: 'CA-NB', capital: 'provincial', cma: true },
  { id: 'drummondville', name: 'Drummondville', province: 'CA-QC', cma: true },
  { id: 'red-deer', name: 'Red Deer', province: 'CA-AB', cma: true },
  { id: 'charlottetown', name: 'Charlottetown', province: 'CA-PE', capital: 'provincial', cma: false },
  { id: 'whitehorse', name: 'Whitehorse', province: 'CA-YT', capital: 'territorial', cma: false },
  { id: 'yellowknife', name: 'Yellowknife', province: 'CA-NT', capital: 'territorial', cma: false },
  { id: 'iqaluit', name: 'Iqaluit', province: 'CA-NU', capital: 'territorial', cma: false },
];

/**
 * Population of each census metropolitan area in the 2021 Census, the most recent full count.
 * Source: Statistics Canada, The Daily, 9 February 2022, table "Population and population growth
 * rate of census metropolitan areas in Canada, 2011 to 2016 and 2016 to 2021"
 * (www150.statcan.gc.ca/n1/daily-quotidien/220209/t002a-eng.htm). Checked 11 October 2026.
 * The 41 figures add up to the table's own total for all census metropolitan areas, which a unit
 * test checks, so a mistyped digit cannot slip in. The four capitals that are not metropolitan
 * areas have no figure here: they are counted differently, as census agglomerations or cities.
 */
// prettier-ignore
export const CMA_POPULATION_2021: Record<string, number> = {
  'toronto': 6_202_225, 'montreal': 4_291_732, 'vancouver': 2_642_825, 'ottawa-gatineau': 1_488_307,
  'calgary': 1_481_806, 'edmonton': 1_418_118, 'quebec-city': 839_311, 'winnipeg': 834_678,
  'hamilton': 785_184, 'kitchener-cambridge-waterloo': 575_847, 'london': 543_551, 'halifax': 465_703,
  'st-catharines-niagara': 433_604, 'windsor': 422_630, 'oshawa': 415_311, 'victoria': 397_237,
  'saskatoon': 317_480, 'regina': 249_217, 'sherbrooke': 227_398, 'kelowna': 222_162,
  'barrie': 212_856, 'st-johns': 212_579, 'abbotsford-mission': 195_726, 'kingston': 172_546,
  'greater-sudbury': 170_605, 'guelph': 165_588, 'saguenay': 161_567, 'trois-rivieres': 161_489,
  'moncton': 157_717, 'brantford': 144_162, 'saint-john': 130_613, 'peterborough': 128_624,
  'lethbridge': 123_847, 'thunder-bay': 123_258, 'nanaimo': 115_459, 'kamloops': 114_142,
  'chilliwack': 113_767, 'belleville-quinte-west': 111_184, 'fredericton': 108_610, 'drummondville': 101_610,
  'red-deer': 100_844,
};
/** The same table's totals: everyone living in a census metropolitan area, and everyone in Canada. */
export const CMA_POPULATION_2021_TOTAL = 27_281_119;
export const CANADA_POPULATION_2021 = 36_991_981;

const regionById = new Map(CANADA_REGIONS.map((r) => [r.id, r]));

function cityNote(c: CanadaCity): string {
  const postal = regionById.get(c.province)!.postal;
  if (c.capital === 'national') return `${postal}, national capital`;
  if (c.capital) return `${postal}, capital`;
  return postal;
}

const features: FeatureDef[] = CANADA_CITIES.map((c) => ({
  id: c.id,
  name: c.name,
  aliases: c.aliases,
  group: regionById.get(c.province)!.group,
  countable: true,
  note: cityNote(c),
  parent: { map: 'canada', id: c.province },
  facts: { province: regionById.get(c.province)!.name, ...(c.capital ? { capital: c.capital } : {}) },
}));

export const CANADA_CITIES_MAP: MapDefinition = {
  id: 'canada-cities',
  level: 'city',
  slug: 'canada-cities',
  place: 'Canada',
  name: 'Canada: major cities',
  unit: { one: 'city', many: 'cities' },
  countryCode: 'CA',
  parent: { map: 'world', id: 'CAN' },
  groups: CANADA_GROUPS,
  features,
  // Frozen at launch. Append new ids at the end; never reorder.
  shareOrder: CANADA_CITIES.map((c) => c.id),
  scope: '45 major Canadian cities',
  countingNote:
    'The percentage is the share of these 45 cities you have marked: Canada’s 41 census metropolitan areas plus four capitals. Canada has thousands of other cities, towns and villages that are not on this list.',
  defaultPosterTitle: 'Canadian Cities I’ve Explored',
  posterTitles: ['Canadian Cities I’ve Explored', 'My Canada Journey', 'City by City', 'My Travel Story'],
  sources: [
    {
      name: 'Statistics Canada, The Daily (9 February 2022): 41 census metropolitan areas, 2021 Census',
      url: 'https://www150.statcan.gc.ca/n1/daily-quotidien/220209/dq220209b-eng.htm',
      licence: 'Reference',
      note: 'Defines which cities appear on the map.',
    },
    {
      name: 'Natural Earth 1:10m Populated Places, version 5.1.2',
      url: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/',
      licence: 'Public domain',
      note: 'City locations. Three cities missing from the dataset are placed by hand.',
    },
    {
      name: 'Natural Earth 1:10m Admin 1 – States, Provinces (lakes cut out), version 5.1.2',
      url: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/',
      licence: 'Public domain',
      note: 'Base map of provinces and territories.',
    },
  ],
};
