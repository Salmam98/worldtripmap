/**
 * Pinterest pins, second week: 21 pins at 2000 × 3000, three a day for seven days.
 *
 *   npx tsx scripts/marketing/build-pins-week2.ts <out-dir> [pin-id,pin-id…]
 *
 * Every pin is drawn with the site's own maps, poster engine, checklist sheets and fonts, and every
 * figure on a pin comes from the site's data files or from the guide the pin links to:
 *   - provinces: src/data/definitions/canada.ts (Atlas of Canada areas, 2021 Census populations)
 *   - metro areas: CMA_POPULATION_2021 in src/data/definitions/canada-cities.ts (2021 Census)
 *   - national parks: src/data/definitions/canada-places.ts
 *   - land areas: src/data/reference/land-area.ts (World Bank, 2022)
 *   - country counts, travel rules and print sizes: the guides in src/content/guides/
 * The copy for each pin (title, description, link, board, alt text) is written to pins.json.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp, { type OverlayOptions } from 'sharp';
import { CANADA, CANADA_REGIONS, CANADA_TOTAL_AREA_KM2 } from '../../src/data/definitions/canada';
import { CANADA_CITIES, CANADA_POPULATION_2021, CMA_POPULATION_2021, CMA_POPULATION_2021_TOTAL } from '../../src/data/definitions/canada-cities';
import { CANADA_PLACES } from '../../src/data/definitions/canada-places';
import { WORLD, WORLD_UNITS } from '../../src/data/definitions/world';
import { LAND_KM2, WORLD_LAND_KM2 } from '../../src/data/reference/land-area';
import { SAMPLES } from '../../src/data/samples';
import { CHECKLIST_FONTS, checklistSheet } from '../../src/lib/guides/checklist-pdf';
import { parksChecklist } from '../../src/lib/guides/checklists';
import { sheetToScene } from '../../src/lib/guides/sheet';
import { computeAchievements } from '../../src/lib/maps/achievements';
import { computeStats } from '../../src/lib/maps/stats';
import { normalizeSelection } from '../../src/lib/maps/store';
import type { MapDefinition, MapGeoMeta, MapGeometry } from '../../src/lib/maps/types';
import { composePoster, drawMap, fontsFor } from '../../src/lib/poster/compose';
import type { Ctx, PlacedMap } from '../../src/lib/poster/context';
import { loadFonts, type FontSet } from '../../src/lib/poster/fonts';
import { getFormat } from '../../src/lib/poster/formats';
import { Painter, type TextSpec } from '../../src/lib/poster/painter';
import { sceneToSvg } from '../../src/lib/poster/render-svg';
import type { Scene } from '../../src/lib/poster/scene';
import { defaultSettings, type PosterSettings, type TemplateId } from '../../src/lib/poster/settings';
import { TEMPLATES } from '../../src/lib/poster/templates';

const OUT = process.argv[2] ?? 'pins-week2';
const ONLY = process.argv[3]?.split(',');
const W = 1000;
const H = 1500;
const M = 72;
/** Pixels per layout unit: pins are laid out at 1000 × 1500 and saved at twice that. */
const PX = 2;
const SITE = 'https://worldtripmap.com';

type Rect = { x: number; y: number; w: number; h: number };

// ------------------------------------------------------------------ themes

