import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCKS, blocksIn, withBlocks } from '../../scripts/content/guide-blocks';
import { CANADA_REGIONS } from '../../src/data/definitions/canada';
import { CANADA_POPULATION_2021, CMA_POPULATION_2021, CMA_POPULATION_2021_TOTAL } from '../../src/data/definitions/canada-cities';
import { CANADA_PLACES } from '../../src/data/definitions/canada-places';
import { WORLD_UNITS } from '../../src/data/definitions/world';
import { LAND_EXAMPLES, LAND_KM2, landKm2, LARGEST_TEN, WORLD_LAND_KM2 } from '../../src/data/reference/land-area';
import { HERITAGE_CANADA, HERITAGE_TENTATIVE } from '../../src/data/reference/unesco-canada';
import {
  capitalsOutsideCmas,
  cmaRanking,
  continents,
  count,
  COUNTRY_TOTAL,
  heritageByProvince,
  parkKind,
  parksByProvince,
  parkTotals,
  regionsWithoutHeritage,
  share,
  territoriesByState,
  TERRITORY_TOTAL,
  UN_MEMBER_TOTAL,
} from '../../src/lib/guides/lists';

/**
 * The guides repeat facts the maps hold: 195 countries, 48 national parks, 41 cities. These tests
 * keep the two in step, check the reference figures the guides quote, and hold every guide to the
 * rules for its front matter.
 */

const dir = fileURLToPath(new URL('../../src/content/guides/', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));

interface Guide {
  id: string;
  raw: string;
  front: string;
  body: string;
}

const guides: Guide[] = readdirSync(dir)
  .filter((file) => file.endsWith('.md'))
  .sort()
  .map((file) => {
    const raw = readFileSync(join(dir, file), 'utf8');
    const [, front, ...rest] = raw.split(/^---$/m);
    return { id: file.replace(/\.md$/, ''), raw, front, body: rest.join('---') };
  });
const guide = (id: string) => guides.find((g) => g.id === id)!;
const field = (g: Guide, name: string) => new RegExp(`^${name}: "?(.*?)"?$`, 'm').exec(g.front)?.[1];
/** The words of a guide as a reader meets them: no markup, no data-block markers. */
const prose = (g: Guide) => g.body.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ');

describe('the lists inside the guides', () => {
  it('are exactly what the data produces, in every guide', () => {
    for (const g of guides) expect(withBlocks(g.raw), `${g.id} is behind the data: run npm run guides:sync`).toBe(g.raw);
  });

  it('uses every kind of list somewhere, and nothing unknown', () => {
    const used = new Set(guides.flatMap((g) => blocksIn(g.raw)));
    expect([...used].sort()).toEqual(Object.keys(BLOCKS).sort());
  });

  it('leaves no marker half-written', () => {
    for (const g of guides) {
      const opened = [...g.raw.matchAll(/<!-- data:([a-z0-9-]+) -->/g)].map((m) => m[1]);
      const closed = [...g.raw.matchAll(/<!-- \/data:([a-z0-9-]+) -->/g)].map((m) => m[1]);
      expect(opened, g.id).toEqual(closed);
      expect(blocksIn(g.raw), g.id).toEqual(opened);
    }
  });

  it('lists all 195 countries and all 42 territories in the checklist, each once', () => {
    const body = guide('countries-visited-checklist').body;
    const ticked = (block: string) => {
      const start = body.indexOf(`<!-- data:${block} -->`);
      return [...body.slice(start, body.indexOf(`<!-- /data:${block} -->`)).matchAll(/^- (.+?)(?: <small>.*<\/small>)?$/gm)].map((m) => m[1]);
    };
    const countries = WORLD_UNITS.filter((u) => u.status !== 'territory').map((u) => u.name);
    const territories = WORLD_UNITS.filter((u) => u.status === 'territory').map((u) => u.name);
    expect(ticked('countries-checklist').sort()).toEqual([...countries].sort());
    expect(ticked('territories-checklist').sort()).toEqual([...territories].sort());
    expect(countries).toHaveLength(195);
    expect(territories).toHaveLength(42);
  });

  it('lists every national park and reserve in the parks checklist, each once', () => {
    const body = guide('canada-national-parks-checklist').body;
    const start = body.indexOf('<!-- data:parks-checklist -->');
    const ticked = [...body.slice(start, body.indexOf('<!-- /data:parks-checklist -->')).matchAll(/^- (.+?)(?: <small>.*<\/small>)?$/gm)].map((m) => m[1]);
    expect(ticked.sort()).toEqual(CANADA_PLACES.places.filter((p) => p.kind === 'park').map((p) => p.name).sort());
    expect(ticked).toHaveLength(49);
  });
});

