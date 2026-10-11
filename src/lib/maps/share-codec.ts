import type { MapDefinition } from './types';

/**
 * Share links carry the map in the link itself, after the "#". Nothing is uploaded, browsers do not
 * send that part of a URL to the server, and search engines never see it, so shared maps cannot
 * create duplicate pages.
 *
 *   /maps/canada/#v=<explored>&n=<display name>&c=1
 *
 *   v  explored places, one bit per place in the map's frozen shareOrder, base64url
 *   w  bucket-list places, same encoding (only used when handing a map from page to page)
 *   n  optional display name, at most 40 characters
 *   c  "1" when the link is a challenge
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = new Map([...ALPHABET].map((ch, i) => [ch, i]));

export const MAX_NAME_LENGTH = 40;

export function packIds(def: MapDefinition, ids: Iterable<string>): string {
  const wanted = new Set(ids);
  const sextets = new Array<number>(Math.ceil(def.shareOrder.length / 6)).fill(0);
  def.shareOrder.forEach((id, i) => {
    if (wanted.has(id)) sextets[Math.floor(i / 6)] |= 1 << (5 - (i % 6));
  });
  while (sextets.length > 1 && sextets[sextets.length - 1] === 0) sextets.pop();
  return sextets.map((v) => ALPHABET[v]).join('') || 'A';
}

/** Returns the ids in a code. Unknown characters and bits past the end of the list are ignored. */
export function unpackIds(def: MapDefinition, code: string): string[] {
  const ids: string[] = [];
  const max = Math.ceil(def.shareOrder.length / 6);
  [...code].slice(0, max).forEach((ch, s) => {
    const value = VALUE.get(ch);
    if (value === undefined) return;
    for (let b = 0; b < 6; b++) {
      if (value & (1 << (5 - b))) {
        const id = def.shareOrder[s * 6 + b];
        if (id) ids.push(id);
      }
    }
  });
  return ids;
}

/**
 * Makes typed text safe to carry in a link and to print: plain text on one line, with control
 * characters and the invisible characters that reorder or hide text removed, cut to `limit`
 * whole characters.
 */
export function sanitizeText(input: string, limit: number): string {
  const cleaned = input
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...cleaned].slice(0, limit).join('').trim();
}

/** A display name: sanitised text of at most 40 characters. */
export function sanitizeName(input: string): string {
  return sanitizeText(input, MAX_NAME_LENGTH);
}

export interface SharedMap {
  visited: string[];
  wishlist: string[];
  name: string;
  challenge: boolean;
}

export function buildHash(
  def: MapDefinition,
  data: { visited: Iterable<string>; wishlist?: Iterable<string>; name?: string; challenge?: boolean },
): string {
  const params = new URLSearchParams();
  params.set('v', packIds(def, data.visited));
  if (data.wishlist) {
    const w = packIds(def, data.wishlist);
    if (w !== 'A') params.set('w', w);
  }
  const name = sanitizeName(data.name ?? '');
  if (name) params.set('n', name);
  if (data.challenge) params.set('c', '1');
  return '#' + params.toString();
}

export function parseHash(def: MapDefinition, hash: string): SharedMap | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return null;
  }
  const v = params.get('v');
  if (v === null || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) return null;
  const w = params.get('w');
  const visited = unpackIds(def, v);
  const taken = new Set(visited);
  const wishlist = w && /^[A-Za-z0-9_-]{1,64}$/.test(w) ? unpackIds(def, w).filter((id) => !taken.has(id)) : [];
  return {
    visited,
    wishlist,
    name: sanitizeName(params.get('n') ?? ''),
    challenge: params.get('c') === '1',
  };
}
