import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CANADA_REGIONS } from '../../src/data/definitions/canada';
import { CANADA_CITIES } from '../../src/data/definitions/canada-cities';
import { CANADA_PLACES } from '../../src/data/definitions/canada-places';
import { MAP_PAGES } from '../../src/data/pages';
import { featuresWithMarks, loadPlaceMarks, placesIn, savePlaceMarks, storageKeys, summarizePlaces } from '../../src/lib/maps/places';
import { MAPS } from '../../src/lib/maps/registry';
import { suggestRollup } from '../../src/lib/maps/rollup';
import { emptySelection, loadSelection, normalizeSelection, saveSelection } from '../../src/lib/maps/store';
import { installStorage } from '../helpers/storage';

const layer = CANADA_PLACES;
const ofKind = (kind: string) => layer.places.filter((p) => p.kind === kind);
const inProvince = (id: string, kind?: string) => placesIn(layer, id).filter((p) => !kind || p.kind === kind);

describe('canada: what is on the list of places', () => {
  it('lists 178 places of four kinds', () => {
    expect(layer.places).toHaveLength(178);
    expect(layer.kinds.map((k) => k.id)).toEqual(['city', 'sight', 'park', 'heritage']);
    expect(ofKind('city')).toHaveLength(45);
    expect(ofKind('park')).toHaveLength(49);
    expect(ofKind('heritage')).toHaveLength(16);
    expect(ofKind('sight')).toHaveLength(68);
    for (const place of layer.places) expect(layer.kinds.some((k) => k.id === place.kind), place.id).toBe(true);
  });

  it('gives every place a unique id and a unique name', () => {
    expect(new Set(layer.places.map((p) => p.id)).size).toBe(layer.places.length);
    expect(new Set(layer.places.map((p) => p.name)).size).toBe(layer.places.length);
    for (const place of layer.places) expect(place.id, place.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('counts every place in exactly one real province or territory, and leaves none of them empty', () => {
    const provinces = new Set(CANADA_REGIONS.map((r) => r.id));
    for (const place of layer.places) expect(provinces.has(place.within), `${place.id} in ${place.within}`).toBe(true);
    for (const region of CANADA_REGIONS) {
      expect(inProvince(region.id).length, region.name).toBeGreaterThanOrEqual(6);
      expect(inProvince(region.id, 'city').length, `${region.name} cities`).toBeGreaterThanOrEqual(1);
      expect(inProvince(region.id, 'park').length, `${region.name} parks`).toBeGreaterThanOrEqual(2);
    }
  });

  it('takes its cities from the cities map, one for one', () => {
    expect(ofKind('city').map((p) => p.id)).toEqual(CANADA_CITIES.map((c) => c.id));
    for (const place of ofKind('city')) {
      const city = CANADA_CITIES.find((c) => c.id === place.id)!;
      expect(place.within).toBe(city.province);
      expect(place.from).toEqual({ map: 'canada-cities', id: city.id });
    }
    for (const place of layer.places) if (place.kind !== 'city') expect(place.from, place.id).toBeUndefined();
  });

  it('has the 48 national parks and reserves, and the national urban park, in the right provinces', () => {
    // Parks Canada: 37 national parks and 11 national park reserves, plus Rouge National Urban Park.
    const perProvince = Object.fromEntries(CANADA_REGIONS.map((r) => [r.postal, inProvince(r.id, 'park').length]));
    expect(perProvince).toEqual({ NL: 4, PE: 2, NS: 3, NB: 2, QC: 3, ON: 6, MB: 2, SK: 2, AB: 5, BC: 7, YT: 3, NT: 5, NU: 5 });
    expect(ofKind('park').filter((p) => p.note === 'National urban park').map((p) => p.id)).toEqual(['rouge']);
    // Ten are reserves outright; Kluane is a park and a reserve, and is listed once.
    expect(ofKind('park').filter((p) => p.note?.startsWith('Reserve'))).toHaveLength(10);
  });

  it('accounts for all 22 UNESCO World Heritage Sites', () => {
    // Sixteen have their own entry. The other six are national parks, or groups of them, already
    // on the list: the Canadian Rocky Mountain Parks (four parks), Gros Morne, Kluane, Nahanni,
    // Waterton and Wood Buffalo.
    expect(ofKind('heritage')).toHaveLength(16);
    const parks = ofKind('park').filter((p) => p.note?.includes('World Heritage Site')).map((p) => p.id).sort();
    expect(parks).toEqual(['banff', 'gros-morne', 'jasper', 'kluane', 'kootenay', 'nahanni', 'waterton-lakes', 'wood-buffalo', 'yoho']);
  });

  it('says what each kind is, what the percentages mean, and where the lists come from', () => {
    for (const kind of layer.kinds) expect(kind.rule.length, kind.id).toBeGreaterThan(20);
    expect(layer.kinds.find((k) => k.id === 'sight')!.rule).toContain('Not an official list');
    expect(layer.countingNote).toContain('not a share of land area');
    for (const source of layer.sources) expect(source.url).toMatch(/^https:\/\//);
  });
});

describe('what the pages say about the list', () => {
  it('quotes the same totals as the data', () => {
    const about = MAP_PAGES.canada.about.body.join(' ');
    const answers = MAP_PAGES.canada.faq.map((f) => f.a).join(' ');
    const ontario = placesIn(layer, 'CA-ON').length;
    expect(about).toContain(`<strong>${layer.places.length} places</strong>`);
    expect(about).toContain(`1 of Ontario’s ${ontario} places, which is ${summarizePlaces(layer, new Set(['toronto'])).byFeature['CA-ON'].percentLabel}`);
    expect(answers).toContain(`“0 of ${ontario} places”`);
    expect(answers).toContain(`out of all ${layer.places.length}`);
    expect(MAP_PAGES['canada-cities'].about.body.join(' ')).toContain(`the same ${ofKind('city').length} cities`);
  });
});

describe('how much of a province, and of Canada', () => {
  const all = new Set(layer.places.map((p) => p.id));

  it('starts at nothing', () => {
    const s = summarizePlaces(layer, new Set());
    expect(s.visited).toBe(0);
    expect(s.total).toBe(178);
    expect(s.percentLabel).toBe('0%');
    expect(Object.keys(s.byFeature).sort()).toEqual(CANADA_REGIONS.map((r) => r.id).sort());
    expect(s.byFeature['CA-ON']).toEqual({ visited: 0, total: 31, percent: 0, percentLabel: '0%' });
  });

  it('counts someone who has only been to Toronto as a small share of Ontario and a smaller one of Canada', () => {
    const s = summarizePlaces(layer, new Set(['toronto']));
    expect(s.byFeature['CA-ON'].visited).toBe(1);
    expect(s.byFeature['CA-ON'].percentLabel).toBe('3%');
    expect(s.byFeature['CA-QC'].percentLabel).toBe('0%');
    expect(s.visited).toBe(1);
    expect(s.percentLabel).toBe('<1%');
  });

  it('adds every province together for the Canada figure, each place weighing the same', () => {
    const marks = new Set(['toronto', 'niagara-falls', 'cn-tower', 'montreal', 'old-quebec', 'banff', 'lake-louise', 'vancouver', 'stanley-park']);
    const s = summarizePlaces(layer, marks);
    expect(s.visited).toBe(9);
    expect(s.percentLabel).toBe('5%');
    expect(Object.values(s.byFeature).reduce((sum, row) => sum + row.visited, 0)).toBe(9);
    expect(Object.values(s.byFeature).reduce((sum, row) => sum + row.total, 0)).toBe(178);
    expect(s.byFeature['CA-AB']).toMatchObject({ visited: 2, total: 17, percentLabel: '12%' });
  });

  it('reaches 100% for a province only when every listed place in it is ticked', () => {
    const pei = placesIn(layer, 'CA-PE').map((p) => p.id);
    expect(summarizePlaces(layer, new Set(pei)).byFeature['CA-PE'].percentLabel).toBe('100%');
    expect(summarizePlaces(layer, new Set(pei.slice(1))).byFeature['CA-PE'].percentLabel).not.toBe('100%');
    const ontario = placesIn(layer, 'CA-ON').map((p) => p.id);
    expect(summarizePlaces(layer, new Set(ontario.slice(1))).byFeature['CA-ON'].percentLabel).toBe('97%');
    expect(summarizePlaces(layer, all).percentLabel).toBe('100%');
    const allButOne = new Set(all);
    allButOne.delete('iqaluit');
    expect(summarizePlaces(layer, allButOne).percentLabel).toBe('99%');
  });

  it('ignores ids that are not on the list', () => {
    expect(summarizePlaces(layer, new Set(['atlantis', 'CA-ON'])).visited).toBe(0);
  });

  it('knows which provinces the ticked places are in', () => {
    expect([...featuresWithMarks(layer, new Set(['toronto', 'banff', 'lake-louise']))].sort()).toEqual(['CA-AB', 'CA-ON']);
    expect(featuresWithMarks(layer, new Set()).size).toBe(0);
  });
});

describe('saving ticked places on this device', () => {
  let storage: ReturnType<typeof installStorage>;
  beforeEach(() => {
    storage = installStorage();
  });
  afterEach(() => storage.remove());

  it('reads back what it saved', () => {
    const marks = new Set(['toronto', 'niagara-falls', 'banff']);
    expect(savePlaceMarks(layer, marks)).toBe(true);
    expect([...loadPlaceMarks(layer)].sort()).toEqual([...marks].sort());
  });

  it('keeps a city in one place: ticked here, it is marked on the cities map, and the other way round', () => {
    savePlaceMarks(layer, new Set(['toronto', 'cn-tower']));
    expect([...loadSelection(MAPS['canada-cities']).visited]).toEqual(['toronto']);
    expect(JSON.parse(storage.local.getItem('wtm:v1:places:canada')!).visited).toEqual(['cn-tower']);

    saveSelection(MAPS['canada-cities'], normalizeSelection(MAPS['canada-cities'], ['toronto', 'halifax'], []));
    expect([...loadPlaceMarks(layer)].sort()).toEqual(['cn-tower', 'halifax', 'toronto']);
  });

  it('unticking a city here unmarks it on the cities map, and leaves the others alone', () => {
    saveSelection(MAPS['canada-cities'], normalizeSelection(MAPS['canada-cities'], ['toronto', 'halifax'], ['calgary']));
    savePlaceMarks(layer, new Set(['halifax']));
    const cities = loadSelection(MAPS['canada-cities']);
    expect([...cities.visited]).toEqual(['halifax']);
    expect([...cities.wishlist]).toEqual(['calgary']);
  });

  it('takes a city off the bucket list when it is ticked as visited', () => {
    saveSelection(MAPS['canada-cities'], normalizeSelection(MAPS['canada-cities'], [], ['calgary']));
    savePlaceMarks(layer, new Set(['calgary']));
    const cities = loadSelection(MAPS['canada-cities']);
    expect([...cities.visited]).toEqual(['calgary']);
    expect(cities.wishlist.size).toBe(0);
  });

  it('never touches the province marks: places and provinces are separate records', () => {
    savePlaceMarks(layer, new Set(['toronto', 'banff']));
    expect(loadSelection(MAPS.canada).visited.size).toBe(0);
  });

  it('clears everything when asked to save nothing', () => {
    savePlaceMarks(layer, new Set(['toronto', 'banff']));
    savePlaceMarks(layer, new Set());
    expect(loadPlaceMarks(layer).size).toBe(0);
    expect(storage.local.getItem('wtm:v1:places:canada')).toBeNull();
  });

  it('ignores damaged saved data', () => {
    storage.local.setItem('wtm:v1:places:canada', '{"visited":"banff"}');
    expect(loadPlaceMarks(layer).size).toBe(0);
    storage.local.setItem('wtm:v1:places:canada', '{"visited":["banff",7,null,"atlantis"]}');
    expect([...loadPlaceMarks(layer)]).toEqual(['banff']);
    storage.local.setItem('wtm:v1:places:canada', 'not json');
    expect(loadPlaceMarks(layer).size).toBe(0);
  });

  it('reports when the browser will not store anything', () => {
    storage.local.failWrites = true;
    expect(savePlaceMarks(layer, new Set(['banff']))).toBe(false);
    expect(savePlaceMarks(layer, new Set(['toronto']))).toBe(false);
  });

  it('names the storage keys it depends on, so other tabs can be heard', () => {
    expect(storageKeys(layer).sort()).toEqual(['wtm:v1:map:canada-cities', 'wtm:v1:places:canada']);
  });

  it('lets ticked places suggest their province, without marking it', () => {
    const empty = emptySelection();
    const fromPlaces = suggestRollup(MAPS.canada, empty, featuresWithMarks(layer, new Set(['banff'])))!;
    expect(fromPlaces.ids).toEqual(['CA-AB']);
    expect(fromPlaces.sources).toEqual([]);
    expect(suggestRollup(MAPS.canada, normalizeSelection(MAPS.canada, ['CA-AB'], []), ['CA-AB'])).toBeNull();
    expect(loadSelection(MAPS.canada).visited.size).toBe(0);
  });
});
