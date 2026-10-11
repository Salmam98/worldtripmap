import { featuresById } from './registry';
import type { MapDefinition, Selection } from './types';

/**
 * Everything a visitor creates stays in their own browser (localStorage). There is no account and
 * no server copy. Every read and write is guarded, because storage can be unavailable (private
 * windows, blocked site data), and the interface only says "Saved on this device" when a write
 * actually succeeded.
 */

const PREFIX = 'wtm:v1:';

export function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to remove */
  }
}

export function emptySelection(): Selection {
  return { visited: new Set(), wishlist: new Set() };
}

/** Keeps only real ids, removes duplicates, and lets "explored" win over "want to go". */
export function normalizeSelection(
  def: MapDefinition,
  visited: Iterable<string> | undefined,
  wishlist: Iterable<string> | undefined,
): Selection {
  const known = featuresById(def);
  const v = new Set<string>();
  const w = new Set<string>();
  for (const id of listOf(visited)) if (typeof id === 'string' && known.has(id)) v.add(id);
  for (const id of listOf(wishlist)) if (typeof id === 'string' && known.has(id) && !v.has(id)) w.add(id);
  return { visited: v, wishlist: w };
}

/** Saved data can be anything once someone has edited it by hand. Only real lists are read. */
function listOf(value: unknown): Iterable<unknown> {
  return Array.isArray(value) || value instanceof Set ? value : [];
}

interface StoredSelection {
  visited?: string[];
  wishlist?: string[];
}

export function loadSelection(def: MapDefinition): Selection {
  const stored = readJson<StoredSelection>(`map:${def.id}`);
  return normalizeSelection(def, stored?.visited, stored?.wishlist);
}

export function saveSelection(def: MapDefinition, selection: Selection): boolean {
  return writeJson(`map:${def.id}`, {
    visited: [...selection.visited],
    wishlist: [...selection.wishlist],
    savedAt: Date.now(),
  });
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a.visited.size !== b.visited.size || a.wishlist.size !== b.wishlist.size) return false;
  for (const id of a.visited) if (!b.visited.has(id)) return false;
  for (const id of a.wishlist) if (!b.wishlist.has(id)) return false;
  return true;
}

export function loadDisplayName(): string {
  return readJson<{ name?: string }>('profile')?.name ?? '';
}

export function saveDisplayName(name: string): boolean {
  return writeJson('profile', { name });
}
