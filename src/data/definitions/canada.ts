import type { FeatureDef, GroupDef, MapDefinition } from '../../lib/maps/types';

/**
 * Canada: 10 provinces and 3 territories.
 *
 * Areas: Natural Resources Canada, Atlas of Canada, as published by Statistics Canada
 *   (Canada Year Book, table 15.7 "Land and freshwater area, by province and territory").
 * Populations: Statistics Canada, 2021 Census of Population, population and dwelling counts
 *   (released 9 February 2022).
 * Regions: Government of Canada, "Discover Canada: Canada's Regions" (five regions).
 * All checked 10 October 2026.
 */

export interface CanadaRegion {
  id: string;
  postal: string;
  name: string;
  nameFr: string;
  type: 'province' | 'territory';
  capital: string;
  group: string;
  /** Total area in km², land and freshwater. */
  areaKm2: number;
  /** 2021 Census population. */
  population2021: number;
  /** Date the province joined Confederation or the territory was created. */
  joined: string;
  aliases?: string[];
}

export const CANADA_TOTAL_AREA_KM2 = 9_984_670;
export const CANADA_POPULATION_2021 = 36_991_981;

export const CANADA_GROUPS: GroupDef[] = [
  { id: 'atlantic', name: 'Atlantic Provinces' },
  { id: 'central', name: 'Central Canada' },
  { id: 'prairies', name: 'Prairie Provinces' },
  { id: 'west-coast', name: 'West Coast' },
  { id: 'north', name: 'The North' },
];

// prettier-ignore
export const CANADA_REGIONS: CanadaRegion[] = [
  { id: 'CA-NL', postal: 'NL', name: 'Newfoundland and Labrador', nameFr: 'Terre-Neuve-et-Labrador', type: 'province', capital: 'St. John’s', group: 'atlantic', areaKm2: 405_212, population2021: 510_550, joined: '1949-03-31', aliases: ['Newfoundland', 'Labrador', 'NFLD'] },
  { id: 'CA-PE', postal: 'PE', name: 'Prince Edward Island', nameFr: 'Île-du-Prince-Édouard', type: 'province', capital: 'Charlottetown', group: 'atlantic', areaKm2: 5_660, population2021: 154_331, joined: '1873-07-01', aliases: ['PEI', 'P.E.I.'] },
  { id: 'CA-NS', postal: 'NS', name: 'Nova Scotia', nameFr: 'Nouvelle-Écosse', type: 'province', capital: 'Halifax', group: 'atlantic', areaKm2: 55_284, population2021: 969_383, joined: '1867-07-01', aliases: ['Cape Breton'] },
  { id: 'CA-NB', postal: 'NB', name: 'New Brunswick', nameFr: 'Nouveau-Brunswick', type: 'province', capital: 'Fredericton', group: 'atlantic', areaKm2: 72_908, population2021: 775_610, joined: '1867-07-01' },
  { id: 'CA-QC', postal: 'QC', name: 'Quebec', nameFr: 'Québec', type: 'province', capital: 'Québec City', group: 'central', areaKm2: 1_542_056, population2021: 8_501_833, joined: '1867-07-01', aliases: ['Québec', 'PQ'] },
  { id: 'CA-ON', postal: 'ON', name: 'Ontario', nameFr: 'Ontario', type: 'province', capital: 'Toronto', group: 'central', areaKm2: 1_076_395, population2021: 14_223_942, joined: '1867-07-01' },
  { id: 'CA-MB', postal: 'MB', name: 'Manitoba', nameFr: 'Manitoba', type: 'province', capital: 'Winnipeg', group: 'prairies', areaKm2: 647_797, population2021: 1_342_153, joined: '1870-07-15' },
  { id: 'CA-SK', postal: 'SK', name: 'Saskatchewan', nameFr: 'Saskatchewan', type: 'province', capital: 'Regina', group: 'prairies', areaKm2: 651_036, population2021: 1_132_505, joined: '1905-09-01' },
  { id: 'CA-AB', postal: 'AB', name: 'Alberta', nameFr: 'Alberta', type: 'province', capital: 'Edmonton', group: 'prairies', areaKm2: 661_848, population2021: 4_262_635, joined: '1905-09-01' },
  { id: 'CA-BC', postal: 'BC', name: 'British Columbia', nameFr: 'Colombie-Britannique', type: 'province', capital: 'Victoria', group: 'west-coast', areaKm2: 944_735, population2021: 5_000_879, joined: '1871-07-20', aliases: ['B.C.', 'Vancouver Island'] },
  { id: 'CA-YT', postal: 'YT', name: 'Yukon', nameFr: 'Yukon', type: 'territory', capital: 'Whitehorse', group: 'north', areaKm2: 482_443, population2021: 40_232, joined: '1898-06-13', aliases: ['Yukon Territory', 'The Yukon'] },
  { id: 'CA-NT', postal: 'NT', name: 'Northwest Territories', nameFr: 'Territoires du Nord-Ouest', type: 'territory', capital: 'Yellowknife', group: 'north', areaKm2: 1_346_106, population2021: 41_070, joined: '1870-07-15', aliases: ['NWT', 'N.W.T.'] },
  { id: 'CA-NU', postal: 'NU', name: 'Nunavut', nameFr: 'Nunavut', type: 'territory', capital: 'Iqaluit', group: 'north', areaKm2: 2_093_190, population2021: 36_858, joined: '1999-04-01' },
];

