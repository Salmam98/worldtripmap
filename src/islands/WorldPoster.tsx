import { WORLD } from '../data/definitions/world';
import geometry from '../data/maps/world.display.json';
import meta from '../data/maps/world.meta.json';
import type { MapGeoMeta, MapGeometry } from '../lib/maps/types';
import { PosterStudio } from './poster/PosterStudio';
import { ErrorBoundary } from './ui/ErrorBoundary';

export default function WorldPoster() {
  return (
    <ErrorBoundary what="The poster studio">
      <PosterStudio def={WORLD} meta={meta as unknown as MapGeoMeta} geometry={geometry as unknown as MapGeometry} />
    </ErrorBoundary>
  );
}