interface Theme {
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

const NAVY: Theme = { paper: '#101B2D', ink: '#F4EFE3', soft: '#A9B3C1', accent: '#E0B252', onAccent: '#101B2D', land: '#22334F', coast: '#4E5F7E', line: '#26365A', card: '#17253C' };
const PAPER: Theme = { paper: '#F6F3EC', ink: '#14202F', soft: '#586474', accent: '#C0392B', onAccent: '#FFFFFF', land: '#E3DDCF', coast: '#B9B09D', line: '#DED7C9', card: '#FFFFFF' };
const CREAM: Theme = { paper: '#F4EEE2', ink: '#101B2D', soft: '#4F5B6B', accent: '#C0532F', onAccent: '#FFFFFF', land: '#E2DACA', coast: '#BDB29C', line: '#E0D7C6', card: '#FFFDF8' };
const SAND: Theme = { paper: '#EFE7D4', ink: '#2E2A24', soft: '#655C4C', accent: '#2F6B5B', onAccent: '#FFFFFF', land: '#DCCFB2', coast: '#B8A988', line: '#DDD1B7', card: '#F9F4E8' };
const FOREST: Theme = { paper: '#1D3A31', ink: '#F2EDE1', soft: '#B5C3B8', accent: '#E0B252', onAccent: '#1D3A31', land: '#2B4C42', coast: '#4F7366', line: '#2A4A40', card: '#23443A' };
/** Plain walls for framed posters. */
const GREIGE: Theme = { ...PAPER, paper: '#DCD6CA', accent: '#14202F', onAccent: '#F4EFE3', soft: '#4F5866' };
const BLUSH: Theme = { ...CREAM, paper: '#E9DCCB', accent: '#8C3B22', soft: '#5E5246' };

// ------------------------------------------------------------------ data

const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const MAPS = {
  canada: { def: CANADA, meta: (await json('src/data/maps/canada.meta.json')) as MapGeoMeta, geometry: (await json('src/data/maps/canada.display.json')) as MapGeometry },
  world: { def: WORLD, meta: (await json('src/data/maps/world.meta.json')) as MapGeoMeta, geometry: (await json('src/data/maps/world.display.json')) as MapGeometry },
};
const CITY_POINTS = (await json('src/data/maps/canada-cities.points.json')).points as Record<string, [number, number]>;
const region = (id: string) => CANADA_REGIONS.find((r) => r.id === id)!;
const city = (id: string) => CANADA_CITIES.find((c) => c.id === id)!;
const areaShare = (ids: string[]) => (ids.reduce((sum, id) => sum + region(id).areaKm2, 0) / CANADA_TOTAL_AREA_KM2) * 100;
const fmt = (n: number) => n.toLocaleString('en-CA');

const fonts = await loadFonts(['dmserif-400', 'dmserif-400i', 'manrope-500', 'manrope-700', 'caveat-600']);

// ------------------------------------------------------------------ rendering

const svgToPng = (svg: string) => sharp(Buffer.from(svg), { limitInputPixels: false }).png().toBuffer();
const sceneOf = (p: Painter, background = 'none'): Scene => ({ width: W, height: H, bleed: 0, background, nodes: p.nodes, description: '' });
const toPng = (scene: Scene, widthPx: number) => svgToPng(sceneToSvg(scene, { pixelWidth: widthPx }));

interface Overlay {
  png: Buffer;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Blur of the shadow beneath, in layout units; false for none. */
  shadow?: number | false;
}
interface Layers {
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
async function posterPng(settings: Partial<PosterSettings>, map: 'canada' | 'world', visited: string[], wishlist: string[], w: number) {
  const { def, meta, geometry } = MAPS[map];
  const full = { ...defaultSettings(def), ...settings };
  const format = getFormat(full.format);
  const scene = composePoster({ def, meta, geometry, selection: normalizeSelection(def, visited, wishlist), settings: full, format }, await loadFonts(fontsFor(full)));
  const png = await toPng(scene, Math.round(w * PX));
  return { png, w, h: (w * format.height) / format.width };
}

// ------------------------------------------------------------------ type

const serif = (size: number, fill: string, extra: Partial<TextSpec> = {}): TextSpec => ({ font: 'dmserif-400', size, fill, tracking: -8, ...extra });
const sans = (size: number, fill: string, extra: Partial<TextSpec> = {}): TextSpec => ({ font: 'manrope-500', size, fill, ...extra });
const bold = (size: number, fill: string, extra: Partial<TextSpec> = {}): TextSpec => ({ font: 'manrope-700', size, fill, ...extra });
const hand = (size: number, fill: string, extra: Partial<TextSpec> = {}): TextSpec => ({ font: 'caveat-600', size, fill, ...extra });

function brand(p: Painter, t: Theme, x: number, y: number, scale = 1): void {
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

function kicker(p: Painter, text: string, x: number, y: number, fill: string, anchor: 'start' | 'middle' | 'end' = 'start'): void {
  p.text(text, x, y, bold(21, fill, { tracking: 170, upper: true, anchor }));
}

/** Big serif lines, shrunk until the widest fits. Returns the baseline of the last line. */
function headline(p: Painter, lines: string[], x: number, top: number, spec: TextSpec, maxW = W - M * 2, min = 52, lead = 1.04): number {
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
function para(p: Painter, text: string, x: number, y: number, spec: TextSpec, maxW: number, lead = 1.38, maxLines = 6): number {
  const lines = p.wrap(text, spec, maxW, maxLines);
  lines.forEach((line, i) => p.text(line, x, y + i * spec.size * lead, spec));
  return y + (lines.length - 1) * spec.size * lead;
}

function pill(p: Painter, t: Theme, text: string, x: number, baseline: number, fill = t.accent, ink = t.onAccent): number {
  const spec = bold(29, ink);
  const w = p.measure(text, spec) + 62;
  p.path(roundRect(x, baseline - 45, w, 68, 34), { fill });
  p.text(text, x + 31, baseline, spec);
  return w;
}

function footer(p: Painter, t: Theme, cta: string, y = H - 104, fill = t.accent, ink = t.onAccent): void {
  pill(p, t, cta, M, y, fill, ink);
  p.text('worldtripmap.com', W - M, y - 3, bold(23, t.soft, { tracking: 70, anchor: 'end' }));
}

function note(p: Painter, text: string, x: number, y: number, fill: string, anchor: 'start' | 'middle' | 'end' = 'start', size = 19): void {
  p.text(text, x, y, sans(size, fill, { anchor }));
}

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}
const rectD = (r: Rect) => `M${r.x} ${r.y}H${r.x + r.w}V${r.y + r.h}H${r.x}Z`;

function tick(p: Painter, x: number, y: number, size: number, stroke: string, width = 3.2): void {
  p.path(`M${x - size * 0.5} ${y}L${x - size * 0.12} ${y + size * 0.38}L${x + size * 0.55} ${y - size * 0.42}`, { stroke, strokeWidth: width, lineCap: 'round', lineJoin: 'round' });
}
function cross(p: Painter, x: number, y: number, size: number, stroke: string, width = 3.2): void {
  const s = size * 0.4;
  p.path(`M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}`, { stroke, strokeWidth: width, lineCap: 'round' });
}
/** A hand-drawn arrow: a gentle curve with an open head at the end. */
function arrow(p: Painter, x1: number, y1: number, x2: number, y2: number, stroke: string, bend = 0.25, width = 2.4): void {
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend;
  const my = (y1 + y2) / 2 + (x2 - x1) * bend;
  p.path(`M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`, { stroke, strokeWidth: width, lineCap: 'round' });
  const a = Math.atan2(y2 - my, x2 - mx);
  const l = 13;
  p.path(`M${x2 - l * Math.cos(a - 0.45)} ${y2 - l * Math.sin(a - 0.45)}L${x2} ${y2}L${x2 - l * Math.cos(a + 0.45)} ${y2 - l * Math.sin(a + 0.45)}`, { stroke, strokeWidth: width, lineCap: 'round', lineJoin: 'round' });
}

// ------------------------------------------------------------------ maps

interface MapOptions {
  visited?: string[];
  wishlist?: string[];
  template?: TemplateId;
  labels?: boolean;
  look?: Record<string, unknown>;
}

function mapCtx(p: Painter, id: 'canada' | 'world', t: Theme, o: MapOptions = {}): Ctx {
  const { def, meta, geometry } = MAPS[id];
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
  const selection = normalizeSelection(def as MapDefinition, o.visited ?? [], o.wishlist ?? []);
  return {
    p, W, H, bleed: 0, def, meta, geometry, selection, settings, format: getFormat('print'),
    stats: computeStats(def, selection), places: null, achievements: computeAchievements(def, selection),
    look: look as Ctx['look'], template: tpl, top: 0, bottom: H, corners: [],
  };
}

/** Draws a map into `rect`, enlarged `k` times (labels and lines grow with it). */
function placeMap(c: Ctx, rect: Rect, k = 1): PlacedMap {
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
function placeCrop(c: Ctx, win: Rect, region: [number, number, number, number]): PlacedMap {
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

interface Pin {
  id: string;
  theme: Theme;
  draw: (p: Painter, t: Theme) => Promise<Layers | void>;
  copy: Omit<PinCopy, 'file' | 'day' | 'time'>;
}

const BOARD = {
  canadaChecklists: 'Canada Travel Checklists & Printables',
  checklists: 'Travel Checklists & Bucket Lists',
  canadaBucket: 'Canada Bucket List & Road Trips',
  posters: 'Travel Map Posters & Wall Art',
};

const PARKS = CANADA_PLACES.places.filter((pl) => pl.kind === 'park' && pl.id !== 'rouge');
const PARKS_BY_REGION = CANADA_REGIONS.map((r) => ({ region: r, count: PARKS.filter((pl) => pl.within === r.id).length })).sort(
  (a, b) => b.count - a.count || b.region.areaKm2 - a.region.areaKm2,
);
const TERRITORIES = ['CA-YT', 'CA-NT', 'CA-NU'];
const NORTH_POP = TERRITORIES.reduce((s, id) => s + region(id).population2021, 0);
const METRO_SHARE = (CMA_POPULATION_2021_TOTAL / CANADA_POPULATION_2021) * 100;
const WORLD_A = SAMPLES.find((s) => s.id === 'world-midnight-atlas')!.visited;
const pct = (n: number, d = 195, digits = 1) => `${((n / d) * 100).toFixed(digits)}%`;

// 1 ─ National parks checklist, close up ------------------------------------------------------
const parksCloseUp: Pin = {
  id: 'national-parks-checklist-closeup',
  theme: FOREST,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Free printable · Letter and A4', M, 196, t.accent);
    const y = headline(p, ['Tick off all 48', 'national parks'], M, 212, serif(98, t.ink));
    para(p, 'Every national park and park reserve in Canada, by province, on one page.', M, y + 62, sans(30, t.soft), W - M * 2, 1.35, 2);
    // The sheet itself, tucked under the footer band.
    const cf = await loadFonts(CHECKLIST_FONTS);
    const layout = checklistSheet(parksChecklist(), 'letter', cf);
    const sw = 780;
    const sh = sw * (792 / 612);
    const top = 590;
    const band = H - 190;
    const full = await toPng(sheetToScene(layout.sheet, cf, layout.description), Math.round(sw * PX));
    const visible = band - top;
    const png = await sharp(full).extract({ left: 0, top: 0, width: Math.round(sw * PX), height: Math.round(Math.min(sh, visible) * PX) }).png().toBuffer();
    return {
      overlays: [{ png, x: (W - sw) / 2, y: top, w: sw, h: visible, shadow: 18 }],
      over: (q) => {
        q.rect(0, band, W, H - band, { fill: t.paper });
        q.line(M, band, W - M, band, { stroke: t.accent, strokeWidth: 2 });
        footer(q, t, 'Get the free PDF  →', H - 82);
        q.text('48 boxes, one page', W - 150, 548, hand(42, t.accent, { anchor: 'middle' }));
        arrow(q, W - 170, 562, W - 212, 630, t.accent, -0.3);
      },
    };
  },
  copy: {
    title: 'Canada National Parks Checklist: Tick Off All 48 (Free Printable)',
    description:
      'A free one-page checklist of every national park and national park reserve in Canada, 48 in all, grouped by province with a box to tick beside each. Download the PDF in Letter or A4, print it, and plan your next Canada road trip. #canadatravel #nationalparks #bucketlist',
    link: `${SITE}/guides/canada-national-parks-checklist/`,
    board: BOARD.canadaChecklists,
    alt: 'A printable checklist of Canada’s 48 national parks, grouped by province, with a box to tick beside each.',
    tags: ['Canada travel', 'National parks', 'Printables'],
  },
};

// 2 ─ What percentage of the world ------------------------------------------------------------
const percentOfWorld: Pin = {
  id: 'percent-of-the-world',
  theme: PAPER,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'The quick maths', M, 196, t.accent);
    const y = headline(p, ['What percentage', 'of the world have', 'you visited?'], M, 212, serif(94, t.ink));
    // The sum.
    const fy = y + 96;
    p.text('countries you’ve visited  ÷  195  ×  100', M, fy, serif(40, t.ink, { font: 'dmserif-400i', tracking: 0 }));
    p.line(M, fy + 34, W - M, fy + 34, { stroke: t.line, strokeWidth: 1.5 });
    // A ladder of real values, each bar drawn to scale.
    const rows = [10, 20, 50, 98, 195];
    const top = fy + 112;
    const rowH = 118;
    const barX = M + 250;
    const barW = W - M - barX - 150;
    rows.forEach((n, i) => {
      const cy = top + i * rowH;
      p.text(String(n), M, cy + 22, serif(70, t.ink, { tracking: -10 }));
      p.text('countries', M + p.measure(String(n), serif(70, t.ink, { tracking: -10 })) + 12, cy + 20, sans(23, t.soft));
      p.path(roundRect(barX, cy - 7, barW, 14, 7), { fill: t.land });
      p.path(roundRect(barX, cy - 7, Math.max(14, (barW * n) / 195), 14, 7), { fill: t.accent });
      const label = n === 195 ? '100%' : pct(n);
      p.text(label, W - M, cy + 20, serif(54, t.accent, { anchor: 'end', tracking: -6 }));
    });
    note(p, '195 = the 193 UN member states plus its 2 observer states.', M, top + rows.length * rowH - 30, t.soft, 'start', 21);
    footer(p, t, 'Work out mine  →');
  },
  copy: {
    title: 'What Percentage of the World Have You Visited? (The Easy Formula)',
    description:
      'Divide the countries you have visited by 195 and multiply by 100. Twenty countries is 10.3% of the world, fifty is 25.6%, and you need 98 to pass half. See the full table, why land area gives a different answer, and work out your own number. #travelgoals #countriesvisited #travelbucketlist',
    link: `${SITE}/guides/what-percentage-of-the-world-have-you-visited/`,
    board: BOARD.checklists,
    alt: 'A chart showing that 10 countries is 5.1% of the world, 20 is 10.3%, 50 is 25.6%, 98 is 50.3% and 195 is 100%.',
    tags: ['Travel goals', 'Travel bucket list', 'World travel'],
  },
};

/** A framed poster hanging on a plain wall. */
async function framed(p: Painter, t: Theme, poster: { png: Buffer; w: number; h: number }, x: number, y: number, frame: string, frameW: number, mat: number): Promise<Overlay[]> {
  const ow = poster.w + (frameW + mat) * 2;
  const oh = poster.h + (frameW + mat) * 2;
  const p2 = new Painter(fonts);
  p2.rect(0, 0, ow, oh, { fill: frame });
  p2.rect(frameW, frameW, ow - frameW * 2, oh - frameW * 2, { fill: '#FBFAF6' });
  // A hint of the mat's bevel.
  p2.rect(frameW + mat - 2, frameW + mat - 2, poster.w + 4, poster.h + 4, { fill: '#E9E5DC' });
  const framePng = await toPng({ width: ow, height: oh, bleed: 0, background: 'none', nodes: p2.nodes, description: '' }, Math.round(ow * PX));
  return [
    { png: framePng, x, y, w: ow, h: oh, shadow: 16 },
    { png: poster.png, x: x + frameW + mat, y: y + frameW + mat, w: poster.w, h: poster.h, shadow: false },
  ];
}

// 3 ─ World poster, framed ---------------------------------------------------------------------
const worldPosterFramed: Pin = {
  id: 'world-map-poster-framed',
  theme: GREIGE,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Wall art you make yourself', M, 196, t.soft);
    headline(p, ['Every country', 'you’ve been to,', 'framed.'], M, 212, serif(100, t.ink));
    const sample = SAMPLES.find((s) => s.id === 'world-midnight-atlas')!;
    const poster = await posterPng(sample.settings, 'world', sample.visited, sample.wishlist, 720);
    const frameW = 16;
    const mat = 50;
    const ow = poster.w + (frameW + mat) * 2;
    const overlays = await framed(p, t, poster, (W - ow) / 2, 590, '#1E1F22', frameW, mat);
    const below = 590 + poster.h + (frameW + mat) * 2;
    note(p, 'Midnight Atlas design, shown with sample data', W / 2, below + 44, t.soft, 'middle', 20);
    footer(p, t, 'Design my poster  →');
    return { overlays };
  },
  copy: {
    title: 'World Travel Map Poster: Every Country You’ve Been To, Framed',
    description:
      'Make a personalised world map poster of the countries you have visited. Colour them in, add a title, pick one of four designs and download a print-ready PDF. Free, no sign-up. A thoughtful gift for any traveller. #travelposter #worldmap #wallart #travelgifts',
    link: `${SITE}/travel-map-poster/`,
    board: BOARD.posters,
    alt: 'A dark navy world map poster with visited countries in gold, in a black frame with a white mat.',
    tags: ['Travel poster', 'Wall art', 'World map'],
  },
};

// 4 ─ Toronto, Montréal and Vancouver ----------------------------------------------------------
const bigThree: Pin = {
  id: 'toronto-montreal-vancouver',
  theme: CREAM,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Canada by the numbers', M, 196, t.accent);
    const y = headline(p, ['Been to Toronto,', 'Montréal and', 'Vancouver?'], M, 212, serif(96, t.ink));
    const visited = ['CA-ON', 'CA-QC', 'CA-BC'];
    const c = mapCtx(p, 'canada', t, { visited });
    const placed = placeMap(c, { x: 40, y: y + 34, w: W - 80, h: 600 });
    for (const [id, dx, dy, anchor] of [
      ['toronto', -14, 34, 'end'],
      ['montreal', 16, 34, 'start'],
      ['vancouver', 14, 36, 'start'],
    ] as const) {
      const [x, yy] = placed.at(...CITY_POINTS[id]);
      p.circle(x, yy, 8, { fill: t.ink, stroke: t.paper, strokeWidth: 3 });
      p.text(city(id).name, x + dx, yy + dy, bold(24, t.ink, { anchor }));
    }
    const share = Math.round(areaShare(visited));
    const statsY = y + 730;
    p.line(M, statsY - 70, W - M, statsY - 70, { stroke: t.line, strokeWidth: 1.5 });
    p.text('3 of 13', M, statsY + 20, serif(84, t.ink, { tracking: -10 }));
    note(p, 'provinces and territories', M, statsY + 62, t.soft, 'start', 24);
    p.text(`${share}%`, W - M, statsY + 20, serif(84, t.accent, { anchor: 'end', tracking: -10 }));
    note(p, 'of Canada, by area', W - M, statsY + 62, t.soft, 'end', 24);
    return {
      over: (q) => {
        q.text(`${100 - share}% still to go`, 700, y + 150, hand(46, t.accent, { anchor: 'middle' }));
        arrow(q, 640, y + 172, 560, y + 260, t.accent, 0.25);
        footer(q, t, 'Colour in your Canada  →');
      },
    };
  },
  copy: {
    title: 'Been to Toronto, Montréal and Vancouver? That’s 36% of Canada',
    description:
      'Ontario, Quebec and British Columbia are 3 of Canada’s 13 provinces and territories and 36% of its area, so there is a lot of Canada left to see. Colour in the provinces you have visited on a free Canada map and see your own numbers. #canadatravel #canada #bucketlist',
    link: `${SITE}/maps/canada/`,
    board: BOARD.canadaBucket,
    alt: 'A map of Canada with Ontario, Quebec and British Columbia coloured in, and Toronto, Montréal and Vancouver marked: 3 of 13, 36% of Canada by area.',
    tags: ['Canada travel', 'Canada map', 'Bucket list'],
  },
};

