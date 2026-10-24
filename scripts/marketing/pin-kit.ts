/**
 * Shared parts of the Pinterest pin builders: sizes, colours, type, maps, posters and the renderer.
 *
 * Pins are laid out at 1000 × 1500 and saved at twice that, 2000 × 3000. Everything is drawn with
 * the site's own maps, poster engine, checklist sheets and fonts, so a pin looks like the site.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp, { type OverlayOptions } from 'sharp';
import { CANADA, CANADA_REGIONS, CANADA_TOTAL_AREA_KM2 } from '../../src/data/definitions/canada';
import { CANADA_CITIES } from '../../src/data/definitions/canada-cities';
import { WORLD } from '../../src/data/definitions/world';
import { computeAchievements } from '../../src/lib/maps/achievements';
import { computeStats } from '../../src/lib/maps/stats';
import { normalizeSelection } from '../../src/lib/maps/store';
import type { MapDefinition, MapGeoMeta, MapGeometry } from '../../src/lib/maps/types';
import { composePoster, drawMap, fontsFor } from '../../src/lib/poster/compose';
import type { Ctx, PlacedMap } from '../../src/lib/poster/context';
import { loadFonts } from '../../src/lib/poster/fonts';
import { getFormat } from '../../src/lib/poster/formats';
import { Painter, type TextSpec } from '../../src/lib/poster/painter';
import { sceneToSvg } from '../../src/lib/poster/render-svg';
import type { Scene } from '../../src/lib/poster/scene';
import { defaultSettings, type PosterSettings, type TemplateId } from '../../src/lib/poster/settings';
import { TEMPLATES } from '../../src/lib/poster/templates';

export const W = 1000;
export const H = 1500;
export const M = 72;
/** Pixels per layout unit. */
export const PX = 2;
export const SITE = 'https://worldtripmap.com';

export type Rect = { x: number; y: number; w: number; h: number };

// ------------------------------------------------------------------ themes

export interface Theme {
  paper: string;
  ink: string;
  soft: string;
  accent: string;
  onAccent: string;
  /** Unvisited land on maps. */
  land: string;
  coast: string;
  /** Hairlines and the graticule. */
  line: string;
  /** Cards laid on the paper. */
  card: string;
}

export const NAVY: Theme = { paper: '#101B2D', ink: '#F4EFE3', soft: '#A9B3C1', accent: '#E0B252', onAccent: '#101B2D', land: '#22334F', coast: '#4E5F7E', line: '#26365A', card: '#17253C' };
export const PAPER: Theme = { paper: '#F6F3EC', ink: '#14202F', soft: '#586474', accent: '#C0392B', onAccent: '#FFFFFF', land: '#E3DDCF', coast: '#B9B09D', line: '#DED7C9', card: '#FFFFFF' };
export const CREAM: Theme = { paper: '#F4EEE2', ink: '#101B2D', soft: '#4F5B6B', accent: '#C0532F', onAccent: '#FFFFFF', land: '#E2DACA', coast: '#BDB29C', line: '#E0D7C6', card: '#FFFDF8' };
export const SAND: Theme = { paper: '#EFE7D4', ink: '#2E2A24', soft: '#655C4C', accent: '#2F6B5B', onAccent: '#FFFFFF', land: '#DCCFB2', coast: '#B8A988', line: '#DDD1B7', card: '#F9F4E8' };
export const FOREST: Theme = { paper: '#1D3A31', ink: '#F2EDE1', soft: '#B5C3B8', accent: '#E0B252', onAccent: '#1D3A31', land: '#2B4C42', coast: '#4F7366', line: '#2A4A40', card: '#23443A' };
/** Plain walls for framed posters. */
export const GREIGE: Theme = { ...PAPER, paper: '#DCD6CA', accent: '#14202F', onAccent: '#F4EFE3', soft: '#4F5866' };
export const BLUSH: Theme = { ...CREAM, paper: '#E9DCCB', accent: '#8C3B22', soft: '#5E5246' };

// ------------------------------------------------------------------ data