const features: FeatureDef[] = CANADA_REGIONS.map((r) => ({
  id: r.id,
  name: r.name,
  short: r.postal,
  aliases: [r.postal, r.nameFr, ...(r.aliases ?? [])].filter((a) => a !== r.name),
  group: r.group,
  countable: true,
  note: r.type === 'territory' ? 'Territory' : 'Province',
  facts: { capital: r.capital, areaKm2: r.areaKm2, population2021: r.population2021, type: r.type },
}));

export const CANADA: MapDefinition = {
  id: 'canada',
  level: 'region',
  slug: 'canada',
  place: 'Canada',
  name: 'Canada: provinces and territories',
  unit: { one: 'province or territory', many: 'provinces and territories' },
  countryCode: 'CA',
  parent: { map: 'world', id: 'CAN' },
  groups: CANADA_GROUPS,
  features,
  // Frozen at launch. Append new ids at the end; never reorder.
  shareOrder: [
    'CA-NL', 'CA-PE', 'CA-NS', 'CA-NB', 'CA-QC', 'CA-ON', 'CA-MB',
    'CA-SK', 'CA-AB', 'CA-BC', 'CA-YT', 'CA-NT', 'CA-NU',
  ],
  scope: 'Canada\u2019s 13 provinces and territories',
  countingNote:
    'The first percentage is the share of Canada’s 13 provinces and territories you have marked. It is not a share of Canada’s land area. The percentage by places is the share of the places on our list you have ticked, for Canada and for each province and territory.',
  defaultPosterTitle: 'My Canada Journey',
  posterTitles: ['My Canada Journey', 'Places I’ve Explored', 'Canada Explorer', 'My Travel Story'],
  sources: [
    {
      name: 'Natural Earth 1:10m Admin 1 – States, Provinces (lakes cut out), version 5.1.2',
      url: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/',
      licence: 'Public domain',
      note: 'Provincial and territorial boundaries.',
    },
    {
      name: 'Natural Earth 1:10m Lakes, version 5.1.2',
      url: 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/',
      licence: 'Public domain',
      note: 'Large lakes drawn on the map.',
    },
    {
      name: 'Natural Resources Canada, Atlas of Canada: land and freshwater area by province and territory',
      url: 'https://www150.statcan.gc.ca/n1/pub/11-402-x/2010000/chap/geo/tbl/tbl07-eng.htm',
      licence: 'Reference',
      note: 'Areas used for the optional land-area figure.',
    },
    {
      name: 'Government of Canada, Discover Canada: Canada’s Regions',
      url: 'https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/discover-canada/read-online/canadas-regions.html',
      licence: 'Reference',
      note: 'The five regions used to group provinces and territories.',
    },
  ],
};
