/**
 * Land area of countries, for the guide that compares "share of countries" with "share of land".
 *
 * Source: World Bank, indicator AG.LND.TOTL.K2, "Land area (sq. km)", values for 2022, which the
 * World Bank takes from the Food and Agriculture Organization (FAOSTAT). Licence: CC BY 4.0.
 * Read from the World Bank API on 11 October 2026 (the API reported its data as last updated on
 * 8 October 2026).
 *
 * The World Bank's definition: land area is a country's total area, excluding area under inland
 * water bodies, national claims to continental shelf, and exclusive economic zones. That is why
 * Canada is 8,788,700 km² here and 9,984,670 km² (land and fresh water) in the provinces guide.
 *
 * Only the countries a worked example needs are listed. Keys are the ids of the world map.
 */
export const LAND_AREA_YEAR = 2022;

/** The World Bank's figure for the world as a whole, in km². */
export const WORLD_LAND_KM2 = 129_762_630.687;

// prettier-ignore
export const LAND_KM2: Record<string, number> = {
  // The ten largest by land area.
  RUS: 16_376_870, CHN: 9_388_210, USA: 9_147_420, CAN: 8_788_700, BRA: 8_358_140,
  AUS: 7_692_020, IND: 2_973_190, ARG: 2_736_690, KAZ: 2_699_700, DZA: 2_381_740,
  // North America's third large country.
  MEX: 1_943_950,
  // Five of western Europe's most visited.
  FRA: 538_950, ESP: 499_713.681, ITA: 295_720, DEU: 349_360, GBR: 241_930,
  // Ten Caribbean island countries.
  ATG: 440, BHS: 10_010, BRB: 430, CUB: 103_800, DOM: 48_198.02,
  GRD: 340, HTI: 27_560, JAM: 10_830, LCA: 610, TTO: 5_130,
};

export interface LandExample {
  id: string;
  /** How the row reads in the guide. */
  label: string;
  /** World map ids of the countries in the example. */
  ids: string[];
}

/** The ten largest countries by land area, largest first. */
export const LARGEST_TEN = ['RUS', 'CHN', 'USA', 'CAN', 'BRA', 'AUS', 'IND', 'ARG', 'KAZ', 'DZA'];

export const LAND_EXAMPLES: LandExample[] = [
  { id: 'russia', label: 'Russia alone', ids: ['RUS'] },
  { id: 'north-america', label: 'Canada, the United States and Mexico', ids: ['CAN', 'USA', 'MEX'] },
  { id: 'western-europe', label: 'France, Spain, Italy, Germany and the United Kingdom', ids: ['FRA', 'ESP', 'ITA', 'DEU', 'GBR'] },
  {
    id: 'caribbean',
    label: 'Ten Caribbean island countries',
    ids: ['ATG', 'BHS', 'BRB', 'CUB', 'DOM', 'GRD', 'HTI', 'JAM', 'LCA', 'TTO'],
  },
  { id: 'largest-ten', label: 'The ten largest countries', ids: LARGEST_TEN },
];

/** Land area of a group of countries, in km². Throws when a figure is missing, so no example is ever short. */
export function landKm2(ids: string[]): number {
  return ids.reduce((sum, id) => {
    const area = LAND_KM2[id];
    if (area === undefined) throw new Error(`No land area on file for "${id}".`);
    return sum + area;
  }, 0);
}