const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
interface MapData {
  def: MapDefinition;
  meta: MapGeoMeta;
  geometry: MapGeometry;
  /** The finer outlines, for maps drawn large or cropped close. */
  print: MapGeometry;
}
export const MAPS: Record<'canada' | 'world', MapData> = {
  canada: {
    def: CANADA,
    meta: await json('src/data/maps/canada.meta.json'),
    geometry: await json('src/data/maps/canada.display.json'),
    print: await json('src/data/maps/canada.print.json'),
  },
  world: {
    def: WORLD,
    meta: await json('src/data/maps/world.meta.json'),
    geometry: await json('src/data/maps/world.display.json'),
    print: await json('src/data/maps/world.print.json'),
  },
};
/** City positions in the Canada map's own units. */
export const CITY_POINTS = (await json('src/data/maps/canada-cities.points.json')).points as Record<string, [number, number]>;
export const region = (id: string) => CANADA_REGIONS.find((r) => r.id === id)!;
export const city = (id: string) => CANADA_CITIES.find((c) => c.id === id)!;
export const areaShare = (ids: string[]) => (ids.reduce((sum, id) => sum + region(id).areaKm2, 0) / CANADA_TOTAL_AREA_KM2) * 100;
export const fmt = (n: number) => n.toLocaleString('en-CA');

export const fonts = await loadFonts(['dmserif-400', 'dmserif-400i', 'manrope-500', 'manrope-700', 'caveat-600']);

// ------------------------------------------------------------------ rendering

export const svgToPng = (svg: string) => sharp(Buffer.from(svg), { limitInputPixels: false }).png().toBuffer();
export const sceneOf = (p: Painter, background = 'none', width = W, height = H): Scene => ({ width, height, bleed: 0, background, nodes: p.nodes, description: '' });
export const toPng = (scene: Scene, widthPx: number) => svgToPng(sceneToSvg(scene, { pixelWidth: widthPx }));

export interface Overlay {
  png: Buffer;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Blur of the shadow beneath, in layout units; false for none. */
  shadow?: number | false;
}
export interface Layers {
  overlays?: Overlay[];
  /** Drawn above the overlays. */
  over?: (p: Painter) => void;
}

