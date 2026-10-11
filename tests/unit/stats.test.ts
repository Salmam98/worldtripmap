import { describe, expect, it } from 'vitest';
import { CANADA_REGIONS } from '../../src/data/definitions/canada';
import { MAPS } from '../../src/lib/maps/registry';
import { canadaAreaShare, computeStats, formatCount, percentLabel } from '../../src/lib/maps/stats';
import { normalizeSelection } from '../../src/lib/maps/store';

const select = (map: keyof typeof MAPS, visited: string[], wishlist: string[] = []) => normalizeSelection(MAPS[map], visited, wishlist);

describe('percentage labels', () => {
  it('shows whole numbers', () => {
    expect(percentLabel(4, 13)).toBe('31%');
    expect(percentLabel(1, 13)).toBe('8%');
    expect(percentLabel(98, 195)).toBe('50%');
  });

  it('never rounds a start down to nothing', () => {
    expect(percentLabel(0, 195)).toBe('0%');
    expect(percentLabel(1, 195)).toBe('<1%');
    expect(percentLabel(2, 195)).toBe('1%');
  });

  it('never shows 100% until every place is marked', () => {
    expect(percentLabel(194, 195)).toBe('99%');
    expect(percentLabel(44, 45)).toBe('98%');
    expect(percentLabel(195, 195)).toBe('100%');
  });

  it('copes with empty and impossible inputs', () => {
    expect(percentLabel(0, 0)).toBe('0%');
    expect(percentLabel(-3, 13)).toBe('0%');
    expect(percentLabel(20, 13)).toBe('100%');
  });
});

describe('canada progress', () => {
  it('reports "4 of 13" and the matching share', () => {
    const stats = computeStats(MAPS.canada, select('canada', ['CA-ON', 'CA-QC', 'CA-BC', 'CA-NS']));
    expect(stats.visited).toBe(4);
    expect(stats.total).toBe(13);
    expect(stats.percent).toBeCloseTo((4 / 13) * 100, 10);
    expect(stats.percentLabel).toBe('31%');
    expect(stats.complete).toBe(false);
  });

  it('cannot count a region twice, however it is marked', () => {
    const stats = computeStats(MAPS.canada, select('canada', ['CA-ON', 'CA-ON', 'CA-ON'], ['CA-ON']));
    expect(stats.visited).toBe(1);
    expect(stats.wishlist).toBe(0);
  });

  it('breaks progress down by region', () => {
    const stats = computeStats(MAPS.canada, select('canada', ['CA-NS', 'CA-PE', 'CA-YT']));
    expect(Object.fromEntries(stats.groups.map((g) => [g.id, `${g.visited}/${g.total}`]))).toEqual({
      atlantic: '2/4',
      central: '0/2',
      prairies: '0/3',
      'west-coast': '0/1',
      north: '1/3',
    });
    expect(stats.groupsTouched).toBe(2);
    expect(stats.groupsTotal).toBe(5);
  });

  it('is complete only with all thirteen', () => {
    const all = CANADA_REGIONS.map((r) => r.id);
    expect(computeStats(MAPS.canada, select('canada', all.slice(1))).complete).toBe(false);
    const stats = computeStats(MAPS.canada, select('canada', all));
    expect(stats.complete).toBe(true);
    expect(stats.percentLabel).toBe('100%');
  });

  it('keeps bucket-list places out of the explored count', () => {
    const stats = computeStats(MAPS.canada, select('canada', ['CA-AB'], ['CA-NU', 'CA-NT']));
    expect(stats.visited).toBe(1);
    expect(stats.wishlist).toBe(2);
  });
});

describe('province coverage is not land area', () => {
  it('measures the three territories as 3 of 13 places but about 39% of the area', () => {
    const selection = select('canada', ['CA-YT', 'CA-NT', 'CA-NU']);
    expect(computeStats(MAPS.canada, selection).percentLabel).toBe('23%');
    const area = canadaAreaShare(selection);
    expect(area.km2).toBe(482_443 + 1_346_106 + 2_093_190);
    expect(area.label).toBe('39%');
  });

  it('measures Prince Edward Island as 1 of 13 places and under 1% of the area', () => {
    const selection = select('canada', ['CA-PE']);
    expect(computeStats(MAPS.canada, selection).percentLabel).toBe('8%');
    expect(canadaAreaShare(selection).label).toBe('<1%');
  });

  it('reaches 100% of the area only with every province and territory', () => {
    expect(canadaAreaShare(select('canada', CANADA_REGIONS.map((r) => r.id))).label).toBe('100%');
    expect(canadaAreaShare(select('canada', [])).km2).toBe(0);
  });
});

describe('world progress', () => {
  it('counts territories separately from the 195', () => {
    const stats = computeStats(MAPS.world, select('world', ['CAN', 'FRA', 'GRL', 'HKG', 'PRI']));
    expect(stats.total).toBe(195);
    expect(stats.visited).toBe(2);
    expect(stats.otherVisited).toBe(3);
    expect(stats.otherTotal).toBe(42);
    expect(stats.percentLabel).toBe('1%');
  });

  it('is not complete with territories alone, and does not need them to be complete', () => {
    const countries = MAPS.world.features.filter((f) => f.countable).map((f) => f.id);
    const territories = MAPS.world.features.filter((f) => !f.countable).map((f) => f.id);
    expect(computeStats(MAPS.world, select('world', territories)).visited).toBe(0);
    const stats = computeStats(MAPS.world, select('world', countries));
    expect(stats.complete).toBe(true);
    expect(stats.otherVisited).toBe(0);
  });

  it('reports six inhabited continents, leaving Antarctica out of the tally', () => {
    const stats = computeStats(MAPS.world, select('world', ['CAN', 'BRA', 'FRA', 'KEN', 'JPN', 'AUS', 'ATA']));
    expect(stats.groupsTotal).toBe(6);
    expect(stats.groupsTouched).toBe(6);
    expect(stats.groups.map((g) => g.id)).not.toContain('antarctica');
  });
});

describe('city progress', () => {
  it('counts cities out of 45', () => {
    const stats = computeStats(MAPS['canada-cities'], select('canada-cities', ['toronto', 'montreal', 'vancouver']));
    expect(stats.visited).toBe(3);
    expect(stats.total).toBe(45);
    expect(stats.percentLabel).toBe('7%');
  });
});

describe('counts in words and on posters', () => {
  it('groups digits exactly as English-language Canadian text does', () => {
    // The site formats these by hand (see formatCount); this holds it to the standard formatter.
    for (const n of [0, 1, 7, 13, 45, 195, 237, 999, 1000, 1080, 1350, 2160, 2700, 3600, 12345, 99999, 100000, 9985000, 9984670, 38929902]) {
      expect(formatCount(n), String(n)).toBe(n.toLocaleString('en-CA'));
    }
  });

  it('writes whole numbers only', () => {
    expect(formatCount(1234.4)).toBe('1,234');
    expect(formatCount(1234.5)).toBe('1,235');
    expect(formatCount(-4200)).toBe('-4,200');
  });
});