describe('countries and territories', () => {
  it('counts 195 countries: 193 members of the United Nations and 2 observer states', () => {
    expect(COUNTRY_TOTAL).toBe(195);
    expect(UN_MEMBER_TOTAL).toBe(193);
    expect(TERRITORY_TOTAL).toBe(42);
  });

  it('has the continent totals the checklist guide states', () => {
    const totals = Object.fromEntries(continents().map((part) => [part.name, [part.countries.length, part.territories.length]]));
    expect(totals).toEqual({
      Africa: [54, 4],
      Asia: [48, 3],
      Europe: [44, 6],
      'North America': [23, 15],
      'South America': [12, 2],
      Oceania: [14, 11],
      Antarctica: [0, 1],
    });
    const text = prose(guide('countries-visited-checklist'));
    expect(text).toContain('Africa has the most countries, 54.');
    expect(text).toContain('South America has the fewest, 12.');
    expect(text).toContain('which is why it has 23 countries');
  });

  it('puts the countries the guide names under the continents it says', () => {
    const group = (name: string) => WORLD_UNITS.find((u) => u.name === name)!.group;
    expect(group('Russia')).toBe('europe');
    for (const name of ['Kazakhstan', 'Türkiye', 'Cyprus', 'Armenia', 'Azerbaijan', 'Georgia']) expect(group(name), name).toBe('asia');
    expect(group('Egypt')).toBe('africa');
    for (const name of ['Belize', 'Panama', 'Cuba', 'Jamaica', 'Greenland']) expect(group(name), name).toBe('north-america');
  });

  it('groups the territories by the state responsible, the longest list first', () => {
    const groups = territoriesByState();
    expect(groups.map((g) => [g.state?.name ?? null, g.territories.length])).toEqual([
      ['United Kingdom', 14],
      ['France', 7],
      ['United States', 5],
      ['Netherlands', 3],
      ['Australia', 2],
      ['China', 2],
      ['Denmark', 2],
      ['New Zealand', 2],
      ['Finland', 1],
      [null, 4],
    ]);
    expect(groups.at(-1)!.territories.map((u) => u.name)).toEqual(['Antarctica', 'Kosovo', 'Taiwan', 'Western Sahara']);
    expect(groups.reduce((sum, g) => sum + g.territories.length, 0)).toBe(TERRITORY_TOTAL);
    // Every state named is itself one of the 195.
    for (const g of groups) if (g.state) expect(g.state.status, g.state.name).toBe('un-member');
  });

  it('says of Greenland, Puerto Rico and Hong Kong what the map does with them', () => {
    const state = (name: string) => WORLD_UNITS.find((u) => u.id === WORLD_UNITS.find((t) => t.name === name)!.sovereign)!.name;
    expect(state('Greenland')).toBe('Denmark');
    expect(state('Puerto Rico')).toBe('United States');
    expect(state('Hong Kong')).toBe('China');
    expect(field(guide('what-counts-as-a-country'), 'description')).toContain('39 more');
    expect(TERRITORY_TOTAL - 3).toBe(39);
  });
});