// 5 ─ How many countries are there ------------------------------------------------------------
const howManyCountries: Pin = {
  id: 'how-many-countries-are-there',
  theme: NAVY,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'It depends who’s counting', M, 196, t.accent);
    const y = headline(p, ['How many', 'countries are', 'there?'], M, 212, serif(104, t.ink));
    const rows: [string, string, boolean][] = [
      ['193', 'Member states of the United Nations', false],
      ['195', 'UN members plus the Holy See and Palestine. The usual answer.', true],
      ['211', 'Member associations of FIFA, football’s world body', false],
      ['249', 'Countries and areas with an ISO 3166-1 code', false],
      ['330', 'The Travelers’ Century Club list (2022)', false],
    ];
    const top = y + 70;
    const rowH = 150;
    rows.forEach(([n, what, main], i) => {
      const ry = top + i * rowH;
      if (main) p.path(roundRect(M - 24, ry - 4, W - M * 2 + 48, rowH - 14, 14), { fill: t.card });
      p.text(n, M, ry + 96, serif(104, main ? t.accent : t.ink, { tracking: -12 }));
      para(p, what, M + 250, ry + 56, (main ? bold : sans)(27, main ? t.ink : t.soft), W - M - (M + 250) - 4, 1.32, 2);
      if (i < rows.length - 1 && !main && !rows[i + 1][2]) p.line(M, ry + rowH - 8, W - M, ry + rowH - 8, { stroke: t.line, strokeWidth: 1.5 });
    });
    footer(p, t, 'Why lists disagree  →');
  },
  copy: {
    title: 'How Many Countries Are There? 193, 195, 211, 249 or 330',
    description:
      'The usual answer is 195: the 193 United Nations member states plus the Holy See and Palestine. FIFA has 211 members, ISO gives codes to 249 places, and the Travelers’ Century Club listed 330 in 2022. Here is where each number comes from and which to use for your travel count. #travel #countries #travelfacts',
    link: `${SITE}/guides/how-many-countries-are-there/`,
    board: BOARD.checklists,
    alt: 'Five ways to count countries: 193 UN members, 195 with the two observer states, 211 FIFA members, 249 ISO codes and 330 on the Travelers’ Century Club list.',
    tags: ['Travel facts', 'Countries', 'World travel'],
  },
};

