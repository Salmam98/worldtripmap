import { describe, expect, it } from 'vitest';
import { CANADA_REGIONS } from '../../src/data/definitions/canada';
import { CANADA_CITIES } from '../../src/data/definitions/canada-cities';
import { computeAchievements } from '../../src/lib/maps/achievements';
import { MAPS } from '../../src/lib/maps/registry';
import { normalizeSelection } from '../../src/lib/maps/store';

type MapKey = keyof typeof MAPS;
const earned = (map: MapKey, visited: string[]) =>
  computeAchievements(MAPS[map], normalizeSelection(MAPS[map], visited, []))
    .filter((a) => a.earned)
    .map((a) => a.id);
const get = (map: MapKey, visited: string[], id: string) =>
  computeAchievements(MAPS[map], normalizeSelection(MAPS[map], visited, [])).find((a) => a.id === id)!;

describe('canada achievements', () => {
  const provinces = CANADA_REGIONS.filter((r) => r.type === 'province').map((r) => r.id);
  const territories = CANADA_REGIONS.filter((r) => r.type === 'territory').map((r) => r.id);

  it('offers the four named in the brief plus three Canadian ones', () => {
    expect(computeAchievements(MAPS.canada, normalizeSelection(MAPS.canada, [], [])).map((a) => a.name)).toEqual([
      'First Adventure',
      'Coast to Coast to Coast',
      'Regional Explorer',
      'Halfway There',
      'North of Sixty',
      'Every Province',
      'Complete Explorer',
    ]);
  });

  it('awards nothing for an empty map', () => {
    expect(earned('canada', [])).toEqual([]);
  });

  it('awards First Adventure for the first place, and only that', () => {
    expect(earned('canada', ['CA-MB'])).toEqual(['first-adventure']);
  });

  it('awards Regional Explorer only when all five regions are touched', () => {
    const four = ['CA-NS', 'CA-ON', 'CA-AB', 'CA-BC'];
    expect(get('canada', four, 'regional-explorer')).toMatchObject({ have: 4, need: 5, earned: false });
    expect(get('canada', [...four, 'CA-YT'], 'regional-explorer').earned).toBe(true);
  });

  it('awards Halfway There at 7 of 13, not at 6', () => {
    expect(get('canada', provinces.slice(0, 6), 'halfway-there')).toMatchObject({ have: 6, need: 7, earned: false });
    expect(get('canada', provinces.slice(0, 7), 'halfway-there').earned).toBe(true);
  });

  it('awards Coast to Coast to Coast for the Pacific, the Atlantic and the Arctic', () => {
    expect(get('canada', ['CA-BC', 'CA-NS'], 'coast-to-coast-to-coast')).toMatchObject({ have: 2, need: 3, earned: false });
    expect(get('canada', ['CA-BC', 'CA-NL', 'CA-NU'], 'coast-to-coast-to-coast').earned).toBe(true);
    expect(get('canada', ['CA-AB', 'CA-NL', 'CA-NU'], 'coast-to-coast-to-coast').earned).toBe(false);
  });

  it('awards North of Sixty and Every Province independently', () => {
    expect(earned('canada', territories)).toContain('north-of-sixty');
    expect(earned('canada', territories)).not.toContain('every-province');
    expect(earned('canada', provinces)).toContain('every-province');
    expect(earned('canada', provinces)).not.toContain('complete-explorer');
  });

  it('awards Complete Explorer, and with it everything else, for all thirteen', () => {
    const all = CANADA_REGIONS.map((r) => r.id);
    expect(get('canada', all.slice(0, 12), 'complete-explorer')).toMatchObject({ have: 12, need: 13, earned: false });
    expect(earned('canada', all)).toHaveLength(7);
  });

  it('states each rule in words that match its numbers', () => {
    expect(get('canada', [], 'halfway-there').rule).toBe('Mark at least half: 7 of 13 provinces and territories.');
    expect(get('canada', [], 'complete-explorer').rule).toBe('Mark all 13 provinces and territories.');
  });
});

describe('world achievements', () => {
  const countries = MAPS.world.features.filter((f) => f.countable).map((f) => f.id);
  const territories = MAPS.world.features.filter((f) => !f.countable).map((f) => f.id);

  it('needs 98 of 195 for Halfway There', () => {
    expect(get('world', countries.slice(0, 97), 'halfway-there').earned).toBe(false);
    expect(get('world', countries.slice(0, 98), 'halfway-there')).toMatchObject({ have: 98, need: 98, earned: true });
  });

  it('needs ten counted countries for Double Digits, and territories do not help', () => {
    expect(get('world', [...countries.slice(0, 9), ...territories], 'ten-countries')).toMatchObject({ have: 9, need: 10, earned: false });
    expect(get('world', countries.slice(0, 10), 'ten-countries').earned).toBe(true);
  });

  it('needs every inhabited continent for Regional Explorer, and Antarctica is not one of them', () => {
    const five = ['CAN', 'BRA', 'FRA', 'KEN', 'JPN'];
    expect(get('world', [...five, 'ATA'], 'regional-explorer')).toMatchObject({ have: 5, need: 6, earned: false });
    expect(get('world', [...five, 'NZL'], 'regional-explorer').earned).toBe(true);
  });

  it('gives no award for territories alone', () => {
    expect(earned('world', territories)).toEqual([]);
  });

  it('completes with the 195, without needing any territory', () => {
    expect(earned('world', countries)).toContain('complete-explorer');
  });
});

describe('city achievements', () => {
  const capitals = CANADA_CITIES.filter((c) => c.capital).map((c) => c.id);

  it('needs Ottawa and all thirteen capitals for Capital Collector', () => {
    expect(capitals).toHaveLength(14);
    expect(get('canada-cities', capitals.slice(1), 'capital-collector')).toMatchObject({ have: 13, need: 14, earned: false });
    expect(get('canada-cities', capitals, 'capital-collector').earned).toBe(true);
  });

  it('needs 23 of 45 for Halfway There', () => {
    const ids = CANADA_CITIES.map((c) => c.id);
    expect(get('canada-cities', ids.slice(0, 22), 'halfway-there').earned).toBe(false);
    expect(get('canada-cities', ids.slice(0, 23), 'halfway-there').earned).toBe(true);
  });

  it('needs a city in each of the five regions for Regional Explorer', () => {
    expect(get('canada-cities', ['halifax', 'toronto', 'calgary', 'vancouver'], 'regional-explorer').earned).toBe(false);
    expect(get('canada-cities', ['halifax', 'toronto', 'calgary', 'vancouver', 'iqaluit'], 'regional-explorer').earned).toBe(true);
  });
});