describe('percentages of the world', () => {
  const text = prose(guide('what-percentage-of-the-world-have-you-visited'));

  it('quotes the percentages the sum gives', () => {
    expect(share(20, 195)).toBe('10.3%');
    expect(share(50, 195)).toBe('25.6%');
    expect(share(100, 195)).toBe('51.3%');
    expect(share(23, 195)).toBe('11.8%');
    for (const figure of ['Twenty countries is 10.3%', 'Fifty is 25.6%', 'One hundred is 51.3%', '23 of the 195 countries, about 12%']) expect(text).toContain(figure);
  });

  it('names the right number of countries to pass 10% and 50%', () => {
    const toPass = (percent: number) => Math.floor((195 * percent) / 100) + 1;
    expect(toPass(10)).toBe(20);
    expect(toPass(50)).toBe(98);
    expect(text).toContain('20 countries to pass 10%');
    expect(text).toContain('98 to pass 50%');
  });

  it('has a land area for every country in an example, all of them countries on the map', () => {
    const units = new Map(WORLD_UNITS.map((u) => [u.id, u]));
    for (const id of Object.keys(LAND_KM2)) {
      expect(units.get(id)?.status, id).toBe('un-member');
      expect(LAND_KM2[id]).toBeGreaterThan(0);
    }
    for (const example of LAND_EXAMPLES) {
      expect(new Set(example.ids).size, example.id).toBe(example.ids.length);
      expect(landKm2(example.ids)).toBeGreaterThan(0);
    }
    expect(() => landKm2(['XXX'])).toThrow();
    const caribbean = LAND_EXAMPLES.find((e) => e.id === 'caribbean')!;
    expect(caribbean.ids).toHaveLength(10);
    for (const id of caribbean.ids) expect(units.get(id)!.group).toBe('north-america');
  });

  it('ranks the ten largest countries in order, and no other figure on file is larger than the tenth', () => {
    const areas = LARGEST_TEN.map((id) => LAND_KM2[id]);
    expect([...areas].sort((a, b) => b - a)).toEqual(areas);
    for (const [id, area] of Object.entries(LAND_KM2)) if (!LARGEST_TEN.includes(id)) expect(area, id).toBeLessThan(areas[9]);
    expect(LARGEST_TEN.indexOf('CAN')).toBe(3);
  });

  it('states the comparisons the figures support', () => {
    expect(share(landKm2(['RUS']), WORLD_LAND_KM2)).toBe('12.6%');
    expect(share(landKm2(LARGEST_TEN), WORLD_LAND_KM2)).toBe('54.4%');
    expect(share(10, 195)).toBe('5.1%');
    const caribbean = landKm2(LAND_EXAMPLES.find((e) => e.id === 'caribbean')!.ids);
    expect(share(caribbean, WORLD_LAND_KM2)).toBe('0.16%');
    expect(Math.round(LAND_KM2.RUS / caribbean)).toBe(79);
    expect(text).toContain('Russia is about 79 times larger than all ten put together');
    expect(text).toContain('Ten countries are 5.1% of the list of 195 and 54.4% of the world’s land.');
  });
});

describe('national parks', () => {
  it('adds up the way Parks Canada counts: 37 national parks, 11 reserves, and one urban park apart', () => {
    expect(parkTotals()).toEqual({ parks: 37, reserves: 11, all: 48, urban: 1, heritage: 9 });
    const parks = CANADA_PLACES.places.filter((p) => p.kind === 'park');
    expect(parks.filter((p) => parkKind(p) === 'park-and-reserve').map((p) => p.id)).toEqual(['kluane']);
    expect(parks.filter((p) => parkKind(p) === 'urban').map((p) => p.id)).toEqual(['rouge']);
  });

  it('gives each province the number the guide states', () => {
    const perProvince = Object.fromEntries(parksByProvince().map((entry) => [entry.region.postal, entry.parks.length]));
    expect(perProvince).toEqual({ NL: 4, PE: 2, NS: 3, NB: 2, QC: 3, ON: 5, MB: 2, SK: 2, AB: 5, BC: 7, YT: 3, NT: 5, NU: 5 });
    const most = parksByProvince().sort((a, b) => b.parks.length - a.parks.length)[0];
    expect(most.region.name).toBe('British Columbia');
    expect(Math.min(...Object.values(perProvince))).toBe(2);
    const text = prose(guide('canada-national-parks-checklist'));
    expect(text).toContain('37 national parks and 11 national park reserves');
    expect(text).toContain('British Columbia has the most, with seven.');
    expect(text).toContain('Every province and territory has at least two.');
    expect(text).toContain('Nine of the 48 are on the UNESCO World Heritage List');
  });
});

