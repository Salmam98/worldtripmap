import { CANADA } from '../../data/definitions/canada';
import { CANADA_CITIES_MAP } from '../../data/definitions/canada-cities';
import { WORLD } from '../../data/definitions/world';
import type { FeatureDef, MapDefinition, MapId } from './types';

/** Every map that is live on the site. Add a definition here to publish a new map. */
export const MAPS: Record<MapId, MapDefinition> = {
  world: WORLD,
  canada: CANADA,
  'canada-cities': CANADA_CITIES_MAP,
};

export const MAP_IDS = Object.keys(MAPS) as MapId[];

export function isMapId(value: string): value is MapId {
  return Object.prototype.hasOwnProperty.call(MAPS, value);
}

export function getMap(id: MapId): MapDefinition {
  return MAPS[id];
}

const featureIndex = new Map<MapId, Map<string, FeatureDef>>();

export function featuresById(def: MapDefinition): Map<string, FeatureDef> {
  let index = featureIndex.get(def.id);
  if (!index) {
    index = new Map(def.features.map((f) => [f.id, f]));
    featureIndex.set(def.id, index);
  }
  return index;
}

export function countable(def: MapDefinition): FeatureDef[] {
  return def.features.filter((f) => f.countable);
}

export function mapPath(def: MapDefinition): string {
  return `/maps/${def.slug}/`;
}

export function posterPath(def: MapDefinition): string {
  return `/maps/${def.slug}/poster/`;
}
