import { inkOn, mixHex, shadeHex, SHADE_STOPS } from '../../lib/maps/shade';

/**
 * The interactive map's own colours, as tokens.css defines them (--map-land, --map-visited,
 * --ivory-50, --navy-900). The tones are worked out in script, so they are written out here too;
 * a unit test fails if the two ever differ.
 */
export const MAP_COLOURS = {
  land: '#e3ddce',
  visited: '#315c4c',
  lightInk: '#f8f6f0',
  darkInk: '#101b2d',
} as const;

/** How one marked province is painted when provinces are coloured by the share of their places ticked. */
export interface Tone {
  fill: string;
  /** A little darker, for the pointer resting on it. */
  hover: string;
  /** The colour of the short name written on it. */
  label: string;
}

export function toneFor(share: number): Tone {
  const fill = shadeHex(MAP_COLOURS.land, MAP_COLOURS.visited, share);
  return {
    fill,
    hover: mixHex(fill, MAP_COLOURS.darkInk, 0.16),
    label: inkOn(fill, [MAP_COLOURS.lightInk, MAP_COLOURS.darkInk]),
  };
}

/** The colours the map key shows, from nothing ticked to everything ticked. */
export const TONE_RAMP: string[] = SHADE_STOPS.map((share) => toneFor(share).fill);