// 6 ─ Four steps ---------------------------------------------------------------------------------
const fourSteps: Pin = {
  id: 'make-a-travel-map-4-steps',
  theme: SAND,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Free · no account needed', M, 196, t.accent);
    const y = headline(p, ['Make a map of', 'everywhere', 'you’ve been'], M, 212, serif(96, t.ink));
    const steps = [
      ['Pick a map', 'The world, Canada, or Canadian cities.'],
      ['Tap where you’ve been', 'Each place fills in as you go.'],
      ['Add your bucket list', 'Places you want to go get stripes.'],
      ['Make it a poster', 'Pick a design, download a PNG or PDF.'],
    ];
    const top = y + 60;
    const rowH = 196;
    const thumb: Rect = { x: W - M - 250, y: 0, w: 250, h: 160 };
    const overlays: Overlay[] = [];
    for (const [i, [title, text]] of steps.entries()) {
      const ry = top + i * rowH;
      p.circle(M + 30, ry + 52, 30, { fill: t.accent });
      p.text(String(i + 1), M + 30, ry + 65, serif(38, t.onAccent, { anchor: 'middle', tracking: 0 }));
      p.text(title, M + 82, ry + 50, bold(32, t.ink));
      para(p, text, M + 82, ry + 92, sans(24, t.soft), thumb.x - (M + 82) - 24, 1.3, 2);
      const box = { ...thumb, y: ry };
      p.path(roundRect(box.x, box.y, box.w, box.h, 12), { fill: t.card });
      const inner = { x: box.x + 12, y: box.y + 10, w: box.w - 24, h: box.h - 20 };
      if (i === 0) placeMap(mapCtx(p, 'world', t, { look: { sphereLine: t.coast } }), inner);
      if (i === 1) placeMap(mapCtx(p, 'canada', t, { visited: ['CA-BC', 'CA-AB', 'CA-ON', 'CA-QC'], look: { graticule: undefined } }), inner);
      if (i === 2) placeMap(mapCtx(p, 'canada', t, { visited: ['CA-BC', 'CA-AB', 'CA-ON', 'CA-QC'], wishlist: ['CA-NU', 'CA-NL', 'CA-YT'], look: { graticule: undefined } }), inner);
      if (i === 3) {
        const sample = SAMPLES.find((s) => s.id === 'canada-modern-cartographer')!;
        const poster = await posterPng(sample.settings, 'canada', sample.visited, sample.wishlist, 112);
        overlays.push({ png: poster.png, x: box.x + (box.w - poster.w) / 2, y: box.y + (box.h - poster.h) / 2, w: poster.w, h: poster.h, shadow: 5 });
      }
      if (i < steps.length - 1) p.line(M + 30, ry + 90, M + 30, ry + rowH + 14, { stroke: t.accent, strokeWidth: 2, dash: [3, 7], lineCap: 'round' });
    }
    footer(p, t, 'Start my map  →');
    return { overlays };
  },
  copy: {
    title: 'How to Make a Map of Places You’ve Visited (4 Easy Steps)',
    description:
      'Make a map of everywhere you have been in four steps: pick a map, tap the places you have visited, add your bucket list, then turn it into a poster. Free, with no account, and your map saves in your browser. #travelmap #travelplanning #bucketlist',
    link: `${SITE}/guides/how-to-make-a-map-of-places-youve-visited/`,
    board: BOARD.posters,
    alt: 'Four steps to a travel map: pick a map, tap where you have been, add your bucket list with stripes, and make it a poster.',
    tags: ['Travel map', 'Travel planning', 'Bucket list'],
  },
};

// 7 ─ The North --------------------------------------------------------------------------------
const theNorth: Pin = {
  id: 'canada-the-north',
  theme: NAVY,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    const c = mapCtx(p, 'canada', t, { visited: TERRITORIES, template: 'midnight-atlas', look: { graticule: '#1A2944' } });
    placeMap(c, { x: 30, y: 150, w: W - 60, h: 720 }, 1.45);
    const y = 930;
    kicker(p, 'Yukon · Northwest Territories · Nunavut', M, y, t.accent);
    p.text(`${Math.round(areaShare(TERRITORIES))}% of Canada.`, M, y + 112, serif(104, t.ink, { tracking: -12 }));
    p.text('0.3% of Canadians.', M, y + 222, serif(104, t.accent, { tracking: -12 }));
    para(p, `Canada’s three territories are home to ${fmt(NORTH_POP)} people, fewer than live in Saskatoon or Regina.`, M, y + 298, sans(29, t.soft), W - M * 2, 1.35, 2);
    note(p, 'Areas include fresh water. Populations from the 2021 Census.', M, H - 178, t.soft, 'start', 19);
    footer(p, t, 'Canada’s 13, explained  →');
  },
  copy: {
    title: 'Canada’s North: 39% of the Country, 0.3% of Canadians',
    description:
      'Yukon, the Northwest Territories and Nunavut cover about 39% of Canada and are home to about 0.3% of its people: 118,160 at the 2021 Census. See all 13 provinces and territories with their capitals, sizes and populations. #canada #yukon #nunavut #canadatravel',
    link: `${SITE}/guides/canada-provinces-and-territories/`,
    board: BOARD.canadaBucket,
    alt: 'A map of Canada with Yukon, the Northwest Territories and Nunavut in gold: 39% of Canada’s area and 0.3% of its people.',
    tags: ['Canada', 'Yukon', 'Nunavut'],
  },
};

// 8 ─ Is Greenland a country? ----------------------------------------------------------------
const greenland: Pin = {
  id: 'is-greenland-a-country',
  theme: PAPER,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Travel map questions', M, 196, t.accent);
    const y = headline(p, ['Is Greenland', 'a country?'], M, 212, serif(110, t.ink));
    const win: Rect = { x: 0, y: y + 44, w: W, h: 580 };
    const c = mapCtx(p, 'world', t, { visited: ['GRL'], look: { sphereLine: t.paper } });
    const grl = MAPS.world.meta.features.GRL.bbox;
    const placed = placeCrop(c, win, [grl[0] - 250, grl[1] - 40, grl[2] + 250, grl[3] + 260]);
    const [gx, gy] = placed.at(...MAPS.world.meta.features.GRL.label);
    p.text('GREENLAND', gx, gy + 8, bold(24, t.onAccent, { anchor: 'middle', tracking: 160 }));
    const top = win.y + win.h + 108;
    p.text('No.', M, top, serif(150, t.accent, { tracking: -12 }));
    para(p, 'It’s a self-governing territory within the Kingdom of Denmark. On a travel map, count it on its own line, as a territory.', M + 250, top - 78, sans(29, t.ink), W - M - (M + 250), 1.36, 4);
    footer(p, t, 'Puerto Rico? Hong Kong?  →');
  },
  copy: {
    title: 'Is Greenland a Country? (And How to Count It on Your Travel Map)',
    description:
      'Greenland is not an independent country: it is a self-governing territory within the Kingdom of Denmark. Puerto Rico and Hong Kong are in a similar position. See what 42 places like them are, and how to count them on a travel map without arguments. #travelfacts #greenland #travel',
    link: `${SITE}/guides/what-counts-as-a-country/`,
    board: BOARD.checklists,
    alt: 'A map of the North Atlantic with Greenland highlighted in red, and the answer: no, it is a self-governing territory within the Kingdom of Denmark.',
    tags: ['Travel facts', 'Greenland', 'World map'],
  },
};

// 9 ─ A gift poster --------------------------------------------------------------------------------
const giftPoster: Pin = {
  id: 'travel-map-gift-poster',
  theme: BLUSH,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'A gift idea for travellers', M, 196, t.accent);
    headline(p, ['A map of every', 'place you’ve', 'been together'], M, 212, serif(94, t.ink));
    const visited = ['CA-BC', 'CA-AB', 'CA-ON', 'CA-QC', 'CA-NS', 'CA-PE', 'CA-NB'];
    const poster = await posterPng(
      { template: 'travel-journal', format: 'print', title: 'Places We’ve Been', name: 'Sample travellers', dates: '2014–2026', caption: 'Every road led somewhere good.' },
      'canada',
      visited,
      [],
      430,
    );
    const frameW = 18;
    const mat = 44;
    const ow = poster.w + (frameW + mat) * 2;
    const overlays = await framed(p, t, poster, (W - ow) / 2, 560, '#9C7A52', frameW, mat);
    note(p, 'Travel Journal design, shown with sample data', W / 2, 560 + poster.h + (frameW + mat) * 2 + 42, t.soft, 'middle', 20);
    footer(p, t, 'Design one for free  →');
    return { overlays };
  },
  copy: {
    title: 'Personalised Travel Map Gift: Places We’ve Been Poster',
    description:
      'A gift for the traveller in your life: a poster of the places you have been together. Colour in the map, add your own title and dates, choose a design and download a print-ready PDF to print at home or at any print shop. Free to make. #giftideas #travelgifts #couplesgifts #travelposter',
    link: `${SITE}/travel-map-poster/`,
    board: BOARD.posters,
    alt: 'A framed Travel Journal style poster of Canada titled Places We’ve Been, with seven provinces coloured in green.',
    tags: ['Travel gifts', 'Personalized gifts', 'Travel poster'],
  },
};

