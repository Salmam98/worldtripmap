import { CANADA_CITIES_MAP } from '../data/definitions/canada-cities';
import cityMeta from '../data/maps/canada-cities.meta.json';
import cities from '../data/maps/canada-cities.points.json';
import base from '../data/maps/canada.display.json';
import type { MapGeoMeta, MapGeometry } from '../lib/maps/types';
import { PosterStudio } from './poster/PosterStudio';
import { ErrorBoundary } from './ui/ErrorBoundary';

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

export default function CanadaCitiesPoster() {
  return (
    <ErrorBoundary what="The poster studio">
      <PosterStudio def={CANADA_CITIES_MAP} meta={cityMeta as unknown as MapGeoMeta} geometry={geometry} />
    </ErrorBoundary>
  );
}