describe('World Heritage Sites', () => {
  const places = new Map(CANADA_PLACES.places.map((p) => [p.id, p]));

  it('has the 22 sites UNESCO lists: 10 cultural, 11 natural and 1 mixed', () => {
    expect(HERITAGE_CANADA).toHaveLength(22);
    const kinds = (kind: string) => HERITAGE_CANADA.filter((s) => s.kind === kind).length;
    expect([kinds('cultural'), kinds('natural'), kinds('mixed')]).toEqual([10, 11, 1]);
    expect(new Set(HERITAGE_CANADA.map((s) => s.name)).size).toBe(22);
    expect(HERITAGE_TENTATIVE).toBe(10);
    for (const site of HERITAGE_CANADA) {
      expect(site.years.length, site.name).toBeGreaterThanOrEqual(1);
      expect([...site.years].sort((a, b) => a - b), site.name).toEqual(site.years);
      expect(site.years[0], site.name).toBeGreaterThanOrEqual(1978);
      expect(site.about.length, site.name).toBeGreaterThan(30);
      expect(site.about.endsWith('.'), site.name).toBe(true);
    }
  });

  it('ties every site to places on the Canada map, and every such place to a site', () => {
    const used = HERITAGE_CANADA.flatMap((site) => site.places);
    expect(new Set(used).size).toBe(used.length);
    for (const site of HERITAGE_CANADA) {
      for (const id of site.places) {
        const place = places.get(id);
        expect(place, `${site.name}: ${id}`).toBeDefined();
        // A place is counted in one of the provinces its site lies in.
        expect(site.provinces, `${site.name}: ${id}`).toContain(place!.within);
      }
      // The first province named is where the map counts it.
      expect(places.get(site.places[0])!.within === site.provinces[0] || site.places.length > 1, site.name).toBe(true);
    }
    const ownEntry = CANADA_PLACES.places.filter((p) => p.kind === 'heritage').map((p) => p.id);
    const parksWithStatus = CANADA_PLACES.places.filter((p) => p.kind === 'park' && p.note?.includes('World Heritage Site')).map((p) => p.id);
    expect([...used].sort()).toEqual([...ownEntry, ...parksWithStatus].sort());
    expect(ownEntry).toHaveLength(16);
    expect(parksWithStatus).toHaveLength(9);
  });

  it('counts them by province as the guide says', () => {
    const perProvince = heritageByProvince().map((entry) => [entry.region.postal, entry.sites.length]);
    expect(perProvince).toEqual([['AB', 6], ['NL', 4], ['NS', 3], ['QC', 3], ['BC', 3], ['ON', 2], ['YT', 2], ['NT', 2], ['MB', 1]]);
    expect(regionsWithoutHeritage().map((r) => r.name)).toEqual(['Prince Edward Island', 'New Brunswick', 'Saskatchewan', 'Nunavut']);
    const shared = HERITAGE_CANADA.filter((s) => s.provinces.length > 1);
    expect(shared).toHaveLength(4);
    expect(HERITAGE_CANADA.filter((s) => s.sharedWith).map((s) => s.sharedWith)).toEqual(['United States', 'United States']);
    const text = prose(guide('unesco-world-heritage-sites-in-canada'));
    expect(text).toContain('Canada has 22 UNESCO World Heritage Sites: 10 cultural, 11 natural and 1 mixed.');
    expect(text).toContain('Alberta has the most, with six.');
    expect(text).toContain('Prince Edward Island, New Brunswick, Saskatchewan and Nunavut');
    expect(text).toContain('Four sites lie in two provinces or territories');
    expect(text).toContain('UNESCO lists 10 sites on Canada’s Tentative List');
  });

  it('names the first and the newest correctly', () => {
    const byYear = [...HERITAGE_CANADA].sort((a, b) => a.years[0] - b.years[0]);
    expect(byYear.filter((s) => s.years[0] === byYear[0].years[0]).map((s) => s.name).sort()).toEqual(['L’Anse aux Meadows National Historic Site', 'Nahanni National Park']);
    const newest = byYear.at(-1)!.years[0];
    expect(newest).toBe(2023);
    expect(byYear.filter((s) => s.years[0] === newest).map((s) => s.name).sort()).toEqual(['Anticosti', 'Tr’ondëk-Klondike']);
  });
});

