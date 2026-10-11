import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAPS } from '../../src/lib/maps/registry';
import type { Lod, MapDefinition, MapGeoMeta, MapGeometry, MapId } from '../../src/lib/maps/types';

const dir = fileURLToPath(new URL('../../src/data/maps/', import.meta.url));
const json = <T>(name: string): T => JSON.parse(readFileSync(dir + name, 'utf8')) as T;

/** Loads a map's definition, metadata and geometry from disk, the way the site assembles them. */
export function mapData(id: MapId, lod: Lod = 'display'): { def: MapDefinition; meta: MapGeoMeta; geometry: MapGeometry } {
  if (id === 'world') return { def: MAPS.world, meta: json('world.meta.json'), geometry: json(`world.${lod}.json`) };
  if (id === 'canada') return { def: MAPS.canada, meta: json('canada.meta.json'), geometry: json(`canada.${lod}.json`) };
  const base = json<MapGeometry>(`canada.${lod}.json`);
  const points = json<{ points: Record<string, [number, number]> }>('canada-cities.points.json');
  return {
    def: MAPS['canada-cities'],
    meta: json('canada-cities.meta.json'),
    geometry: {
      id: 'canada-cities',
      lod,
      width: base.width,
      height: base.height,
      shapes: {},
      points: points.points,
      baseShapes: base.shapes,
      lakes: base.lakes,
      graticule: base.graticule,
    },
  };
}

/** The levels of detail built for each map. The world's light outline is world.art.json instead of a preview level. */
export const lodsOf = (id: MapId): Lod[] => (id === 'world' ? ['display', 'print'] : ['preview', 'display', 'print']);
