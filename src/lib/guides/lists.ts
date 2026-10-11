/**
 * The lists the guides and the printable checklists are built from: countries by continent,
 * territories by the state responsible for them, national parks by province, World Heritage
 * Sites, and cities by population.
 *
 * Nothing is typed in twice. A guide that lists the 195 countries, the PDF checklist of them and
 * the world map all read the same definitions, and a unit test fails when a guide falls behind.
 */
import { CANADA_REGIONS, type CanadaRegion } from '../../data/definitions/canada';
import { CANADA_CITIES, CMA_POPULATION_2021, type CanadaCity } from '../../data/definitions/canada-cities';
import { CANADA_PLACES } from '../../data/definitions/canada-places';
import { WORLD_GROUPS, WORLD_UNITS, type WorldUnit } from '../../data/definitions/world';
import { HERITAGE_CANADA, type HeritageProperty } from '../../data/reference/unesco-canada';
import type { PlaceDef } from '../maps/types';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en');

// ------------------------------------------------------------------- world

export interface ContinentList {
  id: string;
  name: string;
  /** The countries counted toward 195, in alphabetical order. */
  countries: WorldUnit[];
  /** Territories and other areas on the map, counted separately. */
  territories: WorldUnit[];
}

/** Every continent on the world map with what is counted in it. Antarctica has a territory and no country. */
export function continents(): ContinentList[] {
  return WORLD_GROUPS.map((group) => {
    const units = WORLD_UNITS.filter((unit) => unit.group === group.id);
    return {
      id: group.id,
      name: group.name,
      countries: units.filter((unit) => unit.status !== 'territory').sort(byName),
      territories: units.filter((unit) => unit.status === 'territory').sort(byName),
    };
  });
}

export const COUNTRY_TOTAL = WORLD_UNITS.filter((unit) => unit.status !== 'territory').length;
export const TERRITORY_TOTAL = WORLD_UNITS.filter((unit) => unit.status === 'territory').length;
export const UN_MEMBER_TOTAL = WORLD_UNITS.filter((unit) => unit.status === 'un-member').length;

/** What a checklist prints beside a country that is not a member state of the United Nations. */
export function countryNote(unit: WorldUnit): string | undefined {
  return unit.status === 'un-observer' ? 'UN observer state' : undefined;
}

export interface StateTerritories {
  /** The state responsible, or null for the areas the map lists under no state. */
  state: WorldUnit | null;
  territories: WorldUnit[];
}

/** The map's territories grouped by the state responsible for them: the longest list first, areas under no state last. */
export function territoriesByState(): StateTerritories[] {
  const units = new Map(WORLD_UNITS.map((unit) => [unit.id, unit]));
  const groups = new Map<string, WorldUnit[]>();
  for (const unit of WORLD_UNITS) {
    if (unit.status !== 'territory') continue;
    const key = unit.sovereign ?? '';
    groups.set(key, [...(groups.get(key) ?? []), unit]);
  }
  return [...groups.entries()]
    .map(([key, territories]) => ({ state: key ? units.get(key)! : null, territories: territories.sort(byName) }))
    .sort((a, b) => {
      if (!a.state || !b.state) return a.state ? -1 : b.state ? 1 : 0;
      return b.territories.length - a.territories.length || byName(a.state, b.state);
    });
}

// ------------------------------------------------------------ national parks

export type ParkKind = 'park' | 'reserve' | 'park-and-reserve' | 'urban';

const parks = CANADA_PLACES.places.filter((place) => place.kind === 'park');

/** What Parks Canada calls it. Kluane is both a national park and a national park reserve. */
export function parkKind(place: PlaceDef): ParkKind {
  const note = place.note ?? '';
  if (note.startsWith('National urban park')) return 'urban';
  if (note.startsWith('Park and reserve')) return 'park-and-reserve';
  if (note.startsWith('Reserve')) return 'reserve';
  return 'park';
}

