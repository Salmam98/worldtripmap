/**
 * Pinterest pins for WorldTripMap: 1000 × 1500 PNGs drawn with the site's own poster engine,
 * maps, posters and checklist sheets.
 *
 *   npx tsx scripts/marketing/build-pins.ts <out-dir>
 *
 * Every figure on a pin comes from the site's data files, so the pins say what the site says.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp, { type OverlayOptions } from 'sharp';
import { CANADA } from '../../src/data/definitions/canada';
import { CANADA_CITIES_MAP } from '../../src/data/definitions/canada-cities';
import { WORLD } from '../../src/data/definitions/world';
import { HERITAGE_CANADA } from '../../src/data/reference/unesco-canada';
import { SAMPLES } from '../../src/data/samples';
import { CHECKLIST_FONTS, checklistSheet } from '../../src/lib/guides/checklist-pdf';
import { countriesChecklist, parksChecklist } from '../../src/lib/guides/checklists';
import { sheetToScene } from '../../src/lib/guides/sheet';
import { computeAchievements } from '../../src/lib/maps/achievements';
import { computeStats } from '../../src/lib/maps/stats';
import { normalizeSelection } from '../../src/lib/maps/store';
import type { MapDefinition, MapGeoMeta, MapGeometry, MapId } from '../../src/lib/maps/types';
import { composePoster, drawMap, fontsFor } from '../../src/lib/poster/compose';
import type { Ctx } from '../../src/lib/poster/context';
import { loadFonts, type FontSet } from '../../src/lib/poster/fonts';
import { getFormat } from '../../src/lib/poster/formats';
import { Painter } from '../../src/lib/poster/painter';
import { sceneToSvg } from '../../src/lib/poster/render-svg';
import type { Scene } from '../../src/lib/poster/scene';
import { defaultSettings } from '../../src/lib/poster/settings';
import type { TemplateId } from '../../src/lib/poster/settings';
import { TEMPLATES } from '../../src/lib/poster/templates';

const OUT = process.argv[2] ?? 'pins';
const W = 1000;
const H = 1500;
const SITE = 'https://worldtripmap.com';

const json = async (name: string) => JSON.parse(await readFile(`src/data/maps/${name}`, 'utf8'));

async function mapData(id: MapId): Promise<{ def: MapDefinition; meta: MapGeoMeta; geometry: MapGeometry }> {
  if (id === 'world') return { def: WORLD, meta: await json('world.meta.json'), geometry: await json('world.display.json') };
  if (id === 'canada') return { def: CANADA, meta: await json('canada.meta.json'), geometry: await json('canada.display.json') };
  const base = await json('canada.display.json');
  const points = await json('canada-cities.points.json');
  return {
    def: CANADA_CITIES_MAP,
    meta: await json('canada-cities.meta.json'),
    geometry: { id: 'canada-cities', lod: 'display', width: base.width, height: base.height, shapes: {}, points: points.points, baseShapes: base.shapes, lakes: base.lakes, graticule: base.graticule },
  };
}

const svgToPng = (svg: string) => sharp(Buffer.from(svg), { limitInputPixels: false }).png().toBuffer();
const sceneToPng = (scene: Scene, width: number) => svgToPng(sceneToSvg(scene, { pixelWidth: width }));

/** A soft shadow the size of an image, to lay under it. */
async function shadow(w: number, h: number, blur = 22, opacity = 0.32): Promise<{ input: Buffer; pad: number }> {
  const pad = blur * 3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad * 2}" height="${h + pad * 2}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><rect x="${pad}" y="${pad + blur * 0.6}" width="${w}" height="${h}" fill="#000" fill-opacity="${opacity}" filter="url(#b)"/></svg>`;
  return { input: await svgToPng(svg), pad };
}

interface Theme {
  paper: string;
  ink: string;
  soft: string;
  accent: string;
  onAccent: string;
}
const NAVY: Theme = { paper: '#101B2D', ink: '#F8F6F0', soft: '#A9B3C1', accent: '#E0B252', onAccent: '#101B2D' };
const CREAM: Theme = { paper: '#F4F0E6', ink: '#101B2D', soft: '#4F5B6B', accent: '#C0532F', onAccent: '#FFFFFF' };
const SAND: Theme = { paper: '#EFE7D4', ink: '#2E2A24', soft: '#655C4C', accent: '#2F6B5B', onAccent: '#FFFFFF' };

interface Overlay {
  png: Buffer;
  x: number;
  y: number;
  w: number;
  h: number;
  shadow?: boolean;
}

interface PinSpec {
  id: string;
  theme: Theme;
  kicker: string;
  lines: string[];
  sub: string;
  cta: string;
  /** Draw into the pin, between y = top and y = bottom. Return images to lay on top. */
  art: (p: Painter, fonts: FontSet, area: { top: number; bottom: number }, theme: Theme) => Promise<Overlay[]>;
}

function wordmark(p: Painter, t: Theme, x: number, y: number): void {
  const r = 17;
  p.path(`M${x} ${y - r}C${x + r * 0.58} ${y - r} ${x + r * 0.58} ${y + r} ${x} ${y + r}Z`, { fill: t.accent });
  p.circle(x, y, r, { stroke: t.ink, strokeWidth: 2 });
  p.path(
    `M${x} ${y - r}C${x - r * 0.58} ${y - r} ${x - r * 0.58} ${y + r} ${x} ${y + r}` +
      `M${x} ${y - r}C${x + r * 0.58} ${y - r} ${x + r * 0.58} ${y + r} ${x} ${y + r}` +
      `M${x} ${y - r}V${y + r}M${x - r * 0.9} ${y - 6}H${x + r * 0.9}M${x - r * 0.9} ${y + 6}H${x + r * 0.9}`,
    { stroke: t.ink, strokeWidth: 1.5 },
  );
  p.text('WorldTripMap', x + r + 14, y + 10, { font: 'dmserif-400', size: 31, fill: t.ink });
}

async function buildPin(spec: PinSpec, fonts: FontSet): Promise<Buffer> {
  const t = spec.theme;
  const p = new Painter(fonts);
  const M = 72;
  p.rect(0, 0, W, H, { fill: t.paper });
  wordmark(p, t, M + 17, 92);

  // Kicker, headline, sub.
  let y = 196;
  p.text(spec.kicker, M, y, { font: 'manrope-700', size: 22, fill: t.accent, tracking: 160, upper: true });
  y += 36;
  let size = 88;
  const head = { font: 'dmserif-400' as const, size, fill: t.ink, tracking: -8 };
  while (Math.max(...spec.lines.map((l) => p.measure(l, { ...head, size }))) > W - M * 2 && size > 56) size -= 2;
  for (const line of spec.lines) {
    y += size * 1.04;
    p.text(line, M, y, { ...head, size });
  }
  y += 58;
  const subLines = p.wrap(spec.sub, { font: 'manrope-500', size: 31, fill: t.soft }, W - M * 2, 2);
  for (const line of subLines) {
    p.text(line, M, y, { font: 'manrope-500', size: 31, fill: t.soft });
    y += 42;
  }

  // Footer: call to action and address.
  const ctaY = H - 150;
  const ctaSpec = { font: 'manrope-700' as const, size: 30, fill: t.onAccent };
  const ctaW = p.measure(spec.cta, ctaSpec) + 64;
  p.path(roundRect(M, ctaY - 46, ctaW, 70, 35), { fill: t.accent });
  p.text(spec.cta, M + 32, ctaY + 0, ctaSpec);
  p.text('worldtripmap.com', W - M, ctaY - 2, { font: 'manrope-700', size: 24, fill: t.soft, tracking: 60, anchor: 'end' });

  const overlays = await spec.art(p, fonts, { top: y + 20, bottom: ctaY - 90 }, t);
  const scene: Scene = { width: W, height: H, bleed: 0, background: t.paper, nodes: p.nodes, description: spec.lines.join(' ') };
  const base = await sceneToPng(scene, W);
  const layers: OverlayOptions[] = [];
  for (const o of overlays) {
    if (o.shadow !== false) {
      const s = await shadow(o.w, o.h);
      layers.push({ input: s.input, left: Math.round(o.x - s.pad), top: Math.round(o.y - s.pad) });
    }
    layers.push({ input: o.png, left: Math.round(o.x), top: Math.round(o.y) });
  }
  return sharp(base).composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

// ------------------------------------------------------------------- art

/** A map drawn straight into the pin, with the given places coloured. */
function mapArt(id: MapId, visited: string[], template: TemplateId = 'nordic-explorer', k = 1, labels = false) {
  return async (p: Painter, _fonts: FontSet, area: { top: number; bottom: number }, t: Theme): Promise<Overlay[]> => {
    const { def, meta, geometry } = await mapData(id);
    const tpl = TEMPLATES[template];
    const settings = { ...defaultSettings(def), template, showLabels: labels };
    const look = { ...tpl.look(settings) };
    look.paper = t.paper;
    look.water = t.paper;
    if (look.sphere) look.sphere = t.paper;
    const selection = normalizeSelection(def, visited, []);
    const c: Ctx = {
      p, W, H, bleed: 0, def, meta, geometry, selection, settings, format: getFormat('print'),
      stats: computeStats(def, selection), places: null, achievements: computeAchievements(def, selection),
      look, template: tpl, top: area.top, bottom: area.bottom, corners: [],
    };
    p.group({ transform: [k, 0, 0, k, 0, 0] }, () => drawMap(c, { x: 40 / k, y: area.top / k, w: (W - 80) / k, h: (area.bottom - area.top) / k }));
    return [];
  };
}

/** One of the site's sample posters, laid on the pin. */
function posterArt(ids: string[]) {
  return async (_p: Painter, _fonts: FontSet, area: { top: number; bottom: number }): Promise<Overlay[]> => {
    const out: Overlay[] = [];
    const avail = area.bottom - area.top;
    const n = ids.length;
    for (const [i, id] of ids.entries()) {
      const sample = SAMPLES.find((s) => s.id === id)!;
      const { def, meta, geometry } = await mapData(sample.map);
      const settings = { ...defaultSettings(def), ...sample.settings };
      const selection = normalizeSelection(def, sample.visited, sample.wishlist);
      const pf = await loadFonts(fontsFor(settings));
      const format = getFormat(settings.format);
      const scene = composePoster({ def, meta, geometry, selection, settings, format }, pf);
      const ratio = format.height / format.width;
      let h = n === 1 ? avail : avail * 0.86;
      let w = h / ratio;
      const maxW = n === 1 ? W - 220 : (W - 160) / 1.55;
      if (w > maxW) {
        w = maxW;
        h = w * ratio;
      }
      const png = await sceneToPng(scene, Math.round(w));
      const meta2 = await sharp(png).metadata();
      const x = n === 1 ? (W - w) / 2 : i === 0 ? 80 : W - 80 - w;
      const y = n === 1 ? area.top + (avail - h) / 2 : i === 0 ? area.top : area.bottom - meta2.height!;
      out.push({ png, x, y, w: meta2.width!, h: meta2.height! });
    }
    return out;
  };
}

/** A printable checklist sheet, as it comes out of the printer. */
function sheetArt(which: 'parks' | 'countries') {
  return async (_p: Painter, _fonts: FontSet, area: { top: number; bottom: number }): Promise<Overlay[]> => {
    const cf = await loadFonts(CHECKLIST_FONTS);
    const layout = checklistSheet(which === 'parks' ? parksChecklist() : countriesChecklist(), 'letter', cf);
    const scene = sheetToScene(layout.sheet, cf, layout.description);
    const avail = area.bottom - area.top;
    const h = Math.min(avail, (W - 200) * (792 / 612));
    const w = h * (612 / 792);
    const png = await sceneToPng(scene, Math.round(w));
    const m = await sharp(png).metadata();
    return [{ png, x: (W - m.width!) / 2, y: area.top + (avail - m.height!) / 2, w: m.width!, h: m.height! }];
  };
}

/** A ranked or plain list on a card. */
function listArt(rows: { left: string; right?: string; note?: string }[], foot: string, numbered: boolean) {
  return async (p: Painter, _fonts: FontSet, area: { top: number; bottom: number }, t: Theme): Promise<Overlay[]> => {
    const x = 72;
    const w = W - 144;
    const cardTop = area.top + 10;
    const cardH = area.bottom - cardTop;
    const card = t === NAVY ? '#18263D' : '#FFFFFF';
    p.path(roundRect(x, cardTop, w, cardH, 22), { fill: card });
    const rowH = (cardH - 110) / rows.length;
    const size = Math.min(34, rowH * 0.42);
    rows.forEach((row, i) => {
      const cy = cardTop + 46 + rowH * (i + 0.5);
      const tx = numbered ? x + 104 : x + 44;
      if (numbered) p.text(String(i + 1), x + 64, cy + size * 0.36, { font: 'dmserif-400', size: size * 1.15, fill: t.accent, anchor: 'middle' });
      else p.circle(x + 30, row.note ? cy - 2 - size * 0.34 : cy, 6, { fill: t.accent });
      const nameSpec = p.fit(row.left, { font: 'manrope-700', size, fill: t.ink }, row.right ? w - 380 : w - 120, 20);
      p.text(row.left, tx, cy + (row.note ? -2 : size * 0.36), nameSpec);
      if (row.note) p.text(row.note, tx, cy + size * 0.95, { font: 'manrope-500', size: size * 0.66, fill: t.soft });
      if (row.right) p.text(row.right, x + w - 40, cy + size * 0.36, { font: 'manrope-500', size: size * 0.92, fill: t.soft, anchor: 'end' });
      if (i < rows.length - 1) p.line(x + 36, cy + rowH / 2, x + w - 36, cy + rowH / 2, { stroke: t.soft, strokeWidth: 1, strokeOpacity: 0.25 });
    });
    p.text(foot, x + w / 2, cardTop + cardH - 34, { font: 'manrope-500', size: 24, fill: t.soft, anchor: 'middle' });
    return [];
  };
}

// ------------------------------------------------------------------- pins

const PROVINCE = { 'CA-AB': 'Alberta', 'CA-BC': 'British Columbia', 'CA-MB': 'Manitoba', 'CA-NB': 'New Brunswick', 'CA-NL': 'Newfoundland and Labrador', 'CA-NS': 'Nova Scotia', 'CA-NT': 'Northwest Territories', 'CA-NU': 'Nunavut', 'CA-ON': 'Ontario', 'CA-PE': 'Prince Edward Island', 'CA-QC': 'Quebec', 'CA-SK': 'Saskatchewan', 'CA-YT': 'Yukon' } as Record<string, string>;

const cityPoints = Object.keys((await json('canada-cities.points.json')).points).length;
const heritage = HERITAGE_CANADA;
const kinds = (k: string) => heritage.filter((h) => h.kind === k).length;
const pickHeritage = ['Canadian Rocky Mountain Parks', 'Historic District of Old Québec', 'L’Anse aux Meadows National Historic Site', 'Rideau Canal', 'Gros Morne National Park', 'Dinosaur Provincial Park', 'Nahanni National Park'];

const CITIES = [
  ['Toronto', '6,202,225'], ['Montréal', '4,291,732'], ['Vancouver', '2,642,825'], ['Ottawa–Gatineau', '1,488,307'], ['Calgary', '1,481,806'],
  ['Edmonton', '1,418,118'], ['Québec City', '839,311'], ['Winnipeg', '834,678'], ['Hamilton', '785,184'], ['Kitchener–Cambridge–Waterloo', '575,847'],
];

const CANADA_VISITED = ['CA-BC', 'CA-AB', 'CA-ON', 'CA-QC', 'CA-NS', 'CA-PE'];
const WORLD_VISITED = SAMPLES.find((s) => s.id === 'world-midnight-atlas')!.visited;
const CITIES_VISITED = SAMPLES.find((s) => s.id === 'cities-modern-cartographer')!.visited;

export interface PinCopy {
  file: string;
  title: string;
  description: string;
  link: string;
  board: string;
  alt: string;
}

const PINS: (PinSpec & { copy: Omit<PinCopy, 'file'> })[] = [
  {
    id: '01-canada-national-parks-checklist',
    theme: CREAM,
    kicker: 'Free printable',
    lines: ['Canada’s National', 'Parks Checklist'],
    sub: 'All 48 national parks and reserves on one page, by province',
    cta: 'Get the PDF  →',
    art: sheetArt('parks'),
    copy: {
      title: 'Canada National Parks Checklist: All 48, Free Printable PDF',
      description: 'A one-page checklist of all 48 of Canada’s national parks and national park reserves, grouped by province, with a box to tick for each. Free to print in Letter or A4. Great for a Canada bucket list or a road trip. #canadatravel #nationalparks #bucketlist #printable',
      link: `${SITE}/guides/canada-national-parks-checklist/`,
      board: 'Canada Travel Checklists',
      alt: 'A printable one-page checklist of Canada’s 48 national parks, grouped by province.',
    },
  },
  {
    id: '02-countries-visited-checklist',
    theme: NAVY,
    kicker: 'Free printable',
    lines: ['Countries Visited', 'Checklist'],
    sub: 'All 195 countries by continent, plus 42 territories',
    cta: 'Get the PDF  →',
    art: sheetArt('countries'),
    copy: {
      title: 'Countries Visited Checklist: All 195 Countries, Free Printable',
      description: 'Keep count of every country you have been to. A one-page printable checklist of all 195 countries grouped by continent, with 42 territories listed separately. Free PDF in Letter or A4. #travelbucketlist #countriesvisited #travelchecklist #printable',
      link: `${SITE}/guides/countries-visited-checklist/`,
      board: 'Travel Checklists',
      alt: 'A printable checklist of all 195 countries in columns by continent, with a box beside each.',
    },
  },
  {
    id: '03-canada-provinces-map',
    theme: CREAM,
    kicker: 'Free travel map',
    lines: ['How Much of Canada', 'Have You Visited?'],
    sub: 'Colour the provinces and territories you’ve been to and see your percentage',
    cta: 'Make my map  →',
    art: mapArt('canada', CANADA_VISITED),
    copy: {
      title: 'Canada Visited Map: Colour the Provinces You’ve Been To',
      description: 'Tap the provinces and territories you have visited and see how much of Canada you have explored, by count and by area. Free, no sign-up, and your map stays on your device. Turn it into a poster when you are done. #canada #canadatravel #travelmap #bucketlist',
      link: `${SITE}/maps/canada/`,
      board: 'Canada Bucket List',
      alt: 'A map of Canada with six provinces coloured in as visited.',
    },
  },
  {
    id: '04-world-countries-map',
    theme: NAVY,
    kicker: 'Free travel map',
    lines: ['How Many Countries', 'Have You Visited?'],
    sub: 'Mark them on a map of all 195 and see what share of the world you’ve seen',
    cta: 'Make my map  →',
    art: mapArt('world', WORLD_VISITED, 'midnight-atlas'),
    copy: {
      title: 'Countries Visited Map: How Much of the World Have You Seen?',
      description: 'Mark every country you have been to on a world map of 195 countries and see your count and percentage. Free, no account needed, and it saves in your browser. Make it a poster for your wall. #travelmap #countriesvisited #wanderlust #travelgoals',
      link: `${SITE}/maps/world/`,
      board: 'Travel Map Ideas',
      alt: 'A dark world map with visited countries highlighted in gold.',
    },
  },
  {
    id: '05-canada-cities-map',
    theme: SAND,
    kicker: 'Free travel map',
    lines: ['Canada,', 'City by City'],
    sub: `Mark the cities you’ve been to: ${cityPoints} on the map, including every capital`,
    cta: 'Make my map  →',
    art: mapArt('canada-cities', CITIES_VISITED, 'modern-cartographer', 1.9, true),
    copy: {
      title: 'Canada Cities Visited Map: Mark Every City You’ve Been To',
      description: `How many Canadian cities have you visited? Mark them on a map of ${cityPoints} cities, including every provincial and territorial capital, and keep count. Free, no sign-up. #canadatravel #canadiancities #roadtrip #travelmap`,
      link: `${SITE}/maps/canada-cities/`,
      board: 'Canada Bucket List',
      alt: 'A map of Canada with the cities a traveller has visited marked as dots.',
    },
  },
  {
    id: '06-travel-map-poster-midnight',
    theme: CREAM,
    kicker: 'Make your own',
    lines: ['Your Travels as', 'a Poster'],
    sub: 'Colour your map, pick a design, download a print-ready file',
    cta: 'Design my poster  →',
    art: posterArt(['canada-midnight-atlas']),
    copy: {
      title: 'Make Your Own Travel Map Poster (Free, Print-Ready)',
      description: 'Turn the places you have been into a personalised travel map poster. Colour your map, add a title and your name, choose a design, then download a PNG to share or a vector PDF to print. Free. #travelposter #giftidea #wallart #travelmap',
      link: `${SITE}/travel-map-poster/`,
      board: 'Travel Map Posters',
      alt: 'A dark navy travel map poster of Canada titled My Canada Journey, with visited provinces in gold.',
    },
  },
  {
    id: '07-travel-map-poster-nordic',
    theme: SAND,
    kicker: 'Wall art idea',
    lines: ['Turn Your Trips', 'Into Wall Art'],
    sub: 'A personalised map of the places you’ve explored, ready to print',
    cta: 'Design my poster  →',
    art: posterArt(['canada-nordic-explorer']),
    copy: {
      title: 'Personalised Travel Map Wall Art You Can Make in Minutes',
      description: 'A clean, Nordic-style poster of the places you have explored. Make it free on WorldTripMap: colour your map, add your name and dates, and download a high-resolution file for printing. A thoughtful gift for a traveller. #wallart #travelgift #minimalistposter #travelmap',
      link: `${SITE}/travel-map-poster/`,
      board: 'Travel Map Posters',
      alt: 'A light, minimal travel map poster of Canada titled Places I’ve Explored.',
    },
  },
  {
    id: '08-travel-map-poster-designs',
    theme: NAVY,
    kicker: `${Object.keys(TEMPLATES).length} free designs`,
    lines: ['Travel Map Poster', 'Ideas'],
    sub: 'Canada or the whole world, from dark and classic to warm and handwritten',
    cta: 'Pick a design  →',
    art: posterArt(['canada-modern-cartographer', 'canada-travel-journal']),
    copy: {
      title: `Travel Map Poster Ideas: ${Object.keys(TEMPLATES).length} Free Designs`,
      description: 'Looking for a travel map poster? Choose from four designs (Midnight Atlas, Nordic Explorer, Modern Cartographer and Travel Journal), colour the places you have been, and download it to print or share. Free on WorldTripMap. #travelposter #posterdesign #travelmap #homedecor',
      link: `${SITE}/travel-map-poster/`,
      board: 'Travel Map Posters',
      alt: 'Two travel map posters of Canada side by side, one modern and one in a handwritten journal style.',
    },
  },
  {
    id: '09-unesco-sites-canada',
    theme: CREAM,
    kicker: 'Canada bucket list',
    lines: [`All ${heritage.length} UNESCO Sites`, 'in Canada'],
    sub: `${kinds('cultural')} cultural, ${kinds('natural')} natural and ${kinds('mixed')} mixed World Heritage Sites`,
    cta: 'See all 22  →',
    art: listArt(
      pickHeritage.map((name) => {
        const h = heritage.find((x) => x.name === name)!;
        return { left: name.replace(' National Historic Site', ''), note: h.provinces.map((c) => PROVINCE[c]).join(' and ') };
      }),
      `and ${heritage.length - pickHeritage.length} more, by province`,
      false,
    ),
    copy: {
      title: 'UNESCO World Heritage Sites in Canada: All 22, by Province',
      description: 'Canada has 22 UNESCO World Heritage Sites, from the Rocky Mountain parks and Old Québec to L’Anse aux Meadows and the Rideau Canal. See all 22 by province, with what each one is. A perfect Canada bucket list. #canadatravel #unesco #worldheritage #bucketlist',
      link: `${SITE}/guides/unesco-world-heritage-sites-in-canada/`,
      board: 'Canada Bucket List',
      alt: 'A list of seven of Canada’s UNESCO World Heritage Sites with their provinces.',
    },
  },
  {
    id: '10-largest-cities-canada',
    theme: SAND,
    kicker: '2021 Census',
    lines: ['Canada’s 10', 'Largest Cities'],
    sub: 'Metropolitan area populations, from Statistics Canada',
    cta: 'See all 41  →',
    art: listArt(CITIES.map(([left, right]) => ({ left, right })), 'Census metropolitan areas, 2021', true),
    copy: {
      title: 'Largest Cities in Canada by Population (Top 10 and All 41)',
      description: 'Toronto, Montréal and Vancouver lead Canada’s largest cities by metropolitan population at the 2021 Census. See the top 10 and all 41 metro areas, and mark the ones you have visited on a free map. #canada #canadiancities #canadatravel #travelfacts',
      link: `${SITE}/guides/largest-cities-in-canada/`,
      board: 'Canada Bucket List',
      alt: 'A ranked list of Canada’s ten largest metropolitan areas with their 2021 populations.',
    },
  },
];

await mkdir(OUT, { recursive: true });
const fonts = await loadFonts(['dmserif-400', 'manrope-500', 'manrope-700']);
const copies: PinCopy[] = [];
for (const pin of PINS) {
  const png = await buildPin(pin, fonts);
  const file = `${pin.id}.png`;
  await writeFile(`${OUT}/${file}`, png);
  copies.push({ file, ...pin.copy });
  console.log(file, (png.length / 1024).toFixed(0), 'KB');
}
await writeFile(`${OUT}/pins.json`, JSON.stringify(copies, null, 2));