async function shadowPng(w: number, h: number, blur: number, opacity: number): Promise<{ input: Buffer; pad: number }> {
  const pad = Math.round(blur * 3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad * 2}" height="${h + pad * 2}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><rect x="${pad}" y="${pad + blur * 0.55}" width="${w}" height="${h}" fill="#000" fill-opacity="${opacity}" filter="url(#b)"/></svg>`;
  return { input: await svgToPng(svg), pad };
}

/** A poster scene as a PNG `w` layout units wide, at the pin's pixel density. */
export async function posterPng(settings: Partial<PosterSettings>, map: 'canada' | 'world', visited: string[], wishlist: string[], w: number) {
  const { def, meta, geometry } = MAPS[map];
  const full = { ...defaultSettings(def), ...settings };
  const format = getFormat(full.format);
  const scene = composePoster({ def, meta, geometry, selection: normalizeSelection(def, visited, wishlist), settings: full, format }, await loadFonts(fontsFor(full)));
  const png = await toPng(scene, Math.round(w * PX));
  return { png, w, h: (w * format.height) / format.width };
}

// ------------------------------------------------------------------ type

export const serif = (size: number, fill: string, extra: Partial<TextSpec> = {}): TextSpec => ({ font: 'dmserif-400', size, fill, tracking: -8, ...extra });
export const sans = (size: number, fill: string, extra: Partial<TextSpec> = {}): TextSpec => ({ font: 'manrope-500', size, fill, ...extra });
export const bold = (size: number, fill: string, extra: Partial<TextSpec> = {}): TextSpec => ({ font: 'manrope-700', size, fill, ...extra });
export const hand = (size: number, fill: string, extra: Partial<TextSpec> = {}): TextSpec => ({ font: 'caveat-600', size, fill, ...extra });

export function brand(p: Painter, t: Theme, x: number, y: number, scale = 1): void {
  const r = 16 * scale;
  p.path(`M${x} ${y - r}C${x + r * 0.58} ${y - r} ${x + r * 0.58} ${y + r} ${x} ${y + r}Z`, { fill: t.accent === t.ink ? t.soft : t.accent });
  p.circle(x, y, r, { stroke: t.ink, strokeWidth: 2 * scale });
  p.path(
    `M${x} ${y - r}C${x - r * 0.58} ${y - r} ${x - r * 0.58} ${y + r} ${x} ${y + r}` +
      `M${x} ${y - r}C${x + r * 0.58} ${y - r} ${x + r * 0.58} ${y + r} ${x} ${y + r}` +
      `M${x} ${y - r}V${y + r}M${x - r * 0.9} ${y - 6 * scale}H${x + r * 0.9}M${x - r * 0.9} ${y + 6 * scale}H${x + r * 0.9}`,
    { stroke: t.ink, strokeWidth: 1.5 * scale },
  );
  p.text('WorldTripMap', x + r + 13 * scale, y + 10 * scale, serif(29 * scale, t.ink, { tracking: 0 }));
}

export function kicker(p: Painter, text: string, x: number, y: number, fill: string, anchor: 'start' | 'middle' | 'end' = 'start'): void {
  p.text(text, x, y, bold(21, fill, { tracking: 170, upper: true, anchor }));
}

/** Big serif lines, shrunk until the widest fits. Returns the baseline of the last line. */
export function headline(p: Painter, lines: string[], x: number, top: number, spec: TextSpec, maxW = W - M * 2, min = 52, lead = 1.04): number {
  let size = spec.size;
  while (Math.max(...lines.map((l) => p.measure(l, { ...spec, size }))) > maxW && size > min) size -= 2;
  let y = top;
  for (const line of lines) {
    y += size * lead;
    p.text(line, x, y, { ...spec, size });
  }
  return y;
}

/** Wrapped running text. Returns the baseline of the last line. */
export function para(p: Painter, text: string, x: number, y: number, spec: TextSpec, maxW: number, lead = 1.38, maxLines = 6): number {
  const lines = p.wrap(text, spec, maxW, maxLines);
  lines.forEach((line, i) => p.text(line, x, y + i * spec.size * lead, spec));
  return y + (lines.length - 1) * spec.size * lead;
}

export function pill(p: Painter, t: Theme, text: string, x: number, baseline: number, fill = t.accent, ink = t.onAccent): number {
  const spec = bold(29, ink);
  const w = p.measure(text, spec) + 62;
  p.path(roundRect(x, baseline - 45, w, 68, 34), { fill });
  p.text(text, x + 31, baseline, spec);
  return w;
}

export function footer(p: Painter, t: Theme, cta: string, y = H - 104, fill = t.accent, ink = t.onAccent): void {
  pill(p, t, cta, M, y, fill, ink);
  p.text('worldtripmap.com', W - M, y - 3, bold(23, t.soft, { tracking: 70, anchor: 'end' }));
}

export function note(p: Painter, text: string, x: number, y: number, fill: string, anchor: 'start' | 'middle' | 'end' = 'start', size = 19): void {
  p.text(text, x, y, sans(size, fill, { anchor }));
}

export function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}
export const rectD = (r: Rect) => `M${r.x} ${r.y}H${r.x + r.w}V${r.y + r.h}H${r.x}Z`;

export function tick(p: Painter, x: number, y: number, size: number, stroke: string, width = 3.2): void {
  p.path(`M${x - size * 0.5} ${y}L${x - size * 0.12} ${y + size * 0.38}L${x + size * 0.55} ${y - size * 0.42}`, { stroke, strokeWidth: width, lineCap: 'round', lineJoin: 'round' });
}
export function cross(p: Painter, x: number, y: number, size: number, stroke: string, width = 3.2): void {
  const s = size * 0.4;
  p.path(`M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}`, { stroke, strokeWidth: width, lineCap: 'round' });
}
/** A hand-drawn arrow: a gentle curve with an open head at the end. */
export function arrow(p: Painter, x1: number, y1: number, x2: number, y2: number, stroke: string, bend = 0.25, width = 2.4): void {
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend;
  const my = (y1 + y2) / 2 + (x2 - x1) * bend;
  p.path(`M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`, { stroke, strokeWidth: width, lineCap: 'round' });
  const a = Math.atan2(y2 - my, x2 - mx);
  const l = 13;
  p.path(`M${x2 - l * Math.cos(a - 0.45)} ${y2 - l * Math.sin(a - 0.45)}L${x2} ${y2}L${x2 - l * Math.cos(a + 0.45)} ${y2 - l * Math.sin(a + 0.45)}`, { stroke, strokeWidth: width, lineCap: 'round', lineJoin: 'round' });
}

// ------------------------------------------------------------------ maps

export interface MapOptions {
  visited?: string[];
  wishlist?: string[];
  template?: TemplateId;
  labels?: boolean;
  /** The finer outlines, for maps drawn large or cropped close. */
  print?: boolean;
  look?: Record<string, unknown>;
}

export function mapCtx(p: Painter, id: 'canada' | 'world', t: Theme, o: MapOptions = {}): Ctx {
  const { def, meta, geometry, print } = MAPS[id];
  const template = o.template ?? 'nordic-explorer';
  const tpl = TEMPLATES[template];
  const settings = { ...defaultSettings(def), template, showLabels: Boolean(o.labels), showWishlist: Boolean(o.wishlist?.length) };
  const look = {
    ...tpl.look(settings),
    paper: t.paper,
    water: t.paper,
    sphere: t.paper,
    sphereLine: t.line,
    graticule: t.line,
    land: t.land,
    coast: t.coast,
    border: t.paper,
    accent: t.accent,
    onAccent: t.onAccent,
    ink: t.ink,
    inkSoft: t.soft,
    landLabel: t.soft,
    leader: t.soft,
    wishBg: t.land,
    wishLine: t.accent,
    ...o.look,
  };
  const selection = normalizeSelection(def, o.visited ?? [], o.wishlist ?? []);
  return {
    p, W, H, bleed: 0, def, meta, geometry: o.print ? print : geometry, selection, settings, format: getFormat('print'),
    stats: computeStats(def, selection), places: null, achievements: computeAchievements(def, selection),
    look: look as Ctx['look'], template: tpl, top: 0, bottom: H, corners: [],
  };
}

/** Draws a map into `rect`, enlarged `k` times (labels and lines grow with it). */
export function placeMap(c: Ctx, rect: Rect, k = 1): PlacedMap {
  let placed!: PlacedMap;
  c.p.group({ transform: [k, 0, 0, k, 0, 0] }, () => {
    placed = drawMap(c, { x: rect.x / k, y: rect.y / k, w: rect.w / k, h: rect.h / k });
  });
  return {
    scale: placed.scale * k,
    at: (x, y) => {
      const [ax, ay] = placed.at(x, y);
      return [ax * k, ay * k];
    },
    box: { x: placed.box.x * k, y: placed.box.y * k, w: placed.box.w * k, h: placed.box.h * k },
  };
}

/** Draws only part of a map, `region` in map units, filling the window `win`. */
export function placeCrop(c: Ctx, win: Rect, region: [number, number, number, number]): PlacedMap {
  const [bx0, by0, bx1, by1] = c.meta.bounds;
  const [x0, y0, x1, y1] = region;
  const s = Math.min(win.w / (x1 - x0), win.h / (y1 - y0));
  const rect = { x: win.x + win.w / 2 - ((x0 + x1) / 2 - bx0) * s, y: win.y + win.h / 2 - ((y0 + y1) / 2 - by0) * s, w: (bx1 - bx0) * s, h: (by1 - by0) * s };
  let placed!: PlacedMap;
  c.p.group({ clip: rectD(win) }, () => {
    placed = drawMap(c, rect);
  });
  return placed;
}

/** Repaints chosen areas of a placed map in their own colours, with the lakes back on top. */
export function fillAreas(c: Ctx, placed: PlacedMap, fills: Record<string, string>, clip?: Rect): void {
  const [ox, oy] = placed.at(0, 0);
  const s = placed.scale;
  const draw = () => {
    for (const [id, fill] of Object.entries(fills)) {
      const d = c.geometry.shapes[id];
      if (d) c.p.path(d, { fill, stroke: c.look.border, strokeWidth: 0.9 / s, transform: [s, 0, 0, s, ox, oy] });
    }
    if (c.geometry.lakes) c.p.path(c.geometry.lakes, { fill: c.look.water, stroke: c.look.coast, strokeWidth: 0.45 / s, transform: [s, 0, 0, s, ox, oy] });
  };
  if (clip) c.p.group({ clip: rectD(clip) }, draw);
  else draw();
}

/** A framed poster hanging on a plain wall. */
export async function framed(poster: { png: Buffer; w: number; h: number }, x: number, y: number, frame: string, frameW: number, mat: number): Promise<Overlay[]> {
  const ow = poster.w + (frameW + mat) * 2;
  const oh = poster.h + (frameW + mat) * 2;
  const p2 = new Painter(fonts);
  p2.rect(0, 0, ow, oh, { fill: frame });
  p2.rect(frameW, frameW, ow - frameW * 2, oh - frameW * 2, { fill: '#FBFAF6' });
  // A hint of the mat's bevel.
  p2.rect(frameW + mat - 2, frameW + mat - 2, poster.w + 4, poster.h + 4, { fill: '#E9E5DC' });
  const framePng = await toPng(sceneOf(p2, 'none', ow, oh), Math.round(ow * PX));
  return [
    { png: framePng, x, y, w: ow, h: oh, shadow: 16 },
    { png: poster.png, x: x + frameW + mat, y: y + frameW + mat, w: poster.w, h: poster.h, shadow: false },
  ];
}

// ------------------------------------------------------------------ pins

export interface PinCopy {
  file: string;
  day: number;
  time: string;
  title: string;
  description: string;
  link: string;
  board: string;
  alt: string;
  tags: string[];
}

export interface Pin {
  id: string;
  theme: Theme;
  draw: (p: Painter, t: Theme) => Promise<Layers | void>;
  copy: Omit<PinCopy, 'file' | 'day' | 'time'>;
}

export const BOARD = {
  canadaChecklists: 'Canada Travel Checklists & Printables',
  checklists: 'Travel Checklists & Bucket Lists',
  canadaBucket: 'Canada Bucket List & Road Trips',
  posters: 'Travel Map Posters & Wall Art',
};

export async function render(pin: Pin): Promise<Buffer> {
  const t = pin.theme;
  const p = new Painter(fonts);
  p.rect(0, 0, W, H, { fill: t.paper });
  const layers = (await pin.draw(p, t)) ?? {};
  const base = await toPng(sceneOf(p, t.paper), W * PX);
  const composite: OverlayOptions[] = [];
  for (const o of layers.overlays ?? []) {
    if (o.shadow !== false) {
      const s = await shadowPng(Math.round(o.w * PX), Math.round(o.h * PX), (o.shadow ?? 16) * PX, 0.3);
      composite.push({ input: s.input, left: Math.round(o.x * PX - s.pad), top: Math.round(o.y * PX - s.pad) });
    }
    composite.push({ input: o.png, left: Math.round(o.x * PX), top: Math.round(o.y * PX) });
  }
  if (layers.over) {
    const q = new Painter(fonts);
    layers.over(q);
    composite.push({ input: await toPng(sceneOf(q), W * PX), left: 0, top: 0 });
  }
  return sharp(base).composite(composite).png({ compressionLevel: 9 }).toBuffer();
}

const TIMES = ['17:00', '18:00', '19:00'];

/**
 * Renders a week: `schedule` is one list of pins per day, posted at 5, 6 and 7 pm. Writes the PNGs
 * and pins.json (the copy for every pin) to `out`. With `only`, renders just those pins (by id or
 * number) but still writes the copy for all of them.
 */
export async function buildWeek(schedule: Pin[][], out: string, only?: string[]): Promise<void> {
  await mkdir(out, { recursive: true });
  const copies: PinCopy[] = [];
  let n = 0;
  for (const [day, pins] of schedule.entries()) {
    for (const [slot, pin] of pins.entries()) {
      n++;
      const file = `${String(n).padStart(2, '0')}-${pin.id}.png`;
      copies.push({ file, day: day + 1, time: TIMES[slot], ...pin.copy });
      if (only && !only.includes(pin.id) && !only.includes(String(n))) continue;
      const png = await render(pin);
      await writeFile(`${out}/${file}`, png);
      console.log(file, `${(png.length / 1024).toFixed(0)} KB`);
    }
  }
  await writeFile(`${out}/pins.json`, JSON.stringify(copies, null, 2));
}
