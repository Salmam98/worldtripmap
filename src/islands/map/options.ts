import type { MapId } from '../../lib/maps/types';

export interface MapOptions {
  /** "side" puts the panel beside the map; "stack" gives a wide map the full width. */
  layout: 'side' | 'stack';
  maxZoom: number;
  /** Area features smaller than this (map units) get a tap marker when they are small on screen. */
  markerBelow?: number;
}

/**
 * How each map is presented. The live map and the stand-in drawn when the site is built both read
 * this, so the two always have the same shape and nothing moves when one replaces the other.
 */
export const MAP_OPTIONS: Record<MapId, MapOptions> = {
  // Small countries get tap markers, and the map zooms 14x to reach them.
  world: { layout: 'stack', maxZoom: 14, markerBelow: 40 },
  canada: { layout: 'side', maxZoom: 6, markerBelow: 160 },
  'canada-cities': { layout: 'side', maxZoom: 12 },
};
