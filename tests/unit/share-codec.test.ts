import { describe, expect, it } from 'vitest';
import { MAPS, MAP_IDS } from '../../src/lib/maps/registry';
import { buildHash, MAX_NAME_LENGTH, packIds, parseHash, sanitizeName, unpackIds } from '../../src/lib/maps/share-codec';

/** A small deterministic random source, so failures can be reproduced. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe.each(MAP_IDS)('%s: packing places into a link', (id) => {
  const def = MAPS[id];
  const all = def.features.map((f) => f.id);

  it('returns exactly the places that went in, for many random selections', () => {
    const random = rng(42);
    for (let round = 0; round < 200; round++) {
      const p = random();
      const picked = all.filter(() => random() < p);
      expect(unpackIds(def, packIds(def, picked)).sort()).toEqual([...picked].sort());
    }
  });

  it('handles the empty map and the complete map', () => {
    expect(packIds(def, [])).toBe('A');
    expect(unpackIds(def, 'A')).toEqual([]);
    expect(unpackIds(def, packIds(def, all)).sort()).toEqual([...all].sort());
  });

  it('keeps links short enough to paste anywhere', () => {
    const code = packIds(def, all);
    expect(code.length).toBe(Math.ceil(all.length / 6));
    expect(code.length).toBeLessThanOrEqual(64);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('ignores ids it does not know and never counts a place twice', () => {
    const picked = [all[0], all[0], 'NOT-A-PLACE', all[2]];
    expect(unpackIds(def, packIds(def, picked))).toEqual([all[0], all[2]]);
  });

  it('ignores characters and bits beyond the end of the map', () => {
    const tooLong = packIds(def, all) + '__________';
    expect(unpackIds(def, tooLong).sort()).toEqual([...all].sort());
    expect(unpackIds(def, '!!!!')).toEqual([]);
  });
});

describe('share links', () => {
  const def = MAPS.canada;

  it('round-trips places, name and the challenge flag', () => {
    const hash = buildHash(def, { visited: ['CA-ON', 'CA-BC'], name: 'Salman', challenge: true });
    expect(hash.startsWith('#v=')).toBe(true);
    expect(parseHash(def, hash)).toEqual({ visited: ['CA-ON', 'CA-BC'], wishlist: [], name: 'Salman', challenge: true });
  });

  it('carries a bucket list only when one is handed over, and never lists a place in both', () => {
    const hash = buildHash(def, { visited: ['CA-ON'], wishlist: ['CA-YT', 'CA-ON'] });
    const parsed = parseHash(def, hash)!;
    expect(parsed.visited).toEqual(['CA-ON']);
    expect(parsed.wishlist).toEqual(['CA-YT']);
    expect(buildHash(def, { visited: ['CA-ON'], wishlist: [] })).not.toContain('w=');
  });

  it('survives names with spaces, accents, symbols and other alphabets', () => {
    for (const name of ['Zoë & Li', 'সালমান', '山田 太郎', 'a+b=c #1', 'O’Brien']) {
      expect(parseHash(def, buildHash(def, { visited: ['CA-QC'], name }))!.name).toBe(name);
    }
  });

  it('treats anything that is not a share link as no link at all', () => {
    for (const junk of ['', '#', '#faq', '#v=', '#v=%3Cscript%3E', '#x=1&y=2', `#v=${'A'.repeat(65)}`, '#v=A B']) {
      expect(parseHash(def, junk), junk).toBeNull();
    }
  });

  it('drops a malformed bucket list but keeps the valid part of the link', () => {
    expect(parseHash(def, '#v=g&w=<img>')).toEqual({ visited: ['CA-NL'], wishlist: [], name: '', challenge: false });
  });

  it('only treats c=1 as a challenge', () => {
    expect(parseHash(def, '#v=g&c=true')!.challenge).toBe(false);
    expect(parseHash(def, '#v=g&c=1')!.challenge).toBe(true);
  });
});

describe('display names', () => {
  it('keeps ordinary names as they are', () => {
    expect(sanitizeName('  Amina  ')).toBe('Amina');
    expect(sanitizeName('Jean-Luc O’Neil')).toBe('Jean-Luc O’Neil');
  });

  it('flattens line breaks, tabs and control characters to single spaces', () => {
    expect(sanitizeName('a\nb\tc\u0000d\u0007e')).toBe('a b c d e');
  });

  it('removes invisible characters that hide or reorder text', () => {
    expect(sanitizeName('ab‮cd​ef﻿')).toBe('ab cd ef');
    expect(sanitizeName('⁦evil⁩')).toBe('evil');
  });

  it('limits length by whole characters, never splitting an emoji', () => {
    const long = '🌍'.repeat(60);
    const clean = sanitizeName(long);
    expect([...clean]).toHaveLength(MAX_NAME_LENGTH);
    expect(clean).toBe('🌍'.repeat(MAX_NAME_LENGTH));
  });

  it('leaves markup as plain text for the page to print safely', () => {
    expect(sanitizeName('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });
});
