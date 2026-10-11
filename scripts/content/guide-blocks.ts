/**
 * The parts of the guides that are data: every list and table that repeats what the maps hold.
 *
 * A guide marks such a part with a pair of comments,
 *
 *   <!-- data:countries-checklist -->
 *   ...
 *   <!-- /data:countries-checklist -->
 *
 * and `npm run guides:sync` writes what belongs between them, from the same definitions the maps
 * read. A unit test fails when a guide and the data disagree, so a list in an article can never
 * quietly fall behind the map it describes.
 */
import { WORLD_UNITS } from '../../src/data/definitions/world';
import { LAND_AREA_YEAR, LAND_EXAMPLES, LAND_KM2, landKm2, LARGEST_TEN, WORLD_LAND_KM2 } from '../../src/data/reference/land-area';
import { HERITAGE_CANADA } from '../../src/data/reference/unesco-canada';
import { CANADA_REGIONS } from '../../src/data/definitions/canada';
import {
  cmaRanking,
  continents,
  count,
  COUNTRY_TOTAL,
  countryNote,
  heritageByProvince,
  parkKind,
  parksByProvince,
  parkTotals,
  share,
  territoriesByState,
  TERRITORY_TOTAL,
} from '../../src/lib/guides/lists';
import { listOf } from '../../src/lib/text';
import { percentLabel } from '../../src/lib/maps/stats';

type Align = 'l' | 'r';