// 10 ─ Provinces by size -----------------------------------------------------------------------
const provincesBySize: Pin = {
  id: 'canada-provinces-by-size',
  theme: PAPER,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Biggest to smallest', M, 196, t.accent);
    const y = headline(p, ['Canada’s provinces', 'and territories', 'by size'], M, 212, serif(90, t.ink));
    const rows = [...CANADA_REGIONS].sort((a, b) => b.areaKm2 - a.areaKm2);
    const top = y + 74;
    const rowH = 58;
    const nameW = 300;
    const barX = M + nameW;
    const barMax = W - M - barX - 230;
    const max = rows[0].areaKm2;
    const terr = '#14202F';
    rows.forEach((r, i) => {
      const cy = top + i * rowH;
      p.text(r.name === 'Newfoundland and Labrador' ? 'Newfoundland & Lab.' : r.name, M, cy + 8, bold(22, t.ink));
      const bw = Math.max(3, (barMax * r.areaKm2) / max);
      p.rect(barX, cy - 12, bw, 24, { fill: r.type === 'territory' ? terr : t.accent });
      p.text(`${((r.areaKm2 / CANADA_TOTAL_AREA_KM2) * 100).toFixed(1)}%`, barX + bw + 10, cy + 8, bold(20, t.ink));
      p.text(fmt(r.areaKm2), W - M, cy + 8, sans(19, t.soft, { anchor: 'end' }));
    });
    const ly = top + rows.length * rowH + 4;
    p.rect(M, ly - 14, 18, 18, { fill: t.accent });
    note(p, 'Province', M + 28, ly, t.ink, 'start', 20);
    p.rect(M + 150, ly - 14, 18, 18, { fill: terr });
    note(p, 'Territory', M + 178, ly, t.ink, 'start', 20);
    note(p, 'km², land and fresh water', W - M, ly, t.soft, 'end', 19);
    return {
      over: (q) => {
        const pei = top + 12 * rowH;
        q.text('Nunavut is about 370 times bigger', barX + 124, pei + 10, hand(28, t.accent, { anchor: 'start' }));
        arrow(q, barX + 118, pei - 2, barX + 76, pei - 2, t.accent, 0.12);
        footer(q, t, 'All 13, explained  →');
      },
    };
  },
  copy: {
    title: 'Canada’s Provinces and Territories by Size (Largest to Smallest)',
    description:
      'Nunavut is the largest of Canada’s 13 provinces and territories, at about a fifth of the country. Quebec is the largest province and Prince Edward Island the smallest: Nunavut is roughly 370 times bigger. See each one with its capital, area and population. #canada #canadafacts #canadatravel',
    link: `${SITE}/guides/canada-provinces-and-territories/`,
    board: BOARD.canadaChecklists,
    alt: 'A bar chart of Canada’s 13 provinces and territories by area, from Nunavut at 21% of the country to Prince Edward Island at 0.1%.',
    tags: ['Canada', 'Canada facts', 'Geography'],
  },
};

// 11 ─ Does an airport layover count -----------------------------------------------------------
const layover: Pin = {
  id: 'does-a-layover-count',
  theme: CREAM,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'The great travel debate', M, 196, t.accent);
    const y = headline(p, ['Does an airport', 'layover count as', 'visiting a country?'], M, 212, serif(88, t.ink));
    const card: Rect = { x: M - 12, y: y + 50, w: W - (M - 12) * 2, h: 660 };
    p.path(roundRect(card.x, card.y, card.w, card.h, 18), { fill: t.card });
    const colA = card.x + card.w - 300;
    const colB = card.x + card.w - 120;
    p.text('Travelers’', colA, card.y + 50, bold(19, t.soft, { anchor: 'middle' }));
    p.text('Century Club', colA, card.y + 74, bold(19, t.soft, { anchor: 'middle' }));
    p.text('NomadMania', colB, card.y + 62, bold(19, t.soft, { anchor: 'middle' }));
    const rows: [string, boolean, boolean][] = [
      ['Changing planes without leaving the airport', true, false],
      ['A cruise ship’s port call', true, true],
      ['Stepping over a land border and straight back', true, false],
      ['Crossing by train without getting off', false, false],
      ['A business trip where you saw nothing else', true, true],
    ];
    const green = '#2F6B5B';
    rows.forEach(([what, a, b], i) => {
      const ry = card.y + 100 + i * 96;
      p.line(card.x + 24, ry, card.x + card.w - 24, ry, { stroke: t.line, strokeWidth: 1.5 });
      para(p, what, card.x + 28, ry + 46, sans(25, t.ink), colA - 110 - (card.x + 28), 1.3, 2);
      (a ? tick : cross)(p, colA, ry + 52, 34, a ? green : t.accent, 4);
      (b ? tick : cross)(p, colB, ry + 52, 34, b ? green : t.accent, 4);
    });
    note(p, 'The Travelers’ Century Club counts a stop if you set foot there.', card.x + 28, card.y + card.h - 50, t.soft, 'start', 19);
    note(p, 'NomadMania counts a port call once you leave the port.', card.x + 28, card.y + card.h - 22, t.soft, 'start', 19);
    p.text('There’s no official rule. Pick one and keep to it.', M, card.y + card.h + 64, serif(34, t.ink, { font: 'dmserif-400i', tracking: 0 }));
    footer(p, t, 'Choose your rule  →');
  },
  copy: {
    title: 'Does an Airport Layover Count as Visiting a Country?',
    description:
      'There is no official rule. The Travelers’ Century Club counts a fuel stop if you set foot on the ground; NomadMania rejects airport visits altogether. See how seven common situations score under both rulebooks, and pick a rule for your own country count. #travel #traveltips #countriesvisited',
    link: `${SITE}/guides/what-counts-as-visiting-a-country/`,
    board: BOARD.checklists,
    alt: 'A comparison of what counts as a visit under the Travelers’ Century Club and NomadMania rules, from airport layovers to cruise port calls.',
    tags: ['Travel tips', 'Countries visited', 'Travel'],
  },
};

// 12 ─ Print size cheat sheet ------------------------------------------------------------------
const printSizes: Pin = {
  id: 'poster-print-size-cheat-sheet',
  theme: NAVY,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Printing your travel map', M, 196, t.accent);
    const y = headline(p, ['Poster size', 'cheat sheet'], M, 212, serif(110, t.ink));
    // Three common frames, nested and to scale (inches).
    const scale = 15;
    const base = { x: M + 6, y: y + 70 + 24 * scale };
    for (const [w, h, label] of [
      [18, 24, '18 × 24 in'],
      [12, 16, '12 × 16 in'],
      [8, 10, '8 × 10 in'],
    ] as const) {
      p.rect(base.x, base.y - h * scale, w * scale, h * scale, { stroke: label.startsWith('18') ? t.accent : t.ink, strokeWidth: 2, fill: label.startsWith('8') ? t.card : undefined });
      p.text(label, base.x + w * scale - 12, base.y - h * scale + 30, bold(19, label.startsWith('18') ? t.accent : t.ink, { anchor: 'end' }));
    }
    // Pixels needed, from the print guide.
    const tx = M + 18 * scale + 44;
    const rows = [
      ['8 × 10 in', '2,400 × 3,000'],
      ['12 × 16 in', '3,600 × 4,800'],
      ['18 × 24 in', '5,400 × 7,200'],
      ['A4', '2,480 × 3,508'],
      ['A3', '3,508 × 4,961'],
    ];
    p.text('PIXELS FOR 300 PER INCH', tx, y + 104, bold(17, t.soft, { tracking: 120 }));
    rows.forEach(([size, px], i) => {
      const ry = y + 160 + i * 62;
      p.text(size, tx, ry, bold(25, t.ink));
      p.text(px, W - M, ry, sans(24, t.soft, { anchor: 'end' }));
      p.line(tx, ry + 22, W - M, ry + 22, { stroke: t.line, strokeWidth: 1.2 });
    });
    const tips = base.y + 80;
    const tip = (n: string, text: string, ty: number) => {
      p.text(n, M, ty, serif(48, t.accent, { tracking: 0 }));
      return para(p, text, M + 56, ty - 10, sans(27, t.ink), W - M * 2 - 56, 1.35, 3);
    };
    let ty = tip('1', 'Print from the PDF when you can. It stays sharp at any size.', tips);
    ty = tip('2', 'On a wall, 200 pixels per inch is hard to tell from 300.', ty + 88);
    ty = tip('3', 'Matte paper, 170 to 230 gsm, suits map posters best.', ty + 88);
    tip('4', 'Dark designs print darker than they look. Order a small proof first.', ty + 88);
    footer(p, t, 'Read the print guide  →');
  },
  copy: {
    title: 'Poster Print Size Cheat Sheet: Pixels for 8×10, 12×16, 18×24, A4, A3',
    description:
      'How many pixels do you need to print a poster? At 300 pixels per inch: 8×10 in needs 2,400 × 3,000, 18×24 in needs 5,400 × 7,200, and A3 needs 3,508 × 4,961. Plus three tips for printing a travel map poster that looks sharp on the wall. #printables #posterprinting #wallart',
    link: `${SITE}/guides/print-a-travel-map-poster/`,
    board: BOARD.posters,
    alt: 'A cheat sheet of poster print sizes, from 8×10 to 18×24 inches, A4 and A3, with the pixels each needs at 300 per inch.',
    tags: ['Printables', 'Wall art', 'Poster'],
  },
};

