/**
 * Colouring a marked province by how much of it has been seen.
 *
 * The share is the province's ticked places over its listed places (see places.ts). A province
 * with nothing ticked gets the lightest tone, one with everything ticked gets the full colour.
 * The steps are larger at the low end: most travellers have seen a small part of a province, and
 * one more place should show on the map. The same scale colours the interactive map, the poster
 * and both of their keys, so a tone always means the same share.
 *
 * The tones are tints of the full colour, not blends with the land colour: the hue stays the
 * same and only its strength changes. On light paper a low share is a pale green and a high one
 * a deep green; on the dark Midnight Atlas poster a low share is a dim gold and a high one a
 * bright gold. Blending the two colours directly would pass through grey on the way.
 */

/** How far along from unmarked land to the full colour the lightest tone sits, at least. */
export const SHADE_FLOOR = 0.35;
/** The lightest tone is moved further still, if need be, until it stands this far (WCAG ratio) from unmarked land. */
const MIN_STEP_FROM_LAND = 1.5;
/** How much of the full colour's strength the faintest possible tint keeps, so that light tones are not grey. */
const TINT_STRENGTH = 0.55;

/** The shares a key shows, lightest to fullest. */
export const SHADE_STOPS = [0, 0.25, 0.5, 0.75, 1] as const;

/** How far along the scale a share sits, from the floor for none to 1 for all. Both run from 0 to 1. */
export function shadeAmount(share: number, floor: number = SHADE_FLOOR): number {
  const s = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
  return floor + (1 - floor) * Math.sqrt(s);
}

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: Rgb): string {
  return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** A colour between two others, as #rrggbb. An amount of 0 gives the first and 1 gives the second. */
export function mixHex(from: string, to: string, amount: number): string {
  const t = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

/** Lightness, and the two axes of colour, in OKLab: a space where equal steps look equal. */
type Lab = [number, number, number];

function toOklab(hex: string): Lab {
  const [r, g, b] = parseHex(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Linear-light red, green and blue for an OKLab colour. Values outside 0 to 1 cannot be shown. */
function oklabToLinear([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** An OKLab colour as #rrggbb. A colour too strong for a screen keeps its lightness and hue and loses strength. */
function oklabToHex([L, a, b]: Lab): string {
  let k = 1;
  for (let i = 0; i < 40; i++) {
    const rgb = oklabToLinear([L, a * k, b * k]);
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return toHex(rgb.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as Rgb);
    k *= 0.93;
  }
  return toHex(oklabToLinear([L, 0, 0]).map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as Rgb);
}

/**
 * The full colour at a strength from 0 to 1. Its lightness moves from the land's towards its own,
 * its hue never changes, and it keeps enough of its strength at the light end not to look grey.
 */
function tint(unmarked: string, full: string, amount: number): string {
  if (amount >= 1) return toHex(parseHex(full));
  const land = toOklab(unmarked);
  const top = toOklab(full);
  const strength = TINT_STRENGTH + (1 - TINT_STRENGTH) * amount;
  return oklabToHex([land[0] + (top[0] - land[0]) * amount, top[1] * strength, top[2] * strength]);
}

const floors = new Map<string, number>();

/**
 * Where the scale starts for a pair of colours. A pale full colour (a gold on cream paper) leaves
 * little room between it and unmarked land, so its lightest tone starts further along.
 */
function floorFor(unmarked: string, full: string): number {
  const key = `${unmarked}|${full}`.toLowerCase();
  let floor = floors.get(key);
  if (floor === undefined) {
    floor = SHADE_FLOOR;
    while (floor < 0.7 && contrast(tint(unmarked, full, floor), unmarked) < MIN_STEP_FROM_LAND) floor += 0.05;
    floors.set(key, floor);
  }
  return floor;
}

/** The tone for a share (0 to 1) of a place that is marked: a tint of the full colour. */
export function shadeHex(unmarked: string, full: string, share: number): string {
  return tint(unmarked, full, shadeAmount(share, floorFor(unmarked, full)));
}

// ---------------------------------------------------------------------------------------------
// Reading on top of a tone
// ---------------------------------------------------------------------------------------------

/** Relative luminance, as WCAG defines it. */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The colour to write with on top of a fill: whichever of the choices reads best. Halfway up the
 * scale neither a design's light ink nor its dark ink may reach 4.5 to 1, and there plain black
 * or white is used, one of which always does.
 */
export function inkOn(fill: string, choices: readonly string[]): string {
  const best = (list: readonly string[]) => list.reduce((a, b) => (contrast(fill, b) > contrast(fill, a) ? b : a));
  const pick = best(choices);
  return contrast(fill, pick) >= 4.5 ? pick : best(['#ffffff', '#000000']);
}
