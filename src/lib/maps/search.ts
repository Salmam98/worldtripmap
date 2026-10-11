import type { FeatureDef, MapDefinition } from './types';

/** Lower-case, accents removed, punctuation turned into spaces: "Québec" and "quebec" match. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface IndexEntry {
  feature: FeatureDef;
  name: string;
  short: string;
  aliases: string[];
}

const cache = new WeakMap<MapDefinition, IndexEntry[]>();

function indexOf(def: MapDefinition): IndexEntry[] {
  let index = cache.get(def);
  if (!index) {
    index = def.features.map((feature) => ({
      feature,
      name: normalizeText(feature.name),
      short: normalizeText(feature.short ?? ''),
      aliases: (feature.aliases ?? []).map(normalizeText),
    }));
    cache.set(def, index);
  }
  return index;
}

function score(entry: IndexEntry, q: string): number {
  if (entry.name === q) return 100;
  if (q.length >= 2 && entry.short === q) return 95;
  if (entry.aliases.includes(q)) return 90;
  if (entry.name.startsWith(q)) return 80;
  if (entry.name.split(' ').some((word) => word.startsWith(q))) return 70;
  if (entry.aliases.some((a) => a.startsWith(q))) return 60;
  if (entry.aliases.some((a) => a.split(' ').some((word) => word.startsWith(q)))) return 50;
  if (q.length >= 3 && entry.name.includes(q)) return 40;
  if (q.length >= 3 && entry.aliases.some((a) => a.includes(q))) return 30;
  return 0;
}

/** Features matching a query, best first. An empty query returns every feature in map order. */
export function searchFeatures(def: MapDefinition, query: string): FeatureDef[] {
  const q = normalizeText(query);
  if (!q) return def.features;
  return indexOf(def)
    .map((entry) => ({ entry, s: score(entry, q) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.entry.feature.name.localeCompare(b.entry.feature.name))
    .map((r) => r.entry.feature);
}
