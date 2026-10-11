import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAPS } from '../../src/lib/maps/registry';
import { suggestRollup } from '../../src/lib/maps/rollup';
import {
  emptySelection,
  loadDisplayName,
  loadSelection,
  normalizeSelection,
  sameSelection,
  saveDisplayName,
  saveSelection,
} from '../../src/lib/maps/store';
import { installStorage } from '../helpers/storage';

let storage: ReturnType<typeof installStorage>;
beforeEach(() => {
  storage = installStorage();
});
afterEach(() => storage.remove());

describe('cleaning a selection', () => {
  it('keeps only places that exist on the map', () => {
    const s = normalizeSelection(MAPS.canada, ['CA-ON', 'CA-XX', 'FRA', '', 'toronto'], ['CA-YT', 'nope']);
    expect([...s.visited]).toEqual(['CA-ON']);
    expect([...s.wishlist]).toEqual(['CA-YT']);
  });

  it('removes duplicates and lets "explored" win over "want to go"', () => {
    const s = normalizeSelection(MAPS.canada, ['CA-ON', 'CA-ON'], ['CA-ON', 'CA-BC', 'CA-BC']);
    expect([...s.visited]).toEqual(['CA-ON']);
    expect([...s.wishlist]).toEqual(['CA-BC']);
  });

  it('survives values that are not strings or not lists', () => {
    const odd = [1, null, { id: 'CA-ON' }, ['CA-ON'], 'CA-QC'] as unknown as string[];
    expect([...normalizeSelection(MAPS.canada, odd, undefined).visited]).toEqual(['CA-QC']);
    expect(normalizeSelection(MAPS.canada, undefined, undefined)).toEqual(emptySelection());
  });
});

describe('saving a map on this device', () => {
  it('reads back what it saved, per map', () => {
    const mine = normalizeSelection(MAPS.canada, ['CA-ON', 'CA-NS'], ['CA-NU']);
    expect(saveSelection(MAPS.canada, mine)).toBe(true);
    expect(sameSelection(loadSelection(MAPS.canada), mine)).toBe(true);
    expect(loadSelection(MAPS.world).visited.size).toBe(0);
    expect(storage.local.getItem('wtm:v1:map:canada')).toContain('CA-NS');
  });

  it('reports failure instead of pretending, when the browser refuses to store', () => {
    storage.local.failWrites = true;
    expect(saveSelection(MAPS.canada, normalizeSelection(MAPS.canada, ['CA-ON'], []))).toBe(false);
    expect(saveDisplayName('Amina')).toBe(false);
    expect(loadSelection(MAPS.canada).visited.size).toBe(0);
  });

  it('ignores stored data that is corrupt or was edited by hand', () => {
    storage.local.setItem('wtm:v1:map:canada', '{not json');
    expect(loadSelection(MAPS.canada)).toEqual(emptySelection());
    storage.local.setItem('wtm:v1:map:canada', JSON.stringify({ visited: 'CA-ON', wishlist: 7 }));
    expect(() => loadSelection(MAPS.canada)).not.toThrow();
    storage.local.setItem('wtm:v1:map:canada', JSON.stringify({ visited: ['CA-ON', 'ZZ', 5], wishlist: ['CA-ON'] }));
    const loaded = loadSelection(MAPS.canada);
    expect([...loaded.visited]).toEqual(['CA-ON']);
    expect(loaded.wishlist.size).toBe(0);
  });

  it('works, without saving, when there is no storage at all', () => {
    storage.remove();
    expect(loadSelection(MAPS.canada)).toEqual(emptySelection());
    expect(saveSelection(MAPS.canada, emptySelection())).toBe(false);
    expect(loadDisplayName()).toBe('');
    storage = installStorage();
  });

  it('remembers the display name', () => {
    expect(saveDisplayName('Zoë')).toBe(true);
    expect(loadDisplayName()).toBe('Zoë');
  });
});

describe('suggestions between maps', () => {
  const empty = emptySelection();

  it('suggests nothing when the other maps are empty', () => {
    expect(suggestRollup(MAPS.canada, empty)).toBeNull();
    expect(suggestRollup(MAPS.world, empty)).toBeNull();
  });

  it('suggests the province of a marked city, without changing anything', () => {
    saveSelection(MAPS['canada-cities'], normalizeSelection(MAPS['canada-cities'], ['calgary', 'edmonton', 'halifax'], []));
    const suggestion = suggestRollup(MAPS.canada, empty)!;
    expect(suggestion.ids.sort()).toEqual(['CA-AB', 'CA-NS']);
    expect(suggestion.names.sort()).toEqual(['Alberta', 'Nova Scotia']);
    expect(suggestion.sources).toEqual(['Canada: major cities']);
    expect(loadSelection(MAPS.canada).visited.size).toBe(0);
  });

  it('suggests Canada on the world map when a province or a city is marked', () => {
    saveSelection(MAPS.canada, normalizeSelection(MAPS.canada, ['CA-QC'], []));
    expect(suggestRollup(MAPS.world, empty)!.ids).toEqual(['CAN']);
  });

  it('stops suggesting places that are already marked', () => {
    saveSelection(MAPS['canada-cities'], normalizeSelection(MAPS['canada-cities'], ['calgary'], []));
    expect(suggestRollup(MAPS.canada, normalizeSelection(MAPS.canada, ['CA-AB'], []))).toBeNull();
  });

  it('never works downward: a province does not imply its cities, nor a country its provinces', () => {
    saveSelection(MAPS.canada, normalizeSelection(MAPS.canada, ['CA-AB'], []));
    saveSelection(MAPS.world, normalizeSelection(MAPS.world, ['CAN'], []));
    expect(suggestRollup(MAPS['canada-cities'], empty)).toBeNull();
    storage.local.removeItem('wtm:v1:map:canada');
    expect(suggestRollup(MAPS.canada, empty)).toBeNull();
  });

  it('does not treat a bucket-list city as a visit', () => {
    saveSelection(MAPS['canada-cities'], normalizeSelection(MAPS['canada-cities'], [], ['vancouver']));
    expect(suggestRollup(MAPS.canada, empty)).toBeNull();
  });
});
