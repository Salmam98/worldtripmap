import { WORLD } from '../data/definitions/world';
import geometry from '../data/maps/world.display.json';
import meta from '../data/maps/world.meta.json';
import type { MapGeoMeta, MapGeometry } from '../lib/maps/types';
import { MapApp } from './map/MapApp';
import { MAP_OPTIONS } from './map/options';
import { ErrorBoundary } from './ui/ErrorBoundary';

/** The world's countries and territories, with the geometry bundled so the map appears in one request. */
export default function WorldMap({ variant = 'page' }: { variant?: 'page' | 'embed' }) {
  return (
    <ErrorBoundary what="The map">
      <MapApp
        def={WORLD}
        meta={meta as unknown as MapGeoMeta}
        geometry={geometry as unknown as MapGeometry}
        variant={variant}
        {...MAP_OPTIONS.world}
      />
    </ErrorBoundary>
  );
}