// 13 ─ Canada’s capitals ------------------------------------------------------------------------
const capitals: Pin = {
  id: 'canada-capitals-checklist',
  theme: SAND,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Canada checklist', M, 196, t.accent);
    const y = headline(p, ['How many of Canada’s', 'capitals have you seen?'], M, 212, serif(84, t.ink));
    const c = mapCtx(p, 'canada', t);
    const placed = placeMap(c, { x: 40, y: y + 30, w: W - 80, h: 500 });
    const list = CANADA_CITIES.filter((ct) => ct.capital).sort((a, b) => CITY_POINTS[a.id][0] - CITY_POINTS[b.id][0]);
    // Markers in the crowded east sit a little apart, on a short leader to the city.
    const NUDGE: Record<string, [number, number]> = { 'ottawa-gatineau': [-26, -20], 'quebec-city': [-14, -30], fredericton: [-28, 22], charlottetown: [10, -30], halifax: [26, 20], toronto: [-6, 22] };
    list.forEach((ct, i) => {
      const [px, py] = placed.at(...CITY_POINTS[ct.id]);
      const [dx, dy] = NUDGE[ct.id] ?? [0, 0];
      const [x, yy] = [px + dx, py + dy];
      const national = ct.capital === 'national';
      if (dx || dy) {
        p.line(px, py, x, yy, { stroke: t.ink, strokeWidth: 1.3 });
        p.circle(px, py, 2.6, { fill: t.ink });
      }
      p.circle(x, yy, 12.5, { fill: national ? t.ink : t.accent, stroke: t.paper, strokeWidth: 2.5 });
      p.text(String(i + 1), x, yy + 4.6, bold(12.5, '#FFFFFF', { anchor: 'middle' }));
    });
    // The key, with a box to tick for each.
    const top = y + 600;
    const colW = (W - M * 2) / 2;
    list.forEach((ct, i) => {
      const col = i < 7 ? 0 : 1;
      const row = i % 7;
      const x = M + col * colW;
      const ry = top + row * 47;
      p.rect(x, ry - 20, 22, 22, { stroke: t.ink, strokeWidth: 2 });
      p.text(`${i + 1}`, x + 38, ry, bold(20, ct.capital === 'national' ? t.ink : t.accent));
      p.text(ct.name === 'Ottawa–Gatineau' ? 'Ottawa' : ct.name, x + 66, ry, bold(23, t.ink));
      p.text(ct.capital === 'national' ? 'Canada' : region(ct.province).postal, x + colW - 24, ry, sans(19, t.soft, { anchor: 'end' }));
    });
    footer(p, t, 'Tick them off  →');
  },
  copy: {
    title: 'Canada’s Capitals Checklist: How Many Have You Been To?',
    description:
      'Ottawa plus the capitals of all 10 provinces and 3 territories, from Victoria to St. John’s and up to Whitehorse, Yellowknife and Iqaluit. How many have you been to? Tick them off on a free map of Canada’s cities. #canadatravel #canada #roadtrip #bucketlist',
    link: `${SITE}/maps/canada-cities/`,
    board: BOARD.canadaBucket,
    alt: 'A numbered map of Canada’s 14 capitals, Ottawa and the 13 provincial and territorial capitals, with a checklist below.',
    tags: ['Canada travel', 'Road trip', 'Bucket list'],
  },
};

// 14 ─ Countries by continent ------------------------------------------------------------------
const byContinent: Pin = {
  id: 'countries-by-continent',
  theme: NAVY,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, '195 countries, continent by continent', M, 196, t.accent);
    const y = headline(p, ['How many countries', 'in each continent?'], M, 212, serif(90, t.ink));
    const groups: [string, string][] = [
      ['africa', 'Africa'],
      ['asia', 'Asia'],
      ['europe', 'Europe'],
      ['north-america', 'North America'],
      ['oceania', 'Oceania'],
      ['south-america', 'South America'],
    ];
    const gap = 24;
    const tw = (W - M * 2 - gap) / 2;
    const th = 230;
    const top = y + 56;
    for (const [i, [g, name]] of groups.entries()) {
      const ids = WORLD_UNITS.filter((u) => u.group === g && u.status !== 'territory').map((u) => u.id);
      const x = M + (i % 2) * (tw + gap);
      const ty = top + Math.floor(i / 2) * (th + gap);
      p.path(roundRect(x, ty, tw, th, 14), { fill: t.card });
      placeMap(mapCtx(p, 'world', { ...t, paper: t.card, land: '#2A3C5C' }, { visited: ids, template: 'midnight-atlas', look: { sphereLine: t.card, graticule: undefined } }), { x: x + 14, y: ty + 12, w: tw - 28, h: 134 });
      p.text(String(ids.length), x + 24, ty + th - 22, serif(70, t.accent, { tracking: -10 }));
      p.text(name, x + 24 + p.measure(String(ids.length), serif(70, t.accent, { tracking: -10 })) + 14, ty + th - 26, bold(25, t.ink));
    }
    note(p, 'UN regions, with the Americas split in two. Russia counts in Europe.', M, top + 3 * (th + gap) + 16, t.soft, 'start', 19);
    footer(p, t, 'Get the checklist  →');
  },
  copy: {
    title: 'How Many Countries Are in Each Continent? (All 195, Counted)',
    description:
      'Africa has 54 countries, Asia 48, Europe 44, North America 23, Oceania 14 and South America 12: 195 in all. Get a free printable checklist of every country by continent and tick off the ones you have visited. #travelbucketlist #countries #worldtravel #printables',
    link: `${SITE}/guides/countries-visited-checklist/`,
    board: BOARD.checklists,
    alt: 'Six small world maps, one per continent, with the number of countries in each: Africa 54, Asia 48, Europe 44, North America 23, Oceania 14, South America 12.',
    tags: ['Travel bucket list', 'Countries', 'World map'],
  },
};

// 15 ─ World posters, two ways -----------------------------------------------------------------
const worldTwoWays: Pin = {
  id: 'world-map-poster-two-styles',
  theme: PAPER,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Four designs to choose from', M, 196, t.accent);
    headline(p, ['Your travels,', 'two ways'], M, 212, serif(110, t.ink));
    const a = SAMPLES.find((s) => s.id === 'world-nordic-explorer')!;
    const b = SAMPLES.find((s) => s.id === 'world-travel-journal')!;
    const pa = await posterPng(a.settings, 'world', a.visited, a.wishlist, 418);
    const pb = await posterPng(b.settings, 'world', b.visited, b.wishlist, 418);
    const gap = 44;
    const x0 = (W - (pa.w + pb.w + gap)) / 2;
    const top = 500;
    const overlays: Overlay[] = [
      { png: pa.png, x: x0, y: top, w: pa.w, h: pa.h, shadow: 14 },
      { png: pb.png, x: x0 + pa.w + gap, y: top, w: pb.w, h: pb.h, shadow: 14 },
    ];
    const cap = top + Math.max(pa.h, pb.h) + 50;
    p.text('Nordic Explorer', x0 + pa.w / 2, cap, bold(24, t.ink, { anchor: 'middle' }));
    p.text('Travel Journal', x0 + pa.w + gap + pb.w / 2, cap, bold(24, t.ink, { anchor: 'middle' }));
    note(p, 'Shown with sample data', W / 2, cap + 40, t.soft, 'middle', 19);
    footer(p, t, 'Try all four designs  →');
    return { overlays };
  },
  copy: {
    title: 'World Travel Map Poster Ideas: Minimalist or Travel Journal',
    description:
      'Two ways to turn the countries you have visited into wall art: a clean Nordic-style world map or a warm travel-journal page with a handwritten title. Colour in your map, pick a design and download a print-ready file. Free. #travelposter #wallart #minimalistposter #worldmap',
    link: `${SITE}/travel-map-poster/`,
    board: BOARD.posters,
    alt: 'Two world map posters side by side: a minimalist Nordic Explorer design and a Travel Journal design with a handwritten title.',
    tags: ['Travel poster', 'Wall art', 'World map'],
  },
};

