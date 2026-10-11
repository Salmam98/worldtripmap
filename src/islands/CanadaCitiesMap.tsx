import { CANADA_CITIES_MAP } from '../data/definitions/canada-cities';
import cityMeta from '../data/maps/canada-cities.meta.json';
import cities from '../data/maps/canada-cities.points.json';
import base from '../data/maps/canada.display.json';
import type { MapGeoMeta, MapGeometry } from '../lib/maps/types';
import { MapApp } from './map/MapApp';
import { MAP_OPTIONS } from './map/options';
import { ErrorBoundary } from './ui/ErrorBoundary';

/** Cities are points on the same projection as the provincial map, which is drawn underneath. */
const geometry: MapGeometry = {
  id: 'canada-cities',
  lod: 'display',
  width: base.width,
  height: base.height,
  shapes: {},
  points: cities.points as unknown as Record<string, [number, number]>,
  baseShapes: base.shapes,
  lakes: base.lakes,
  graticule: base.graticule,
};

export default function CanadaCitiesMap({ variant = 'page' }: { variant?: 'page' | 'embed' }) {
  return (
    <ErrorBoundary what="The map">
      <MapApp
        def={CANADA_CITIES_MAP}
        meta={cityMeta as unknown as MapGeoMeta}
        geometry={geometry}
        variant={variant}
        {...MAP_OPTIONS['canada-cities']}
      />
    </ErrorBoundary>
  );
}
