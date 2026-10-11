import type { Achievement } from '../maps/achievements';
import type { PlacesSummary } from '../maps/places';
import type { MapStats } from '../maps/stats';
import type { MapDefinition, MapGeoMeta, MapGeometry, Selection } from '../maps/types';
import type { PosterFormat } from './formats';
import type { Painter } from './painter';
import type { PosterSettings } from './settings';
import type { Look, TemplateDef } from './templates';

/**
 * Types shared by the layout code (compose.ts) and the templates. They live in their own module
 * so that neither of those has to import the other's values.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Everything a template needs while it draws. */
export interface Ctx {
  p: Painter;
  W: number;
  H: number;
  bleed: number;
  def: MapDefinition;
  meta: MapGeoMeta;
  geometry: MapGeometry;
  selection: Selection;
  settings: PosterSettings;
  format: PosterFormat;
  stats: MapStats;
  /** Places ticked inside the map's features. Null when there are none to show. */
  places: PlacesSummary | null;
  achievements: Achievement[];
  look: Look;
  template: TemplateDef;
  /** Top and bottom limits for content, inside the margins and any story safe areas. */
  top: number;
  bottom: number;
  /** Corners of the map with open water, in the order ornaments should claim them. */
  corners: Corner[];
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Where a seal or postmark can sit without covering land. */
export const QUIET_CORNERS: Record<string, Corner[]> = {
  world: ['bottom-left', 'bottom-right', 'top-left'],
  canada: ['top-right', 'bottom-left', 'top-left'],
  'canada-cities': ['top-right', 'bottom-left', 'top-left'],
};

/** Claims the next quiet corner and returns the centre for a round ornament of radius r. */
export function claimCorner(c: Ctx, placed: PlacedMap, r: number, inset = 0.92): [number, number] {
  const corner = c.corners.shift() ?? 'top-right';
  const b = placed.box;
  const x = corner.endsWith('left') ? b.x + r * inset : b.x + b.w - r * inset;
  const y = corner.startsWith('top') ? b.y + r * inset : b.y + b.h - r * inset;
  return [x, y];
}

export interface PlacedMap {
  /** Poster units per map unit. */
  scale: number;
  /** Converts a map point to poster coordinates. */
  at: (x: number, y: number) => [number, number];
  /** The box the map actually covers on the poster. */
  box: Rect;
}

