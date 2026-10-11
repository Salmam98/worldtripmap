import { CANADA } from '../data/definitions/canada';
import { CANADA_PLACES } from '../data/definitions/canada-places';
import geometry from '../data/maps/canada.display.json';
import meta from '../data/maps/canada.meta.json';
import type { MapGeoMeta, MapGeometry } from '../lib/maps/types';
import { MapApp } from './map/MapApp';
import { MAP_OPTIONS } from './map/options';
import { ErrorBoundary } from './ui/ErrorBoundary';

/** Canada's provinces and territories, with its geometry bundled so the map appears in one request. */
export default function CanadaMap({ variant = 'page' }: { variant?: 'page' | 'embed' }) {
  return (
    <ErrorBoundary what="The map">
      <MapApp
        def={CANADA}
        meta={meta as unknown as MapGeoMeta}
        geometry={geometry as unknown as MapGeometry}
        variant={variant}
        places={CANADA_PLACES}
        {...MAP_OPTIONS.canada}
      />
    </ErrorBoundary>
  );
}