// 16 ─ Where Canadians live --------------------------------------------------------------------
const metroBubbles: Pin = {
  id: 'where-canadians-live',
  theme: NAVY,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Where Canadians live', M, 196, t.accent);
    const y = headline(p, [`${Math.round(METRO_SHARE)}% of Canadians live`, 'in just 41 metro areas'], M, 212, serif(84, t.ink));
    const c = mapCtx(p, 'canada', t, { template: 'midnight-atlas', look: { graticule: '#18263E' } });
    const placed = placeMap(c, { x: 30, y: y + 30, w: W - 60, h: 640 });
    const maxR = 60;
    const maxPop = Math.max(...Object.values(CMA_POPULATION_2021));
    const radius = (n: number) => maxR * Math.sqrt(n / maxPop);
    const entries = Object.entries(CMA_POPULATION_2021).sort((a, b) => b[1] - a[1]);
    for (const [id, n] of entries) {
      const [x, yy] = placed.at(...CITY_POINTS[id]);
      p.circle(x, yy, radius(n), { fill: t.accent, fillOpacity: 0.32, stroke: t.accent, strokeWidth: 1.4 });
    }
    for (const [id, dx, dy, anchor] of [
      ['toronto', -64, 46, 'end'],
      ['montreal', 34, -40, 'start'],
      ['vancouver', -34, -26, 'end'],
      ['calgary', 36, 46, 'start'],
      ['edmonton', 22, -26, 'start'],
      ['ottawa-gatineau', -34, -42, 'end'],
    ] as const) {
      const [x, yy] = placed.at(...CITY_POINTS[id]);
      p.text(city(id).name, x + dx, yy + dy, bold(20, t.ink, { anchor }));
    }
    // Size key.
    const ky = y + 770;
    let kx = M + 10;
    for (const n of [5_000_000, 1_000_000, 100_000]) {
      const r = radius(n);
      p.circle(kx + r, ky - r, r, { fill: t.accent, fillOpacity: 0.32, stroke: t.accent, strokeWidth: 1.4 });
      p.text(n >= 1e6 ? `${n / 1e6} million` : '100,000', kx + r * 2 + 10, ky - 4, sans(20, t.soft));
      kx += r * 2 + 150;
    }
    const ty = ky + 80;
    const top3 = entries.slice(0, 3);
    top3.forEach(([id, n], i) => {
      const x = M + i * ((W - M * 2) / 3);
      p.text(fmt(n), x, ty, serif(44, t.ink, { tracking: -6 }));
      p.text(city(id).name, x, ty + 34, bold(21, t.accent));
    });
    note(p, 'Census metropolitan areas, 2021 Census, Statistics Canada.', M, H - 178, t.soft, 'start', 19);
    footer(p, t, 'All 41, ranked  →');
  },
  copy: {
    title: 'Where Canadians Live: 74% in Just 41 Metro Areas (Map)',
    description:
      'Nearly three in four Canadians live in one of 41 census metropolitan areas, led by Toronto (6.2 million), Montréal (4.3 million) and Vancouver (2.6 million), 2021 Census. See all 41 ranked by population, and mark the cities you have visited. #canada #canadiancities #toronto #canadatravel',
    link: `${SITE}/guides/largest-cities-in-canada/`,
    board: BOARD.canadaBucket,
    alt: 'A map of Canada with a gold circle for each of the 41 metro areas, sized by population, clustered along the southern border.',
    tags: ['Canadian cities', 'Canada', 'Toronto'],
  },
};

// 17 ─ Ten countries, half the land ------------------------------------------------------------
const tenCountries: Pin = {
  id: 'ten-countries-half-the-land',
  theme: CREAM,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Counting by land, not by country', M, 196, t.accent);
    const y = headline(p, ['10 countries hold more', 'than half the world’s land'], M, 212, serif(80, t.ink));
    const ids = Object.keys(LAND_KM2).slice(0, 10);
    const c = mapCtx(p, 'world', t, { visited: ids, look: { sphereLine: t.coast } });
    placeMap(c, { x: M - 20, y: y + 34, w: W - (M - 20) * 2, h: 350 });
    const names: Record<string, string> = { RUS: 'Russia', CHN: 'China', USA: 'United States', CAN: 'Canada', BRA: 'Brazil', AUS: 'Australia', IND: 'India', ARG: 'Argentina', KAZ: 'Kazakhstan', DZA: 'Algeria' };
    const top = y + 446;
    const rowH = 44;
    const barX = M + 230;
    const barMax = W - M - barX - 90;
    const max = LAND_KM2.RUS;
    ids.forEach((id, i) => {
      const cy = top + i * rowH;
      const share = (LAND_KM2[id] / WORLD_LAND_KM2) * 100;
      p.text(names[id], M, cy + 8, bold(22, t.ink));
      p.rect(barX, cy - 11, (barMax * LAND_KM2[id]) / max, 22, { fill: id === 'CAN' ? t.ink : t.accent });
      p.text(`${share.toFixed(1)}%`, W - M, cy + 8, bold(21, t.ink, { anchor: 'end' }));
    });
    const total = (ids.reduce((s, id) => s + LAND_KM2[id], 0) / WORLD_LAND_KM2) * 100;
    const ty = top + ids.length * rowH + 14;
    p.line(M, ty - 22, W - M, ty - 22, { stroke: t.line, strokeWidth: 1.5 });
    p.text('All ten', M, ty + 16, bold(24, t.ink));
    p.text(`${total.toFixed(1)}%`, W - M, ty + 16, serif(40, t.accent, { anchor: 'end', tracking: -4 }));
    note(p, 'Land only, without lakes and rivers. World Bank, 2022.', M, ty + 62, t.soft, 'start', 19);
    footer(p, t, 'What’s my share?  →');
  },
  copy: {
    title: '10 Countries Hold More Than Half the World’s Land',
    description:
      'Russia, China, the United States, Canada, Brazil, Australia, India, Argentina, Kazakhstan and Algeria: 5% of the world’s countries, but 54.4% of its land (World Bank, 2022). Why the share of countries you have visited and the share of land you have seen are two very different numbers. #geography #travelfacts #worldmap',
    link: `${SITE}/guides/what-percentage-of-the-world-have-you-visited/`,
    board: BOARD.checklists,
    alt: 'A world map with the ten largest countries highlighted and a bar chart of their share of the world’s land, 54.4% together.',
    tags: ['Geography', 'Travel facts', 'World map'],
  },
};

// 18 ─ Travel Journal poster, close up ---------------------------------------------------------
const journalCloseUp: Pin = {
  id: 'travel-journal-poster-closeup',
  theme: SAND,
  async draw(p, t) {
    const sample = SAMPLES.find((s) => s.id === 'canada-travel-journal')!;
    const poster = await posterPng(sample.settings, 'canada', sample.visited, sample.wishlist, 1180);
    // A detail of the poster, filling the top of the pin.
    const win = { x: 0, y: 0, w: W, h: 930 };
    const left = Math.round(((1180 - W) / 2) * PX);
    const png = await sharp(poster.png).extract({ left, top: Math.round(40 * PX), width: W * PX, height: win.h * PX }).png().toBuffer();
    const y = 1012;
    return {
      overlays: [{ png, x: 0, y: 0, w: W, h: win.h, shadow: false }],
      over: (q) => {
        q.rect(0, win.h, W, H - win.h, { fill: t.paper });
        q.line(0, win.h, W, win.h, { stroke: t.coast, strokeWidth: 1.5 });
        kicker(q, 'The Travel Journal design', M, y, t.accent);
        headline(q, ['A Canada poster that', 'feels like your journal'], M, y + 14, serif(66, t.ink));
        para(q, 'Handwritten title, postmark, warm speckled paper. Shown with sample data.', M, y + 200, sans(26, t.soft), W - M * 2, 1.35, 2);
        footer(q, t, 'Make mine  →');
      },
    };
  },
  copy: {
    title: 'Canada Travel Map Poster in a Travel Journal Style',
    description:
      'A Canada map poster that looks like a page from your travel journal: a handwritten title, a postmark with your count, and warm speckled paper. Colour in the provinces you have explored and download it free, ready to print. #canadatravel #travelposter #traveljournal #wallart',
    link: `${SITE}/travel-map-poster/`,
    board: BOARD.posters,
    alt: 'A close-up of a Travel Journal style Canada poster titled My Travel Story, with a handwritten title, a postmark and provinces coloured in green.',
    tags: ['Travel poster', 'Canada map', 'Wall art'],
  },
};

