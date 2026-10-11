import { CANADA } from '../data/definitions/canada';
import { CANADA_PLACES } from '../data/definitions/canada-places';
import geometry from '../data/maps/canada.display.json';
import meta from '../data/maps/canada.meta.json';
import type { MapGeoMeta, MapGeometry } from '../lib/maps/types';
import { PosterStudio } from './poster/PosterStudio';
import { ErrorBoundary } from './ui/ErrorBoundary';

export default function CanadaPoster() {
  return (
    <ErrorBoundary what="The poster studio">
      <PosterStudio
        def={CANADA}
        meta={meta as unknown as MapGeoMeta}
        geometry={geometry as unknown as MapGeometry}
        places={CANADA_PLACES}
      />
    </ErrorBoundary>
  );
}