describe('cities by population', () => {
  const ranking = cmaRanking();
  const text = prose(guide('largest-cities-in-canada'));

  it('ranks 41 metropolitan areas whose populations add up to the published total', () => {
    expect(ranking).toHaveLength(41);
    expect(Object.keys(CMA_POPULATION_2021)).toHaveLength(41);
    expect(ranking.reduce((sum, entry) => sum + entry.population, 0)).toBe(CMA_POPULATION_2021_TOTAL);
    expect(ranking.map((entry) => entry.rank)).toEqual(Array.from({ length: 41 }, (_, i) => i + 1));
    for (let i = 1; i < ranking.length; i++) expect(ranking[i].population, ranking[i].city.name).toBeLessThan(ranking[i - 1].population);
    expect(share(CMA_POPULATION_2021_TOTAL, CANADA_POPULATION_2021)).toBe('73.7%');
  });

  it('opens with the three largest and the six above a million', () => {
    expect(ranking.slice(0, 3).map((entry) => entry.city.name)).toEqual(['Toronto', 'Montréal', 'Vancouver']);
    expect(ranking.filter((entry) => entry.population > 1_000_000).map((entry) => entry.city.name)).toEqual(['Toronto', 'Montréal', 'Vancouver', 'Ottawa–Gatineau', 'Calgary', 'Edmonton']);
    expect(text).toContain(`Toronto, with ${count(CMA_POPULATION_2021.toronto)} people`);
    expect(text).toContain(`Montréal is second with ${count(CMA_POPULATION_2021.montreal)} and Vancouver third with ${count(CMA_POPULATION_2021.vancouver)}`);
  });

  it('quotes no population that is not in the data', () => {
    // Every figure of six digits or more in the guide is a census count on file, the 2025 estimate
    // from Statistics Canada that the guide attributes, or the 100,000 that defines a metropolitan area.
    const known = new Set([...Object.values(CMA_POPULATION_2021), CMA_POPULATION_2021_TOTAL, CANADA_POPULATION_2021, 31_169_100, 100_000].map(count));
    const quoted = text.match(/\b\d{1,3}(?:,\d{3})+\b/g) ?? [];
    expect(quoted.length).toBeGreaterThan(50);
    for (const figure of quoted) if (figure.length >= 7) expect(known.has(figure), figure).toBe(true);
  });

  it('compares capitals and largest cities correctly', () => {
    const p = CMA_POPULATION_2021;
    expect(p.calgary).toBeGreaterThan(p.edmonton);
    expect(p.vancouver / p.victoria).toBeGreaterThan(6);
    expect(p.montreal / p['quebec-city']).toBeGreaterThan(5);
    expect(p.saskatoon).toBeGreaterThan(p.regina);
    expect(p.fredericton).toBeLessThan(p['saint-john']);
    expect(p['saint-john']).toBeLessThan(p.moncton);
    expect(ranking.find((entry) => entry.city.id === 'ottawa-gatineau')!.rank).toBe(4);
  });

  it('counts the metropolitan areas in each province, and the capitals outside them', () => {
    const perProvince = Object.fromEntries(CANADA_REGIONS.map((r) => [r.postal, ranking.filter((entry) => entry.region.id === r.id).length]));
    expect(perProvince).toEqual({ NL: 1, PE: 0, NS: 1, NB: 3, QC: 6, ON: 16, MB: 1, SK: 2, AB: 4, BC: 7, YT: 0, NT: 0, NU: 0 });
    expect(capitalsOutsideCmas().map((city) => city.name)).toEqual(['Charlottetown', 'Whitehorse', 'Yellowknife', 'Iqaluit']);
    expect(text).toContain('Ontario has 16 of the 41.');
    expect(text).toContain('Charlottetown, Whitehorse, Yellowknife and Iqaluit');
  });
});