/** A Markdown table inside the scrolling wrapper every guide table uses, so a wide one never breaks a phone layout. */
function table(label: string, head: string[], align: Align[], rows: string[][]): string {
  return [
    `<div class="table-scroll" role="region" aria-label="${label}" tabindex="0">`,
    '',
    `| ${head.join(' | ')} |`,
    `| ${align.map((a) => (a === 'r' ? '---:' : '---')).join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    '</div>',
  ].join('\n');
}

/** A list to tick off: an ordinary Markdown list in the wrapper that draws the boxes. */
function checklist(items: { name: string; note?: string }[], wide = false): string {
  return [
    `<div class="checklist${wide ? ' checklist--wide' : ''}">`,
    '',
    ...items.map((item) => `- ${item.name}${item.note ? ` <small>${item.note}</small>` : ''}`),
    '',
    '</div>',
  ].join('\n');
}

const worldName = new Map(WORLD_UNITS.map((unit) => [unit.id, unit.name]));
/** A province or territory as it reads in a sentence: "the Northwest Territories". */
const regionName = new Map(CANADA_REGIONS.map((region) => [region.id, region.name === 'Northwest Territories' ? 'the Northwest Territories' : region.name]));
const bold = (text: string | number) => `**${text}**`;
const dash = (value: number) => (value ? String(value) : '–');

// ------------------------------------------------------------------- world

/** How many countries make which percentage, and what the map prints for it. */
function percentLadder(): string {
  const steps = [1, 5, 10, 20, 25, 30, 40, 50, 75, 100, 150, COUNTRY_TOTAL];
  return table(
    'Countries visited as a percentage of 195',
    ['Countries visited', `Share of the ${COUNTRY_TOTAL}`, 'What the world map shows'],
    ['r', 'r', 'r'],
    steps.map((n) => [String(n), n === COUNTRY_TOTAL ? '100%' : share(n, COUNTRY_TOTAL), percentLabel(n, COUNTRY_TOTAL).replace('<', '&lt;')]),
  );
}

function landExamples(): string {
  return table(
    'The same trips measured by countries and by land area',
    ['Where you have been', 'Countries', `Share of the ${COUNTRY_TOTAL}`, 'Land area (km²)', 'Share of the world’s land'],
    ['l', 'r', 'r', 'r', 'r'],
    LAND_EXAMPLES.map((example) => {
      const area = landKm2(example.ids);
      return [example.label, String(example.ids.length), share(example.ids.length, COUNTRY_TOTAL), count(area), share(area, WORLD_LAND_KM2)];
    }),
  );
}

function largestTen(): string {
  return table(
    `The ten largest countries by land area, ${LAND_AREA_YEAR}`,
    ['Rank', 'Country', 'Land area (km²)', 'Share of the world’s land'],
    ['r', 'l', 'r', 'r'],
    [
      ...LARGEST_TEN.map((id, index) => [String(index + 1), worldName.get(id)!, count(LAND_KM2[id]), share(LAND_KM2[id], WORLD_LAND_KM2)]),
      ['', bold('All ten'), bold(count(landKm2(LARGEST_TEN))), bold(share(landKm2(LARGEST_TEN), WORLD_LAND_KM2))],
    ],
  );
}

function continentCounts(): string {
  const parts = continents();
  return table(
    'Countries and territories in each continent',
    ['Continent', 'Countries', 'Territories on the map'],
    ['l', 'r', 'r'],
    [
      ...parts.map((part) => [part.name, dash(part.countries.length), dash(part.territories.length)]),
      [bold('Total'), bold(COUNTRY_TOTAL), bold(TERRITORY_TOTAL)],
    ],
  );
}

function countriesChecklist(): string {
  return continents()
    .filter((part) => part.countries.length > 0)
    .map((part) => `### ${part.name} (${part.countries.length})\n\n${checklist(part.countries.map((unit) => ({ name: unit.name, note: countryNote(unit) })))}`)
    .join('\n\n');
}

function territoriesChecklist(): string {
  const items = territoriesByState()
    .flatMap((group) => group.territories.map((unit) => ({ name: unit.name, note: group.state ? group.state.name : 'Other area' })))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return checklist(items);
}

function territoriesTable(): string {
  return table(
    'Territories on the world map, by the state responsible for them',
    ['State responsible', 'Territories on the map', 'Which ones'],
    ['l', 'r', 'l'],
    [
      ...territoriesByState().map((group) => [
        group.state ? group.state.name : 'None named on this map',
        String(group.territories.length),
        group.territories.map((unit) => unit.name).join(', '),
      ]),
      [bold('Total'), bold(TERRITORY_TOTAL), ''],
    ],
  );
}

// ------------------------------------------------------------ national parks

function parksByProvinceTable(): string {
  const totals = parkTotals();
  const isReserve = (kind: string) => kind === 'reserve' || kind === 'park-and-reserve';
  return table(
    'National parks and national park reserves by province and territory',
    ['Province or territory', 'National parks', 'National park reserves', 'Total'],
    ['l', 'r', 'r', 'r'],
    [
      ...parksByProvince().map((entry) => {
        const reserves = entry.parks.filter((place) => isReserve(parkKind(place))).length;
        return [entry.region.name, dash(entry.parks.length - reserves), dash(reserves), String(entry.parks.length)];
      }),
      [bold('Canada'), bold(totals.parks), bold(totals.reserves), bold(totals.all)],
    ],
  );
}

function parksChecklist(): string {
  const totals = parkTotals();
  const provinces = parksByProvince();
  const sections = provinces.map(
    (entry) => `### ${entry.region.name} (${entry.parks.length})\n\n${checklist(entry.parks.map((place) => ({ name: place.name, note: place.note })), true)}`,
  );
  const urban = provinces.flatMap((entry) => entry.urban.map((place) => ({ name: place.name, note: `${entry.region.name}. Counted apart from the ${totals.all}` })));
  if (urban.length) sections.push(`### National urban park (${urban.length})\n\n${checklist(urban, true)}`);
  return sections.join('\n\n');
}

// ------------------------------------------------------ world heritage sites

const KIND = { cultural: 'Cultural', natural: 'Natural', mixed: 'Mixed' } as const;
const where = (site: (typeof HERITAGE_CANADA)[number]) =>
  listOf(site.provinces.map((id) => regionName.get(id)!)) + (site.sharedWith ? `, shared with the ${site.sharedWith}` : '');

function heritageTable(): string {
  const sites = [...HERITAGE_CANADA].sort((a, b) => a.years[0] - b.years[0] || a.name.localeCompare(b.name, 'en'));
  return table(
    'UNESCO World Heritage Sites in Canada, in order of inscription',
    ['World Heritage Site', 'Where', 'Kind', 'Inscribed'],
    ['l', 'l', 'l', 'l'],
    sites.map((site) => [site.name, where(site), KIND[site.kind], site.years.join(', ')]),
  );
}

function heritageByProvinceList(): string {
  return heritageByProvince()
    .map(({ region, sites }) => {
      const lines = sites.map((site) => {
        const others = site.provinces.filter((id) => id !== region.id).map((id) => regionName.get(id)!);
        const also = [...others, ...(site.sharedWith ? [`the ${site.sharedWith}`] : [])];
        return `- **${site.name}** (${site.years[0]}). ${site.about}${also.length ? ` Shared with ${listOf(also)}.` : ''}`;
      });
      return `### ${region.name} (${sites.length})\n\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

// -------------------------------------------------------------------- cities

/** Ottawa–Gatineau is the one metropolitan area that lies in two provinces. */
const CITY_SPANS: Record<string, string> = { 'ottawa-gatineau': 'Ontario and Quebec' };

function cmaTable(): string {
  return table(
    'Census metropolitan areas of Canada by population, 2021 Census',
    ['Rank', 'Metropolitan area', 'Province', 'Population, 2021'],
    ['r', 'l', 'l', 'r'],
    cmaRanking().map((entry) => [String(entry.rank), entry.city.name, CITY_SPANS[entry.city.id] ?? entry.region.name, count(entry.population)]),
  );
}

function cmaByProvince(): string {
  const ranking = cmaRanking();
  const rows = CANADA_REGIONS.map((region) => ({ region, cities: ranking.filter((entry) => entry.region.id === region.id) }))
    .filter((row) => row.cities.length > 0)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.cities.length - a.row.cities.length || a.index - b.index)
    .map(({ row }) => [row.region.name, String(row.cities.length), row.cities.map((entry) => entry.city.name).join(', ')]);
  return table(
    'Census metropolitan areas in each province',
    ['Province', 'Metropolitan areas', 'Which ones, largest first'],
    ['l', 'r', 'l'],
    [...rows, [bold('Canada'), bold(ranking.length), '']],
  );
}

/** Every block a guide may ask for, by the name it uses in its markers. */
export const BLOCKS: Record<string, () => string> = {
  'percent-ladder': percentLadder,
  'land-examples': landExamples,
  'largest-ten': largestTen,
  'continent-counts': continentCounts,
  'countries-checklist': countriesChecklist,
  'territories-checklist': territoriesChecklist,
  'territories-by-state': territoriesTable,
  'parks-by-province': parksByProvinceTable,
  'parks-checklist': parksChecklist,
  'heritage-table': heritageTable,
  'heritage-by-province': heritageByProvinceList,
  'cma-table': cmaTable,
  'cma-by-province': cmaByProvince,
};

const MARKED = /<!-- data:([a-z0-9-]+) -->\n[\s\S]*?<!-- \/data:\1 -->/g;

/** The names of the blocks a guide asks for, in the order they appear. */
export function blocksIn(markdown: string): string[] {
  return [...markdown.matchAll(MARKED)].map((match) => match[1]);
}

/** The guide with every marked block written afresh from the data. */
export function withBlocks(markdown: string): string {
  return markdown.replace(MARKED, (_whole, name: string) => {
    const make = BLOCKS[name];
    if (!make) throw new Error(`A guide asks for a data block named "${name}", which does not exist.`);
    return `<!-- data:${name} -->\n\n${make()}\n\n<!-- /data:${name} -->`;
  });
}
