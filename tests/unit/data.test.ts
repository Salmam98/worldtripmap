import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/data/catalog';
import { CANADA_GROUPS, CANADA_POPULATION_2021, CANADA_REGIONS, CANADA_TOTAL_AREA_KM2 } from '../../src/data/definitions/canada';
import { CANADA_CITIES } from '../../src/data/definitions/canada-cities';
import { WORLD_UNITS } from '../../src/data/definitions/world';
import { MAPS, MAP_IDS } from '../../src/lib/maps/registry';
import { parsePath } from '../../src/lib/poster/scene';
import { lodsOf, mapData } from '../helpers/geo';

const frozen = JSON.parse(readFileSync(new URL('../fixtures/share-order.v1.json', import.meta.url), 'utf8')) as Record<string, string[]>;

const tally = <T>(items: T[], key: (item: T) => string): Record<string, number> =>
  items.reduce<Record<string, number>>((acc, item) => {
    acc[key(item)] = (acc[key(item)] ?? 0) + 1;
    return acc;
  }, {});

describe('world: what is counted', () => {
  const members = WORLD_UNITS.filter((u) => u.status === 'un-member');
  const observers = WORLD_UNITS.filter((u) => u.status === 'un-observer');
  const territories = WORLD_UNITS.filter((u) => u.status === 'territory');

  it('counts 193 UN members plus the two observer states, 195 in all', () => {
    expect(members).toHaveLength(193);
    expect(observers.map((u) => u.id).sort()).toEqual(['PSE', 'VAT']);
    expect(MAPS.world.features.filter((f) => f.countable)).toHaveLength(195);
  });

  it('offers 42 territories that are never part of the 195', () => {
    expect(territories).toHaveLength(42);
    expect(MAPS.world.features.filter((f) => !f.countable).map((f) => f.id).sort()).toEqual(territories.map((u) => u.id).sort());
  });

  it('matches the continent totals published on the site', () => {
    expect(tally([...members, ...observers], (u) => u.group)).toEqual({
      africa: 54,
      asia: 48,
      europe: 44,
      'north-america': 23,
      'south-america': 12,
      oceania: 14,
    });
    expect(tally(territories, (u) => u.group)).toEqual({
      africa: 4,
      asia: 3,
      europe: 6,
      'north-america': 15,
      'south-america': 2,
      oceania: 11,
      antarctica: 1,
    });
  });

  it('has unique ids, codes and names', () => {
    for (const key of ['id', 'iso2', 'name'] as const) {
      const values = WORLD_UNITS.map((u) => u[key]);
      expect(new Set(values).size, key).toBe(values.length);
    }
    for (const u of WORLD_UNITS) {
      expect(u.id).toMatch(/^[A-Z]{3}$/);
      expect(u.iso2).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('names an existing counted country as the sovereign of each territory that has one', () => {
    const counted = new Set([...members, ...observers].map((u) => u.id));
    for (const t of territories) if (t.sovereign) expect(counted.has(t.sovereign), `${t.id} -> ${t.sovereign}`).toBe(true);
  });

  it('never merges the same source feature into two units', () => {
    const sources = WORLD_UNITS.flatMap((u) => u.ne);
    expect(new Set(sources).size).toBe(sources.length);
  });
});

describe('canada: provinces and territories', () => {
  it('has 10 provinces and 3 territories', () => {
    expect(CANADA_REGIONS).toHaveLength(13);
    expect(tally(CANADA_REGIONS, (r) => r.type)).toEqual({ province: 10, territory: 3 });
    expect(MAPS.canada.features.every((f) => f.countable)).toBe(true);
  });

  it('groups them into the five Discover Canada regions', () => {
    expect(CANADA_GROUPS.map((g) => g.id)).toEqual(['atlantic', 'central', 'prairies', 'west-coast', 'north']);
    expect(tally(CANADA_REGIONS, (r) => r.group)).toEqual({ atlantic: 4, central: 2, prairies: 3, 'west-coast': 1, north: 3 });
    expect(CANADA_REGIONS.filter((r) => r.group === 'north').every((r) => r.type === 'territory')).toBe(true);
  });

  it('adds up to the national area and the 2021 Census population', () => {
    expect(CANADA_REGIONS.reduce((sum, r) => sum + r.areaKm2, 0)).toBe(CANADA_TOTAL_AREA_KM2);
    expect(CANADA_REGIONS.reduce((sum, r) => sum + r.population2021, 0)).toBe(CANADA_POPULATION_2021);
  });

  it('uses ISO 3166-2 ids, unique postal codes and real dates', () => {
    expect(new Set(CANADA_REGIONS.map((r) => r.postal)).size).toBe(13);
    for (const r of CANADA_REGIONS) {
      expect(r.id).toBe(`CA-${r.postal}`);
      expect(Number.isNaN(Date.parse(r.joined)), r.id).toBe(false);
      expect(r.capital.length).toBeGreaterThan(2);
    }
  });
});

describe('canada: major cities', () => {
  const regions = new Map(CANADA_REGIONS.map((r) => [r.id, r]));

  it('has the 41 census metropolitan areas plus four capitals, 45 in all', () => {
    expect(CANADA_CITIES).toHaveLength(45);
    expect(CANADA_CITIES.filter((c) => c.cma)).toHaveLength(41);
    expect(CANADA_CITIES.filter((c) => !c.cma).map((c) => c.id).sort()).toEqual(['charlottetown', 'iqaluit', 'whitehorse', 'yellowknife']);
  });

  it('includes Ottawa and the capital of every province and territory', () => {
    expect(tally(CANADA_CITIES.filter((c) => c.capital), (c) => c.capital!)).toEqual({ national: 1, provincial: 10, territorial: 3 });
    for (const region of CANADA_REGIONS) {
      const capital = CANADA_CITIES.find((c) => c.province === region.id && (c.capital === 'provincial' || c.capital === 'territorial'));
      expect(capital, `capital of ${region.name}`).toBeDefined();
      expect(capital!.name).toBe(region.capital);
      expect(capital!.capital).toBe(region.type === 'territory' ? 'territorial' : 'provincial');
    }
  });

  it('places every city in a real province or territory, and every one of those has a city', () => {
    for (const c of CANADA_CITIES) expect(regions.has(c.province), c.id).toBe(true);
    expect(new Set(CANADA_CITIES.map((c) => c.province)).size).toBe(13);
    for (const f of MAPS['canada-cities'].features) {
      expect(f.parent).toEqual({ map: 'canada', id: CANADA_CITIES.find((c) => c.id === f.id)!.province });
      expect(f.group).toBe(regions.get(f.parent!.id)!.group);
    }
  });

  it('uses unique, URL-safe ids', () => {
    expect(new Set(CANADA_CITIES.map((c) => c.id)).size).toBe(45);
    for (const c of CANADA_CITIES) expect(c.id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
  });
});

describe.each(MAP_IDS)('%s: definition', (id) => {
  const def = MAPS[id];

  it('says how many places it counts, and the number is right', () => {
    const countable = def.features.filter((f) => f.countable).length;
    expect(def.scope).toContain(String(countable));
    expect(def.countingNote).toContain(String(countable));
  });

  it('puts every feature in a group that exists', () => {
    const groups = new Set(def.groups.map((g) => g.id));
    for (const f of def.features) expect(groups.has(f.group), f.id).toBe(true);
  });

  it('lists each feature exactly once in the share order', () => {
    expect([...def.shareOrder].sort()).toEqual(def.features.map((f) => f.id).sort());
  });

  it('keeps the share order frozen: ids may be appended, never moved or removed', () => {
    // Links people have already shared are decoded with this order. If this fails, restore the
    // order in the definition; only add new ids at the end, then extend the fixture to match.
    expect(def.shareOrder.slice(0, frozen[id].length)).toEqual(frozen[id]);
  });

  it('offers the poster title it starts with', () => {
    expect(def.posterTitles).toContain(def.defaultPosterTitle);
    for (const title of def.posterTitles) expect([...title].length).toBeLessThanOrEqual(48);
  });

  it('names a licence or reference for every source', () => {
    expect(def.sources.length).toBeGreaterThan(0);
    for (const s of def.sources) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.licence.length).toBeGreaterThan(3);
    }
  });
});

describe.each(MAP_IDS)('%s: geometry', (id) => {
  const def = MAPS[id];

  it('has metadata for exactly the features in the definition', () => {
    const { meta } = mapData(id);
    expect(Object.keys(meta.features).sort()).toEqual(def.features.map((f) => f.id).sort());
    expect(meta.id).toBe(id);
  });

  it('keeps every label point inside its feature box and inside the map', () => {
    const { meta } = mapData(id);
    for (const [fid, geo] of Object.entries(meta.features)) {
      const [x0, y0, x1, y1] = geo.bbox;
      const [lx, ly] = geo.label;
      expect(lx >= x0 - 1 && lx <= x1 + 1 && ly >= y0 - 1 && ly <= y1 + 1, `${fid} label in bbox`).toBe(true);
      expect(x0 >= 0 && y0 >= 0 && x1 <= meta.width && y1 <= meta.height, `${fid} inside map`).toBe(true);
      expect(Number.isFinite(geo.size) && geo.size >= 0, `${fid} size`).toBe(true);
    }
  });

  it.each(lodsOf(id))('draws every feature at the %s level of detail, with valid path data', (lod) => {
    const { geometry, meta } = mapData(id, lod);
    expect(geometry.width).toBe(meta.width);
    expect(geometry.height).toBe(meta.height);
    const ids = def.features.map((f) => f.id).sort();
    const drawn = geometry.points ? Object.keys(geometry.points) : Object.keys(geometry.shapes);
    expect(drawn.sort()).toEqual(ids);

    const check = (name: string, d: string) => {
      expect(d, name).toMatch(/^[MmLlHhVvZz0-9 .,-]+$/);
      const segments = parsePath(d);
      expect(segments.length, name).toBeGreaterThan(2);
      expect(segments[0].op, name).toBe('M');
      for (const s of segments) {
        if (s.op === 'Z') continue;
        const ok = Number.isFinite(s.x) && Number.isFinite(s.y) && s.x >= -2 && s.y >= -2 && s.x <= meta.width + 2 && s.y <= meta.height + 2;
        if (!ok) throw new Error(`${name}: point ${s.x}, ${s.y} is outside the ${meta.width} × ${meta.height} map`);
      }
    };
    for (const [fid, d] of Object.entries(geometry.shapes)) check(fid, d);
    for (const [fid, d] of Object.entries(geometry.baseShapes ?? {})) check(`base ${fid}`, d);
    for (const [fid, [x, y]] of Object.entries(geometry.points ?? {})) {
      expect(x > 0 && y > 0 && x < meta.width && y < meta.height, `${fid} point`).toBe(true);
    }
  });
});

describe('catalog: what the site offers', () => {
  it('links only to maps that exist, and marks the rest as planned', () => {
    const live = CATALOG.filter((entry) => entry.map);
    expect(live.map((entry) => entry.map).sort()).toEqual([...MAP_IDS].sort());
    for (const entry of live) expect(entry.level).toBe(MAPS[entry.map!].level);
    expect(CATALOG.filter((entry) => !entry.map).map((entry) => entry.title)).toEqual(['United States', 'Bangladesh', 'World cities', 'City neighbourhoods']);
  });

  it('quotes the same totals as the data', () => {
    const detail = (map: string) => CATALOG.find((entry) => entry.map === map)!.detail;
    expect(detail('world')).toContain('195 countries');
    expect(detail('world')).toContain('42 territories');
    expect(detail('canada')).toBe('10 provinces and 3 territories');
    expect(detail('canada-cities')).toContain('45 major cities');
  });
});