describe('every guide', () => {
  const ids = guides.map((g) => g.id);

  it('is one of eleven, each on a shelf and in its own place in the order', () => {
    expect(ids).toHaveLength(11);
    const topics = guides.map((g) => field(g, 'topic'));
    for (const topic of topics) expect(['world', 'canada', 'making']).toContain(topic);
    for (const shelf of ['world', 'canada', 'making']) expect(topics.filter((t) => t === shelf).length, shelf).toBeGreaterThanOrEqual(2);
    const orders = guides.map((g) => Number(field(g, 'order')));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('has a title and description that fit a search result', () => {
    for (const g of guides) {
      const title = field(g, 'title')!;
      const description = field(g, 'description')!;
      expect(title.length, title).toBeLessThanOrEqual(62);
      expect(title.length, title).toBeGreaterThanOrEqual(25);
      expect(description.length, description).toBeGreaterThanOrEqual(110);
      expect(description.length, description).toBeLessThanOrEqual(165);
    }
  });

  it('answers in its first paragraph, in bold, before any heading', () => {
    for (const g of guides.filter((x) => Date.parse(field(x, 'published')!) >= Date.parse('2026-10-11'))) {
      const first = g.body.trim().split(/\n\s*\n/)[0];
      expect(first.startsWith('**'), g.id).toBe(true);
      expect(first.length, g.id).toBeGreaterThan(120);
    }
  });

  it('is dated honestly: updated on or after the day it was published, and not in the future', () => {
    for (const g of guides) {
      const published = Date.parse(field(g, 'published')!);
      const updated = Date.parse(field(g, 'updated')!);
      expect(updated, g.id).toBeGreaterThanOrEqual(published);
      expect(updated, g.id).toBeLessThanOrEqual(Date.now() + 86_400_000);
    }
  });

  it('names its sources, each with an address that starts with https', () => {
    for (const g of guides) {
      const urls = [...g.front.matchAll(/^\s+url: "(.+)"$/gm)].map((m) => m[1]);
      expect(urls.length, g.id).toBeGreaterThanOrEqual(1);
      for (const url of urls) expect(url, g.id).toMatch(/^https:\/\//);
      expect(new Set(urls).size, g.id).toBe(urls.length);
    }
    // The guides written from October 11 on rest on at least two sources each.
    for (const g of guides.filter((x) => field(x, 'published') === '2026-10-11')) {
      expect([...g.front.matchAll(/^\s+url: /gm)].length, g.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('links only to guides and pages that exist, and is linked from at least two other guides', () => {
    const inbound = new Map(ids.map((id) => [id, new Set<string>()]));
    for (const g of guides) {
      for (const [, target] of g.body.matchAll(/\]\((\/[^)#]*)/g)) {
        const linked = /^\/guides\/([^/]+)\/$/.exec(target)?.[1];
        if (linked) {
          expect(ids, `${g.id} links to ${target}`).toContain(linked);
          if (linked !== g.id) inbound.get(linked)!.add(g.id);
        } else {
          expect(target, `${g.id} links to ${target}`).toMatch(/^\/(maps\/(world|canada|canada-cities)\/(poster\/)?|maps\/|guides\/|methodology\/|travel-map-poster\/|how-it-works\/|about\/|contact\/|privacy\/)$/);
        }
      }
    }
    for (const [id, from] of inbound) expect(from.size, `${id} is linked from ${[...from].join(', ') || 'no other guide'}`).toBeGreaterThanOrEqual(2);
  });

  it('offers files that exist, with words for the picture of the sheet', () => {
    const withFiles = guides.filter((g) => /^downloads:/m.test(g.front));
    expect(withFiles.map((g) => g.id).sort()).toEqual(['canada-national-parks-checklist', 'countries-visited-checklist']);
    for (const g of withFiles) {
      const files = [...g.front.matchAll(/^\s+href: (\/downloads\/.+)$/gm)].map((m) => m[1]);
      expect(files, g.id).toHaveLength(2);
      for (const file of files) expect(existsSync(join(root, 'public', file)), file).toBe(true);
      expect(field(g, 'downloadsAlt')!.length, g.id).toBeGreaterThan(60);
    }
  });

  it('makes no claim the site could not back up', () => {
    for (const g of guides) {
      const text = `${field(g, 'title')} ${field(g, 'description')} ${field(g, 'deck')} ${prose(g)}`;
      for (const claim of [/\bultimate\b/i, /\bguaranteed\b/i, /\b(?:will|to) rank\b/i, /\bnumber one\b/i, /\d\s+(?:users|travellers|travelers|customers|downloads)\b/i]) {
        expect(text, `${claim} in ${g.id}`).not.toMatch(claim);
      }
    }
  });
});
