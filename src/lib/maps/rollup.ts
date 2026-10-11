import { MAPS, featuresById } from './registry';
import { loadSelection } from './store';
import type { MapDefinition, Selection } from './types';

/**
 * Maps keep separate progress. Marking Alberta never marks Calgary, and marking a city never marks
 * its province. This module only works out what a visitor *could* add to a broader map from what
 * they marked on a narrower one (a city implies its province; any province implies the country),
 * so the page can offer it. Nothing is combined until the visitor says so.
 */
export interface RollupSuggestion {
  /** Places on this map that the visitor's other maps imply, and that are not marked yet. */
  ids: string[];
  names: string[];
  /** The maps the suggestion comes from, for the explanation. Empty when it comes only from ticked places. */
  sources: string[];
}

/**
 * @param also Features implied by something other than another map: the places a visitor has
 *   ticked inside them. They add to the suggestion without naming a map as its source.
 */
export function suggestRollup(def: MapDefinition, selection: Selection, also?: Iterable<string>): RollupSuggestion | null {
  const known = featuresById(def);
  const implied = new Set<string>();
  const sources = new Set<string>();
  for (const id of also ?? []) if (known.has(id)) implied.add(id);

  for (const other of Object.values(MAPS)) {
    if (other.id === def.id) continue;
    const marks = loadSelection(other).visited;
    if (!marks.size) continue;
    if (other.parent?.map === def.id && known.has(other.parent.id)) {
      implied.add(other.parent.id);
      sources.add(other.name);
    }
    for (const feature of other.features) {
      if (feature.parent?.map === def.id && marks.has(feature.id) && known.has(feature.parent.id)) {
        implied.add(feature.parent.id);
        sources.add(other.name);
      }
    }
  }

  const ids = [...implied].filter((id) => !selection.visited.has(id));
  if (!ids.length) return null;
  return { ids, names: ids.map((id) => known.get(id)!.name), sources: [...sources] };
}
