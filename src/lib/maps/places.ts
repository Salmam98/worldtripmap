import { MAPS } from './registry';
import { percentLabel } from './stats';
import { loadSelection, readJson, removeKey, saveSelection, writeJson } from './store';
import type { PlaceDef, PlaceLayer } from './types';

/**
 * Places inside the features of a map: the cities, parks and landmarks of a province.
 *
 * A province percentage is the share of that province's listed places a visitor has ticked. The
 * figure for the whole country is the share of every listed place, so each place weighs the same
 * wherever it is. Neither is a share of land area, and the interface says so beside the numbers.
 */

export interface PlaceCount {
  visited: number;
  total: number;
  /** Exact share, 0 to 100. */
  percent: number;
  /** The share as people should read it: never "0%" for some, never "100%" for almost all. */
  percentLabel: string;
}

export interface PlacesSummary extends PlaceCount {
  /** Per feature of the parent map (province or territory). Features with no places are absent. */
  byFeature: Record<string, PlaceCount>;
}

function count(visited: number, total: number): PlaceCount {
  return { visited, total, percent: total ? (visited / total) * 100 : 0, percentLabel: percentLabel(visited, total) };
}

const byFeatureIndex = new WeakMap<PlaceLayer, Map<string, PlaceDef[]>>();

/** The places counted in one feature, in the order the layer lists them. */
export function placesIn(layer: PlaceLayer, featureId: string): PlaceDef[] {
  let index = byFeatureIndex.get(layer);
  if (!index) {
    index = new Map();
    for (const place of layer.places) {
      const list = index.get(place.within);
      if (list) list.push(place);
      else index.set(place.within, [place]);
    }
    byFeatureIndex.set(layer, index);
  }
  return index.get(featureId) ?? [];
}

export function summarizePlaces(layer: PlaceLayer, marks: ReadonlySet<string>): PlacesSummary {
  const tally: Record<string, { visited: number; total: number }> = {};
  let visited = 0;
  for (const place of layer.places) {
    const row = (tally[place.within] ??= { visited: 0, total: 0 });
    row.total++;
    if (marks.has(place.id)) {
      row.visited++;
      visited++;
    }
  }
  const byFeature: Record<string, PlaceCount> = {};
  for (const [id, row] of Object.entries(tally)) byFeature[id] = count(row.visited, row.total);
  return { ...count(visited, layer.places.length), byFeature };
}

/** Features that hold at least one ticked place: having been to Toronto means having been to Ontario. */
export function featuresWithMarks(layer: PlaceLayer, marks: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  for (const place of layer.places) if (marks.has(place.id)) ids.add(place.within);
  return ids;
}

// ---------------------------------------------------------------------------------------------
// Saving on the device
// ---------------------------------------------------------------------------------------------

const ownKey = (layer: PlaceLayer) => `places:${layer.id}`;

/** The localStorage keys a layer's marks live under, for listening to changes from other tabs. */
export function storageKeys(layer: PlaceLayer): string[] {
  const maps = new Set(layer.places.filter((p) => p.from).map((p) => p.from!.map));
  return [`wtm:v1:${ownKey(layer)}`, ...[...maps].map((id) => `wtm:v1:map:${id}`)];
}

/**
 * Every ticked place. A place that is also a feature of another map (a city) is read from that
 * map's own marks, so it can never be ticked in one and not the other.
 */
export function loadPlaceMarks(layer: PlaceLayer): Set<string> {
  const marks = new Set<string>();
  const stored = readJson<{ visited?: unknown }>(ownKey(layer))?.visited;
  const own = new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []);
  const selections = new Map<string, Set<string>>();
  for (const place of layer.places) {
    if (place.from) {
      let visited = selections.get(place.from.map);
      if (!visited) {
        visited = loadSelection(MAPS[place.from.map]).visited;
        selections.set(place.from.map, visited);
      }
      if (visited.has(place.from.id)) marks.add(place.id);
    } else if (own.has(place.id)) {
      marks.add(place.id);
    }
  }
  return marks;
}

/** Saves a whole set of marks. Returns false when the browser would not store them. */
export function savePlaceMarks(layer: PlaceLayer, marks: ReadonlySet<string>): boolean {
  let saved = true;
  const own: string[] = [];
  const perMap = new Map<string, { wanted: Set<string>; ours: Set<string> }>();
  for (const place of layer.places) {
    if (!place.from) {
      if (marks.has(place.id)) own.push(place.id);
      continue;
    }
    let entry = perMap.get(place.from.map);
    if (!entry) {
      entry = { wanted: new Set(), ours: new Set() };
      perMap.set(place.from.map, entry);
    }
    entry.ours.add(place.from.id);
    if (marks.has(place.id)) entry.wanted.add(place.from.id);
  }
  if (own.length) saved = writeJson(ownKey(layer), { visited: own, savedAt: Date.now() }) && saved;
  else removeKey(ownKey(layer));

  for (const [mapId, entry] of perMap) {
    const def = MAPS[mapId as keyof typeof MAPS];
    const selection = loadSelection(def);
    let changed = false;
    for (const id of entry.ours) {
      const want = entry.wanted.has(id);
      if (want && !selection.visited.has(id)) {
        selection.visited.add(id);
        selection.wishlist.delete(id);
        changed = true;
      } else if (!want && selection.visited.has(id)) {
        selection.visited.delete(id);
        changed = true;
      }
    }
    if (changed) saved = saveSelection(def, selection) && saved;
  }
  return saved;
}