// 19 ─ The 13, explained -------------------------------------------------------------------------
const thirteen: Pin = {
  id: 'canada-13-provinces-and-territories',
  theme: CREAM,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Canada 101', M, 196, t.accent);
    const y = headline(p, ['Canada’s 10 provinces', 'and 3 territories'], M, 212, serif(84, t.ink));
    const provinces = CANADA_REGIONS.filter((r) => r.type === 'province').map((r) => r.id);
    const c = mapCtx(p, 'canada', t, { visited: provinces, labels: true, look: { landLabel: t.ink } });
    placeMap(c, { x: 30, y: y + 22, w: W - 60, h: 540 }, 1.5);
    const order = ['CA-BC', 'CA-AB', 'CA-SK', 'CA-MB', 'CA-ON', 'CA-QC', 'CA-NB', 'CA-NS', 'CA-PE', 'CA-NL', 'CA-YT', 'CA-NT', 'CA-NU'];
    const top = y + 620;
    const colW = (W - M * 2) / 2;
    order.forEach((id, i) => {
      const r = region(id);
      const col = i < 7 ? 0 : 1;
      const row = i < 7 ? i : i - 7;
      const x = M + col * colW;
      const ry = top + row * 48;
      p.text(r.postal, x, ry, bold(19, r.type === 'territory' ? t.soft : t.accent, { tracking: 60 }));
      const name = r.name === 'Newfoundland and Labrador' ? 'Newfoundland & Labrador' : r.name;
      p.text(name, x + 46, ry, bold(21, t.ink));
      p.text(r.capital, x + 46, ry + 22, sans(17, t.soft));
    });
    const ly = top + 6 * 48 + 4;
    p.rect(M + colW, ly - 14, 18, 18, { fill: t.accent });
    note(p, 'Province', M + colW + 28, ly, t.ink, 'start', 19);
    p.rect(M + colW + 140, ly - 14, 18, 18, { fill: t.land, stroke: t.coast, strokeWidth: 1 });
    note(p, 'Territory', M + colW + 168, ly, t.ink, 'start', 19);
    footer(p, t, 'Sizes and populations  →');
  },
  copy: {
    title: 'Canada’s 10 Provinces and 3 Territories (Map and Capitals)',
    description:
      'All 13 of Canada’s provinces and territories on one map, each with its capital: from British Columbia and Victoria to Newfoundland and Labrador and St. John’s, and up north to Yukon, the Northwest Territories and Nunavut. Plus sizes, populations and the five regions. #canada #canadamap #canadatravel',
    link: `${SITE}/guides/canada-provinces-and-territories/`,
    board: BOARD.canadaChecklists,
    alt: 'A labelled map of Canada’s 10 provinces and 3 territories with a key listing each one and its capital.',
    tags: ['Canada map', 'Canada', 'Geography'],
  },
};

// 20 ─ National parks by province --------------------------------------------------------------
const parksByProvince: Pin = {
  id: 'national-parks-by-province',
  theme: FOREST,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Canada’s 48 national parks', M, 196, t.accent);
    const y = headline(p, ['Which province has', 'the most national', 'parks?'], M, 212, serif(90, t.ink));
    const lead = PARKS_BY_REGION[0];
    p.text(`${lead.region.name}, with ${lead.count}.`, M, y + 92, serif(56, t.accent, { tracking: -6 }));
    const top = y + 180;
    const rowH = 46;
    const dotX = M + 340;
    PARKS_BY_REGION.forEach(({ region: r, count }, i) => {
      const cy = top + i * rowH;
      p.text(r.name === 'Newfoundland and Labrador' ? 'Newfoundland & Lab.' : r.name, M, cy + 8, bold(22, t.ink));
      for (let k = 0; k < count; k++) {
        const x = dotX + k * 46;
        // A small fir: one triangle on a short trunk.
        p.path(`M${x} ${cy - 17}L${x + 13} ${cy + 7}H${x - 13}Z`, { fill: t.accent });
        p.rect(x - 2.5, cy + 7, 5, 7, { fill: t.accent });
      }
      p.text(String(count), W - M, cy + 8, bold(22, t.soft, { anchor: 'end' }));
    });
    note(p, 'Parks and park reserves, each counted once, where most of it lies.', M, top + PARKS_BY_REGION.length * rowH + 4, t.soft, 'start', 19);
    footer(p, t, 'Get the checklist  →');
  },
  copy: {
    title: 'Which Province Has the Most National Parks? (All 48, Counted)',
    description:
      'British Columbia has the most national parks and park reserves, with 7, followed by Alberta, Ontario, the Northwest Territories and Nunavut with 5 each. See all 48 by province on a free printable checklist and tick off the ones you have visited. #nationalparks #canadatravel #bucketlist',
    link: `${SITE}/guides/canada-national-parks-checklist/`,
    board: BOARD.canadaChecklists,
    alt: 'A chart of Canada’s 48 national parks by province, one small tree for each park, with British Columbia first at 7.',
    tags: ['National parks', 'Canada travel', 'Bucket list'],
  },
};

// 21 ─ A free scratch-map alternative ----------------------------------------------------------
const scratchMap: Pin = {
  id: 'scratch-map-alternative',
  theme: NAVY,
  async draw(p, t) {
    const c = mapCtx(p, 'world', t, { visited: WORLD_A, template: 'midnight-atlas', look: { sphere: '#142035', sphereLine: '#2E3F60', graticule: '#1A2944' } });
    placeMap(c, { x: 24, y: 130, w: W - 48, h: 560 });
    brand(p, t, M + 16, 88);
    // The example's own count, the way the map shows it.
    const n = WORLD_A.length;
    const by = 700;
    p.text(`${n} of 195`, M, by + 34, bold(26, t.ink));
    p.text(`${Math.round((n / 195) * 100)}% of the world · example map`, M + p.measure(`${n} of 195`, bold(26, t.ink)) + 16, by + 34, sans(22, t.soft));
    const y = 790;
    kicker(p, 'Like a scratch map, but free', M, y, t.accent);
    const hy = headline(p, ['Colour in every', 'country you’ve', 'been to'], M, y + 14, serif(98, t.ink));
    para(p, 'Your count and percentage update as you tap. It saves in your browser, and prints as a poster when you’re done.', M, hy + 64, sans(29, t.soft), W - M * 2, 1.36, 3);
    footer(p, t, 'Start my map  →');
  },
  copy: {
    title: 'A Free Scratch Map Alternative: Colour In the Countries You’ve Visited',
    description:
      'Like a scratch-off world map, but free and online: tap the countries you have visited and watch your count and percentage of the world update. It saves in your browser, needs no account, and turns into a printable poster when you are done. #scratchmap #travelmap #wanderlust #worldmap',
    link: `${SITE}/maps/world/`,
    board: BOARD.checklists,
    alt: 'A dark world map with 32 visited countries in gold, and the headline: colour in every country you have been to.',
    tags: ['Scratch map', 'Travel map', 'Wanderlust'],
  },
};

// ------------------------------------------------------------------ schedule

/** Seven days, three a day: a Canada pin, a world pin and a poster or how-to pin. */
const SCHEDULE: Pin[][] = [
  [parksCloseUp, percentOfWorld, worldPosterFramed],
  [bigThree, howManyCountries, fourSteps],
  [theNorth, greenland, giftPoster],
  [provincesBySize, layover, printSizes],
  [capitals, byContinent, worldTwoWays],
  [metroBubbles, tenCountries, journalCloseUp],
  [thirteen, parksByProvince, scratchMap],
];
const TIMES = ['17:00', '18:00', '19:00'];

async function render(pin: Pin): Promise<Buffer> {
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

await mkdir(OUT, { recursive: true });
const copies: PinCopy[] = [];
let n = 0;
for (const [day, pins] of SCHEDULE.entries()) {
  for (const [slot, pin] of pins.entries()) {
    n++;
    const file = `${String(n).padStart(2, '0')}-${pin.id}.png`;
    copies.push({ file, day: day + 1, time: TIMES[slot], ...pin.copy });
    if (ONLY && !ONLY.includes(pin.id) && !ONLY.includes(String(n))) continue;
    const png = await render(pin);
    await writeFile(`${OUT}/${file}`, png);
    console.log(file, `${(png.length / 1024).toFixed(0)} KB`);
  }
}
await writeFile(`${OUT}/pins.json`, JSON.stringify(copies, null, 2));