export const isWorldHeritagePark = (place: PlaceDef): boolean => (place.note ?? '').includes('World Heritage Site');

/** The other province or territory a park reaches into, from its note ("also in the Northwest Territories"). */
export function parkAlsoIn(place: PlaceDef): string | undefined {
  return /also in (?:the )?(.+)$/i.exec(place.note ?? '')?.[1];
}

export interface ProvinceParks {
  region: CanadaRegion;
  /** National parks and reserves, as the Canada map lists them, without the urban park. */
  parks: PlaceDef[];
  /** A national urban park, which Parks Canada counts apart from national parks. */
  urban: PlaceDef[];
}

export function parksByProvince(): ProvinceParks[] {
  return CANADA_REGIONS.map((region) => {
    const inside = parks.filter((place) => place.within === region.id);
    return {
      region,
      parks: inside.filter((place) => parkKind(place) !== 'urban'),
      urban: inside.filter((place) => parkKind(place) === 'urban'),
    };
  });
}

/**
 * Parks Canada's own arithmetic: 37 national parks and 11 national park reserves, 48 in all,
 * with Kluane National Park and Reserve among the reserves, and one national urban park beside them.
 */
export function parkTotals(): { parks: number; reserves: number; all: number; urban: number; heritage: number } {
  const kinds = parks.map(parkKind);
  const reserves = kinds.filter((kind) => kind === 'reserve' || kind === 'park-and-reserve').length;
  const urban = kinds.filter((kind) => kind === 'urban').length;
  const all = parks.length - urban;
  return { parks: all - reserves, reserves, all, urban, heritage: parks.filter(isWorldHeritagePark).length };
}

// ------------------------------------------------------ world heritage sites

export interface ProvinceHeritage {
  region: CanadaRegion;
  sites: HeritageProperty[];
}

/** Provinces and territories with at least one World Heritage Site, most sites first. A site in two is listed under both. */
export function heritageByProvince(): ProvinceHeritage[] {
  return CANADA_REGIONS.map((region) => ({ region, sites: HERITAGE_CANADA.filter((site) => site.provinces.includes(region.id)) }))
    .filter((entry) => entry.sites.length > 0)
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.sites.length - a.entry.sites.length || a.index - b.index)
    .map(({ entry }) => entry);
}

export const regionsWithoutHeritage = (): CanadaRegion[] =>
  CANADA_REGIONS.filter((region) => !HERITAGE_CANADA.some((site) => site.provinces.includes(region.id)));

// -------------------------------------------------------------------- cities

export interface RankedCity {
  rank: number;
  city: CanadaCity;
  region: CanadaRegion;
  population: number;
}

/** Canada's census metropolitan areas, largest first, by their population at the 2021 Census. */
export function cmaRanking(): RankedCity[] {
  const regions = new Map(CANADA_REGIONS.map((region) => [region.id, region]));
  return CANADA_CITIES.filter((city) => city.cma)
    .map((city) => {
      const population = CMA_POPULATION_2021[city.id];
      if (population === undefined) throw new Error(`No 2021 population on file for "${city.id}".`);
      return { city, region: regions.get(city.province)!, population };
    })
    .sort((a, b) => b.population - a.population)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

/** The capitals on the cities map that are too small to be census metropolitan areas. */
export const capitalsOutsideCmas = (): CanadaCity[] => CANADA_CITIES.filter((city) => !city.cma);

// ------------------------------------------------------------------- numbers

/** 6202225 → "6,202,225". Fractions of a square kilometre are rounded away. */
export const count = (value: number): string => Math.round(value).toLocaleString('en-CA');

/** A share as a percentage: one decimal place, or two when it is under one per cent ("0.16%"). */
export function share(part: number, whole: number): string {
  const percent = (part / whole) * 100;
  return `${percent.toFixed(percent < 1 ? 2 : 1)}%`;
}
