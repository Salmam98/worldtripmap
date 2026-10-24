/**
 * Pinterest pins, third week: 21 pins at 2000 × 3000, three a day for seven days.
 *
 *   npx tsx scripts/marketing/build-pins-week3.ts <out-dir> [pin-id,pin-id…]
 *
 * Every figure on a pin comes from the site's data files or from the guide the pin links to:
 *   - provinces: src/data/definitions/canada.ts (areas, 2021 Census populations, joining dates, regions)
 *   - places inside each province: src/data/definitions/canada-places.ts (WorldTripMap's list of
 *     well-known places, every national park and every UNESCO World Heritage Site)
 *   - metro areas: CMA_POPULATION_2021 in src/data/definitions/canada-cities.ts (2021 Census)
 *   - World Heritage Sites: src/data/reference/unesco-canada.ts (UNESCO)
 *   - land areas: src/data/reference/land-area.ts (World Bank, 2022)
 *   - territories, continents, travel rules, map kinds, frames and paper: the guides in src/content/guides/
 *   - milestones: the achievements in src/lib/maps/achievements.ts
 * The copy for each pin is written answer first, with its source, to pins.json.
 */
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { CANADA_REGIONS } from '../../src/data/definitions/canada';
import { CANADA_CITIES, CANADA_CITIES_MAP, CMA_POPULATION_2021 } from '../../src/data/definitions/canada-cities';
import { CANADA_PLACES } from '../../src/data/definitions/canada-places';
import { WORLD_UNITS } from '../../src/data/definitions/world';
import { LAND_KM2, WORLD_LAND_KM2 } from '../../src/data/reference/land-area';
import { HERITAGE_CANADA } from '../../src/data/reference/unesco-canada';
import { SAMPLES } from '../../src/data/samples';
import { CHECKLIST_FONTS, checklistSheet } from '../../src/lib/guides/checklist-pdf';
import { countriesChecklist } from '../../src/lib/guides/checklists';
import { sheetToScene } from '../../src/lib/guides/sheet';
import { normalizeSelection } from '../../src/lib/maps/store';
import { composePoster, fontsFor } from '../../src/lib/poster/compose';
import { loadFonts } from '../../src/lib/poster/fonts';
import { getFormat } from '../../src/lib/poster/formats';
import type { Painter } from '../../src/lib/poster/painter';
import { defaultSettings } from '../../src/lib/poster/settings';
import {
  arrow, BOARD, bold, brand, buildWeek, CITY_POINTS, city, CREAM, cross, fillAreas, fmt, footer, FOREST, framed, H, hand, headline, kicker, M,
  MAPS, mapCtx, NAVY, note, PAPER, para, placeCrop, placeMap, posterPng, PX, rectD, region, roundRect, SAND, sans, serif, SITE, svgToPng, tick,
  toPng, W, type Overlay, type Pin, type Rect, type Theme,
} from './pin-kit';
import { rotate } from '../../src/lib/poster/scene';

const OUT = process.argv[2] ?? 'pins-week3';
const ONLY = process.argv[3]?.split(',');
const CITIES_META = JSON.parse(await readFile('src/data/maps/canada-cities.meta.json', 'utf8'));

// ------------------------------------------------------------------ themes

const QBLUE: Theme = { ...PAPER, accent: '#1F4E8C' };
const PRAIRIE: Theme = { paper: '#F3ECDD', ink: '#1F2A33', soft: '#5A6470', accent: '#B4652A', onAccent: '#FFFFFF', land: '#E4D9C3', coast: '#BCA987', line: '#E2D6BE', card: '#FFFBF2' };
const PINE_WALL: Theme = { paper: '#2E4A40', ink: '#F4EFE3', soft: '#C4CFC6', accent: '#E0B252', onAccent: '#1D3A31', land: '#3A5A4F', coast: '#5F7F73', line: '#3B574C', card: '#355247' };
const SAGE_WALL: Theme = { ...PAPER, paper: '#CBD1C2', ink: '#1E2A24', soft: '#46514A', accent: '#1E2A24', onAccent: '#F2EFE6' };

// ------------------------------------------------------------------ shared pieces

type Box = [number, number, number, number];

/** The box around some world-map areas, padded and grown to at least `min` map units each way. */
function around(ids: string[], pad: number, min: [number, number] = [0, 0]): Box {
  const boxes = ids.map((id) => MAPS.world.meta.features[id].bbox);
  let [x0, y0, x1, y1] = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
  const grow = (a: number, b: number, need: number) => {
    const extra = Math.max(0, need - (b - a)) / 2;
    return [a - extra, b + extra];
  };
  [x0, x1] = grow(x0 - pad, x1 + pad, min[0]);
  [y0, y1] = grow(y0 - pad, y1 + pad, min[1]);
  return [x0, y0, x1, y1];
}

/** Grows a box the least it can to give it the shape of a window `aspect` (width ÷ height) wide. */
function toAspect([x0, y0, x1, y1]: Box, aspect: number): Box {
  const w = x1 - x0;
  const h = y1 - y0;
  if (w / h > aspect) {
    const extra = (w / aspect - h) / 2;
    return [x0, y0 - extra, x1, y1 + extra];
  }
  const extra = (h * aspect - w) / 2;
  return [x0 - extra, y0, x1 + extra, y1];
}

/** A small label on a card-coloured tab, readable over any map colour. */
function tag(p: Painter, t: Theme, text: string, x: number, y: number, anchor: 'start' | 'middle' | 'end' = 'middle', size = 18): void {
  const spec = bold(size, t.ink, { anchor });
  const w = p.measure(text, spec) + 16;
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  p.path(roundRect(left, y - size - 2, w, size + 12, 6), { fill: t.card, fillOpacity: 0.94 });
  p.text(text, anchor === 'start' ? x + 8 : anchor === 'end' ? x - 8 : x, y + 2, spec);
}

type Finish = 'matte' | 'satin' | 'gloss' | 'art';

/**
 * A corner of a real poster as it would look on one paper: matte as rendered, satin with a soft
 * sheen, gloss with a window's reflection, fine-art paper with its grain and slightly softer type.
 */
async function paperSwatch(source: Buffer, crop: { left: number; top: number; width: number; height: number }, finish: Finish): Promise<Buffer> {
  const { width: w, height: h } = crop;
  let base = sharp(source).extract(crop);
  if (finish === 'art') base = base.blur(0.9);
  const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
  const effect: Record<Finish, string> = {
    matte: '',
    satin: svg(
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0.15" stop-color="#fff" stop-opacity="0"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.95" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
        `<rect width="${w}" height="${h}" fill="url(#g)"/>`,
    ),
    gloss: svg(
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.7"><stop offset="0" stop-color="#fff" stop-opacity="0.12"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/></linearGradient><filter id="s"><feGaussianBlur stdDeviation="2.5"/></filter></defs>' +
        `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
        `<g filter="url(#s)" fill="#fff"><polygon points="${w * 0.55},-20 ${w * 0.74},-20 ${w * 0.46},${h + 20} ${w * 0.27},${h + 20}" fill-opacity="0.42"/>` +
        `<polygon points="${w * 0.79},-20 ${w * 0.85},-20 ${w * 0.57},${h + 20} ${w * 0.51},${h + 20}" fill-opacity="0.32"/></g>`,
    ),
    art: svg(
      '<defs><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.42" numOctaves="4" seed="4"/>' +
        '<feColorMatrix type="matrix" values="0 0 0 0 0.97  0 0 0 0 0.94  0 0 0 0 0.86  0 0 0 0.6 -0.24"/></filter></defs>' +
        `<rect width="${w}" height="${h}" filter="url(#n)"/><rect width="${w}" height="${h}" fill="#F3E6CC" fill-opacity="0.06"/>`,
    ),
  };
  if (effect[finish]) base = sharp(await base.png().toBuffer()).composite([{ input: await svgToPng(effect[finish]) }]);
  return base.png().toBuffer();
}

/**
 * A milestone seal in the style of the one the poster studio prints: the milestone's name around
 * the top, "The world" around the bottom, and the number it takes in the middle.
 */
function seal(p: Painter, t: Theme, name: string, figure: string, cx: number, cy: number, r: number, tilt: number): void {
  p.group({ transform: rotate(tilt, cx, cy) }, () => {
    p.circle(cx, cy, r, { fill: t.card, stroke: t.accent, strokeWidth: 1.8 });
    p.circle(cx, cy, r - 5, { stroke: t.accent, strokeWidth: 0.8 });
    p.circle(cx, cy, r - 27, { stroke: t.accent, strokeWidth: 0.8 });
    const ring = bold(11.5, t.accent, { tracking: 190, upper: true });
    const span = p.arcAngle(name, r - 20.5, ring);
    p.arcText(name, cx, cy, r - 20.5, 0, span > 205 ? { ...ring, size: (ring.size * 205) / span } : ring);
    p.arcText('The world', cx, cy, r - 12, 180, ring, true);
    if (Math.min(span, 205) < 150) {
      p.circle(cx - (r - 16), cy, 1.6, { fill: t.accent });
      p.circle(cx + (r - 16), cy, 1.6, { fill: t.accent });
    }
    p.text(figure, cx, cy + 13, serif(figure.length > 2 ? 32 : 40, t.ink, { anchor: 'middle', tracking: -4 }));
  });
}

/** One province or territory on its own, filling `box`. */
function silhouette(p: Painter, id: string, box: Rect, fill: string): void {
  const [x0, y0, x1, y1] = MAPS.canada.meta.features[id].bbox;
  const s = Math.min(box.w / (x1 - x0), box.h / (y1 - y0));
  const tx = box.x + (box.w - (x1 - x0) * s) / 2 - x0 * s;
  const ty = box.y + (box.h - (y1 - y0) * s) / 2 - y0 * s;
  p.path(MAPS.canada.geometry.shapes[id], { fill, transform: [s, 0, 0, s, tx, ty] });
}

/** A printable sheet tucked under a footer band, as on the parks pin. */
async function sheetCloseUp(p: Painter, t: Theme, sheet: { scene: Parameters<typeof toPng>[0] }, top: number, noteText: string) {
  const sw = 780;
  const band = H - 190;
  const full = await toPng(sheet.scene, Math.round(sw * PX));
  const visible = band - top;
  const png = await sharp(full).extract({ left: 0, top: 0, width: Math.round(sw * PX), height: Math.round(visible * PX) }).png().toBuffer();
  return {
    overlays: [{ png, x: (W - sw) / 2, y: top, w: sw, h: visible, shadow: 18 }] as Overlay[],
    over: (q: Painter) => {
      q.rect(0, band, W, H - band, { fill: t.paper });
      q.line(M, band, W - M, band, { stroke: t.accent, strokeWidth: 2 });
      footer(q, t, 'Get the free PDF  →', H - 82);
      q.text(noteText, W - 160, top - 42, hand(42, t.accent, { anchor: 'middle' }));
      arrow(q, W - 178, top - 28, W - 214, top + 40, t.accent, -0.3);
    },
  };
}

// ------------------------------------------------------------------ province bucket lists

interface Item {
  name: string;
  tag: string;
}

/** WorldTripMap’s well-known places in a province, then its national parks, then its World Heritage Sites. */
function bucketItems(id: string): Item[] {
  const inside = CANADA_PLACES.places.filter((pl) => pl.within === id);
  const sights = inside.filter((pl) => pl.kind === 'sight').map((pl) => ({ name: pl.name, tag: '' }));
  const parks = inside
    .filter((pl) => pl.kind === 'park')
    .map((pl) => {
      const n = pl.note ?? '';
      const base = n.startsWith('Park and reserve') ? 'National park and reserve' : n.startsWith('Reserve') ? 'National park reserve' : n === 'National urban park' ? 'National urban park' : 'National park';
      return { name: pl.name, tag: n.includes('World Heritage') ? `${base} · UNESCO` : base };
    });
  const heritage = inside.filter((pl) => pl.kind === 'heritage').map((pl) => ({ name: pl.name, tag: 'UNESCO World Heritage Site' }));
  return [...sights, ...parks, ...heritage];
}

function bucketList(id: string, theme: Theme, pinId: string, copy: Pin['copy'], labels: string[]): Pin {
  const r = region(id);
  return {
    id: pinId,
    theme,
    copy,
    async draw(p, t) {
      const items = bucketItems(id);
      brand(p, t, M + 16, 88);
      kicker(p, `${r.name} bucket list`, M, 196, t.accent);
      const y = headline(p, [`${items.length} places to see`, `in ${r.name}`], M, 212, serif(96, t.ink));
      // The province, close up.
      const win: Rect = { x: 0, y: y + 36, w: W, h: 380 };
      const c = mapCtx(p, 'canada', t, { visited: [id], print: true, look: { graticule: t.line } });
      const [x0, y0, x1, y1] = MAPS.canada.meta.features[id].bbox;
      const padX = (x1 - x0) * 0.08;
      const padY = (y1 - y0) * 0.08;
      const placed = placeCrop(c, win, [x0 - padX, y0 - padY, x1 + padX, y1 + padY]);
      p.line(0, win.y + win.h, W, win.y + win.h, { stroke: t.line, strokeWidth: 1.5 });
      for (const ct of CANADA_CITIES.filter((c2) => c2.province === id)) {
        const [cx, cy] = placed.at(...CITY_POINTS[ct.id]);
        p.circle(cx, cy, ct.capital ? 6.5 : 4, { fill: t.paper, stroke: t.ink, strokeWidth: ct.capital ? 3 : 2 });
      }
      p.group({ clip: rectD(win) }, () => {
        for (const label of labels) {
          const [cid, dx, dy, anchor] = label.split('|');
          const [cx, cy] = placed.at(...CITY_POINTS[cid]);
          const name = city(cid).name === 'Ottawa–Gatineau' ? 'Ottawa' : city(cid).name;
          tag(p, t, name, cx + Number(dx), cy + Number(dy), anchor as 'start' | 'middle' | 'end');
        }
      });
      // The checklist, two columns.
      const top = win.y + win.h + 58;
      const rows = Math.ceil(items.length / 2);
      const colW = (W - M * 2) / 2;
      const rowH = Math.min(54, (H - 200 - top) / rows);
      items.forEach((item, i) => {
        const col = i < rows ? 0 : 1;
        const row = i < rows ? i : i - rows;
        const x = M + col * colW;
        const ry = top + row * rowH;
        p.rect(x, ry - 18, 20, 20, { stroke: t.ink, strokeWidth: 2 });
        const spec = p.fit(item.name, bold(21, t.ink), colW - 54, 15);
        p.text(item.name, x + 34, ry, spec);
        if (item.tag) p.text(item.tag, x + 34, ry + 20, sans(15, item.tag.includes('UNESCO') ? t.accent : t.soft));
      });
      footer(p, t, 'Tick them off  →');
    },
  };
}

// ------------------------------------------------------------------ pins

const WORLD_A = SAMPLES.find((s) => s.id === 'world-midnight-atlas')!.visited;

// 1 ─ Ontario --------------------------------------------------------------------------------
const ontario = bucketList(
  'CA-ON',
  CREAM,
  'ontario-bucket-list',
  {
    title: 'Ontario Bucket List: 15 Places to See (Checklist)',
    description:
      'Fifteen places to see in Ontario: Niagara Falls, the CN Tower, Parliament Hill, Algonquin, Muskoka and the Toronto Islands, plus the province’s five national parks, Rouge National Urban Park and the Rideau Canal, a UNESCO World Heritage Site. Tick them off on a free map of Canada. #ontario #ontariotravel #canadatravel',
    link: `${SITE}/maps/canada/`,
    board: BOARD.canadaBucket,
    alt: 'A map of Ontario with a checklist of 15 places to see, from Niagara Falls and the CN Tower to Bruce Peninsula National Park and the Rideau Canal.',
    tags: ['Ontario travel', 'Canada travel', 'Bucket list'],
  },
  ['toronto|0|-16|middle', 'ottawa-gatineau|0|-16|middle'],
);

// 2 ─ Countries checklist, close up -----------------------------------------------------------
const countriesCloseUp: Pin = {
  id: 'countries-checklist-closeup',
  theme: NAVY,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Free printable · Letter and A4', M, 196, t.accent);
    const y = headline(p, ['All 195 countries', 'on one page'], M, 212, serif(100, t.ink));
    para(p, 'A checklist by continent, with the 42 territories listed below. Tick as you go.', M, y + 62, sans(30, t.soft), W - M * 2, 1.35, 2);
    const cf = await loadFonts(CHECKLIST_FONTS);
    const layout = checklistSheet(countriesChecklist(), 'letter', cf);
    return sheetCloseUp(p, t, { scene: sheetToScene(layout.sheet, cf, layout.description) }, 600, '195 boxes to tick');
  },
  copy: {
    title: 'Countries Visited Checklist: All 195 Countries on One Page (Free PDF)',
    description:
      'A free printable checklist of all 195 countries, the 193 United Nations member states plus the Holy See and Palestine, grouped by continent, with 42 territories such as Greenland and Puerto Rico listed separately. Download the PDF in Letter or A4, print it and tick as you go. #countriesvisited #travelchecklist #travelbucketlist',
    link: `${SITE}/guides/countries-visited-checklist/`,
    board: BOARD.checklists,
    alt: 'A printable one-page checklist of all 195 countries in columns by continent, with a box beside each country.',
    tags: ['Travel checklist', 'Countries', 'Printables'],
  },
};

// 3 ─ Fill-in, pin or route map ----------------------------------------------------------------
const mapKinds: Pin = {
  id: 'fill-in-pin-or-route-map',
  theme: SAND,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Before you start', M, 196, t.accent);
    const y = headline(p, ['Which travel map', 'do you need?'], M, 212, serif(100, t.ink));
    // Shows, best for, weak at: the table in the how-to guide.
    const kinds = [
      ['Fill-in map', 'Whole countries or provinces, coloured in.', 'Counting, comparing, a clean poster', 'Where you went inside a big country'],
      ['Pin map', 'A marker on each city or sight.', 'Remembering specific places', 'Looking tidy once pins crowd together'],
      ['Route map', 'A line along the path of one trip.', 'Telling the story of one journey', 'Summing up a lifetime of travel'],
    ];
    const top = y + 50;
    const ph = 262;
    const gap = 18;
    const pins = ['vancouver', 'calgary', 'edmonton', 'winnipeg', 'toronto', 'ottawa-gatineau', 'montreal', 'quebec-city', 'halifax', 'st-johns', 'victoria', 'kelowna'];
    const route = ['victoria', 'vancouver', 'calgary', 'regina', 'winnipeg', 'thunder-bay', 'ottawa-gatineau', 'montreal', 'quebec-city', 'fredericton', 'halifax'];
    kinds.forEach(([name, shows, best, weak], i) => {
      const py = top + i * (ph + gap);
      p.path(roundRect(M - 12, py, W - (M - 12) * 2, ph, 16), { fill: t.card });
      const box: Rect = { x: M + 6, y: py + 18, w: 300, h: ph - 36 };
      const c = mapCtx(p, 'canada', t, { visited: i === 0 ? ['CA-BC', 'CA-AB', 'CA-ON', 'CA-QC', 'CA-NS'] : [], look: { graticule: undefined } });
      const placed = placeMap(c, box);
      // Map pins: a teardrop whose tip sits on the city.
      if (i === 1) for (const id of pins) {
        const [x, yy] = placed.at(...CITY_POINTS[id]);
        p.path(`M${x} ${yy}C${x - 2} ${yy - 5} ${x - 6.5} ${yy - 8} ${x - 6.5} ${yy - 12.5}A6.5 6.5 0 1 1 ${x + 6.5} ${yy - 12.5}C${x + 6.5} ${yy - 8} ${x + 2} ${yy - 5} ${x} ${yy}Z`, {
          fill: t.accent, stroke: t.card, strokeWidth: 1.2,
        });
        p.circle(x, yy - 12.5, 2.3, { fill: t.card });
      }
      if (i === 2) {
        const pts = route.map((id) => placed.at(...CITY_POINTS[id]));
        p.path(pts.map(([x, yy], k) => `${k ? 'L' : 'M'}${x} ${yy}`).join(''), { stroke: t.accent, strokeWidth: 3, lineJoin: 'round', lineCap: 'round' });
        for (const [x, yy] of pts) p.circle(x, yy, 3.5, { fill: t.card, stroke: t.accent, strokeWidth: 2 });
      }
      const tx = M + 340;
      const tw = W - M - tx - 10;
      p.text(name, tx, py + 62, serif(46, t.ink, { tracking: -6 }));
      const ty = para(p, shows, tx, py + 102, bold(21, t.ink), tw, 1.3, 2);
      // Best for, weak at: a tick and a cross, each with its line.
      const by = ty + 46;
      p.circle(tx + 13, by - 7, 13, { fill: t.accent });
      tick(p, tx + 13, by - 7, 13, t.onAccent, 2.6);
      para(p, best, tx + 40, by, sans(21, t.ink), tw - 40, 1.25, 2);
      const wy = by + 44;
      p.circle(tx + 13, wy - 7, 13, { stroke: t.soft, strokeWidth: 1.6 });
      cross(p, tx + 13, wy - 7, 13, t.soft, 2.2);
      para(p, weak, tx + 40, wy, sans(21, t.soft), tw - 40, 1.25, 2);
    });
    footer(p, t, 'Make a fill-in map  →');
  },
  copy: {
    title: 'Fill-In, Pin or Route Map? Which Travel Map Should You Make',
    description:
      'There are three kinds of travel map. A fill-in map colours in whole countries or provinces and is best for counting and for a clean poster. A pin map marks each city or sight. A route map draws the line of one trip. Here is what each is good and bad at, and how to make a fill-in map in four steps. #travelmap #travelideas #traveljournal',
    link: `${SITE}/guides/how-to-make-a-map-of-places-youve-visited/`,
    board: BOARD.posters,
    alt: 'Three kinds of travel map compared: a fill-in map of Canada, a pin map of Canadian cities and a route map across Canada, with what each is best for.',
    tags: ['Travel map', 'Travel ideas', 'Travel journal'],
  },
};

// 4 ─ Toronto against the provinces -----------------------------------------------------------
const torontoBars: Pin = {
  id: 'toronto-bigger-than-11-provinces',
  theme: PAPER,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Canada by the numbers', M, 196, t.accent);
    const y = headline(p, ['Toronto has more people', 'than 11 of Canada’s 13', 'provinces and territories'], M, 212, serif(78, t.ink));
    para(p, `Toronto’s metro area: ${fmt(CMA_POPULATION_2021.toronto)} people at the 2021 Census.`, M, y + 54, sans(26, t.soft), W - M * 2, 1.3, 2);
    const rows = [
      ...CANADA_REGIONS.map((r) => ({ name: r.name === 'Newfoundland and Labrador' ? 'Newfoundland & Lab.' : r.name, n: r.population2021, toronto: false })),
      { name: 'Toronto metro area', n: CMA_POPULATION_2021.toronto, toronto: true },
    ].sort((a, b) => b.n - a.n);
    const top = y + 134;
    const rowH = 50;
    const barX = M + 268;
    const barMax = W - M - barX - 140;
    const max = rows[0].n;
    // Toronto's line, through every bar: whatever stops short of it has fewer people.
    const lineX = barX + (barMax * CMA_POPULATION_2021.toronto) / max;
    p.line(lineX, top - 34, lineX, top + (rows.length - 1) * rowH + 18, { stroke: t.accent, strokeWidth: 1.8, dash: [5, 6] });
    rows.forEach((row, i) => {
      const cy = top + i * rowH;
      const bigger = row.n > CMA_POPULATION_2021.toronto;
      const fill = row.toronto ? t.accent : bigger ? t.ink : '#A7AFB8';
      p.text(row.name, M, cy + 7, bold(20, row.toronto ? t.accent : t.ink));
      const bw = Math.max(3, (barMax * row.n) / max);
      p.rect(barX, cy - 12, bw, 24, { fill });
      // The figure sits on a patch of paper, so Toronto's line never runs through it.
      const label = fmt(row.n);
      const spec = sans(18, row.toronto ? t.accent : t.soft);
      p.rect(barX + bw + 4, cy - 12, p.measure(label, spec) + 12, 24, { fill: t.paper });
      p.text(label, barX + bw + 10, cy + 7, spec);
    });
    p.text('Toronto’s line', lineX + 10, top - 22, hand(30, t.accent));
    note(p, 'Toronto: census metropolitan area. 2021 Census, Statistics Canada.', M, top + rows.length * rowH + 4, t.soft, 'start', 19);
    footer(p, t, 'Canada’s 41 metro areas  →');
  },
  copy: {
    title: 'Toronto Has More People Than 11 of Canada’s 13 Provinces and Territories',
    description:
      `Toronto’s metropolitan area had ${fmt(CMA_POPULATION_2021.toronto)} people at the 2021 Census, more than every province and territory except Ontario and Quebec, including British Columbia (${fmt(region('CA-BC').population2021)}) and Alberta (${fmt(region('CA-AB').population2021)}). Source: Statistics Canada. See Canada’s 41 metro areas ranked. #toronto #canada #canadafacts`,
    link: `${SITE}/guides/largest-cities-in-canada/`,
    board: BOARD.canadaBucket,
    alt: 'A bar chart comparing the population of Toronto’s metro area with Canada’s 13 provinces and territories: only Ontario and Quebec have more people.',
    tags: ['Toronto', 'Canada facts', 'Canada'],
  },
};

// 5 ─ Is Puerto Rico a country? ----------------------------------------------------------------
const puertoRico: Pin = {
  id: 'is-puerto-rico-a-country',
  theme: SAND,
  async draw(p, t) {
    const win: Rect = { x: 0, y: 140, w: W, h: 470 };
    const c = mapCtx(p, 'world', t, { visited: ['PRI'], print: true, look: { sphereLine: t.paper, graticule: undefined } });
    const placed = placeCrop(c, win, around(['PRI', 'DOM', 'JAM'], 60, [700, 330]));
    const [px, py] = placed.at(...MAPS.world.meta.features.PRI.label);
    p.line(px + 14, py + 8, px + 62, py + 62, { stroke: t.ink, strokeWidth: 1.6 });
    tag(p, t, 'Puerto Rico', px + 62, py + 92, 'middle', 22);
    p.line(0, win.y + win.h, W, win.y + win.h, { stroke: t.line, strokeWidth: 1.5 });
    brand(p, t, M + 16, 88);
    const y0 = win.y + win.h + 70;
    kicker(p, 'Travel map questions', M, y0, t.accent);
    const y = headline(p, ['Is Puerto Rico', 'a country?'], M, y0 + 14, serif(100, t.ink));
    const top = y + 170;
    p.text('No.', M, top, serif(150, t.accent, { tracking: -12 }));
    para(p, 'It’s a territory of the United States: a commonwealth, not a state. On a travel map, count it on its own line.', M + 250, top - 86, sans(28, t.ink), W - M - (M + 250), 1.36, 4);
    // Three more places people ask the same question about, with the state responsible for each.
    const cy = top + 76;
    p.text('Also territories, not countries', M, cy, bold(17, t.soft, { tracking: 120, upper: true }));
    const chips = [
      ['Greenland', 'Denmark'],
      ['Hong Kong', 'China'],
      ['Bermuda', 'United Kingdom'],
    ];
    const gap = 16;
    const cw = (W - M * 2 - gap * 2) / 3;
    chips.forEach(([name, state], i) => {
      const x = M + i * (cw + gap);
      p.path(roundRect(x, cy + 22, cw, 84, 12), { fill: t.card });
      p.text(name, x + 20, cy + 58, bold(23, t.ink));
      p.text(state, x + 20, cy + 88, sans(19, t.soft));
    });
    footer(p, t, 'What else counts?  →');
  },
  copy: {
    title: 'Is Puerto Rico a Country? (How to Count It on a Travel Map)',
    description:
      'No. Puerto Rico is a territory of the United States. The U.S. Department of the Interior lists it as one of two commonwealths among the U.S. insular areas, and it is not a state either. On a travel map, count it on its own line as a territory, alongside places like Greenland and Hong Kong. #puertorico #travelfacts #travel',
    link: `${SITE}/guides/what-counts-as-a-country/`,
    board: BOARD.checklists,
    alt: 'A map of the Caribbean with Puerto Rico highlighted and the answer: no, it is a territory of the United States, a commonwealth, not a state.',
    tags: ['Puerto Rico', 'Travel facts', 'Caribbean'],
  },
};

// 6 ─ A gift: the world, framed ---------------------------------------------------------------
const giftWorld: Pin = {
  id: 'our-adventures-gift-poster',
  theme: PINE_WALL,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'A gift idea for travellers', M, 196, t.accent);
    headline(p, ['The gift that maps', 'your adventures'], M, 212, serif(98, t.ink));
    const poster = await posterPng(
      { template: 'nordic-explorer', format: 'print', title: 'Our Adventures', name: 'Sample travellers', dates: '2015–2026' },
      'world',
      WORLD_A,
      [],
      470,
    );
    const frameW = 16;
    const mat = 46;
    const ow = poster.w + (frameW + mat) * 2;
    const top = 500;
    const overlays = await framed(poster, (W - ow) / 2, top, '#1C1D1F', frameW, mat);
    note(p, 'Nordic Explorer design, shown with sample data', W / 2, top + poster.h + (frameW + mat) * 2 + 40, t.soft, 'middle', 20);
    footer(p, t, 'Design one for free  →');
    return { overlays };
  },
  copy: {
    title: 'Travel Gift Idea: A World Map Poster of Your Adventures Together',
    description:
      'A personalised gift for a couple or any traveller: a world map poster of the countries you have explored together, with your own title and dates. Colour in the map on WorldTripMap, pick one of four designs and download a print-ready PDF to print at home or at a print shop. Free to make. #giftideas #travelgifts #christmasgifts',
    link: `${SITE}/travel-map-poster/`,
    board: BOARD.posters,
    alt: 'A framed minimalist world map poster titled Our Adventures, with visited countries in green, on a dark green wall.',
    tags: ['Travel gifts', 'Christmas gifts', 'Wall art'],
  },
};

// 7 ─ British Columbia --------------------------------------------------------------------------
const bc = bucketList(
  'CA-BC',
  FOREST,
  'british-columbia-bucket-list',
  {
    title: 'British Columbia Bucket List: 15 Places to See (Checklist)',
    description:
      'Fifteen places to see in British Columbia: Stanley Park, Whistler, Butchart Gardens, Tofino and the Okanagan Valley, plus BC’s seven national parks and reserves, including Yoho and Kootenay in the Rockies, and SGang Gwaay, a UNESCO World Heritage Site. Tick them off on a free map of Canada. #britishcolumbia #bctravel #canadatravel',
    link: `${SITE}/maps/canada/`,
    board: BOARD.canadaBucket,
    alt: 'A map of British Columbia with a checklist of 15 places to see, from Stanley Park and Whistler to Pacific Rim and Yoho national parks.',
    tags: ['British Columbia', 'Canada travel', 'Bucket list'],
  },
  ['vancouver|-14|-14|end', 'victoria|-12|26|end'],
);

// 8 ─ Four rules for counting a visit -----------------------------------------------------------
const fourRules: Pin = {
  id: 'four-rules-for-counting-a-country',
  theme: NAVY,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Counting countries', M, 196, t.accent);
    const y = headline(p, ['4 ways to decide', 'what counts as', 'a visit'], M, 212, serif(98, t.ink));
    const rules = [
      ['You set foot there', 'A layover counts if you left the plane. The Travelers’ Century Club rule.'],
      ['You left the airport', 'Or the port, or the station. The usual middle ground.'],
      ['You spent a night', 'Day trips and layovers don’t count.'],
      ['You did something there', 'Something you would tell a friend about.'],
    ];
    const top = y + 62;
    const bh = 140;
    // A staircase, loosest at the top: each step is stricter, and its meter fills one more bar.
    rules.forEach(([title, text], i) => {
      const x = M - 12 + i * 34;
      const by = top + i * (bh + 14);
      const w = W - M + 12 - x;
      p.path(roundRect(x, by, w, bh, 14), { fill: t.card });
      p.text(String(i + 1), x + 28, by + 72, serif(64, t.accent, { tracking: 0 }));
      p.text(title, x + 92, by + 54, bold(30, t.ink));
      para(p, text, x + 92, by + 92, sans(23, t.soft), w - 220, 1.3, 2);
      for (let k = 0; k < 4; k++) {
        p.path(roundRect(x + w - 118 + k * 24, by + 32, 18, 26, 4), k <= i ? { fill: t.accent } : { stroke: t.coast, strokeWidth: 1.5 });
      }
    });
    const ly = top + 4 * (bh + 14);
    p.text('STRICTNESS', W - M - 61, top - 16, bold(15, t.soft, { anchor: 'middle', tracking: 160 }));
    p.text('Pick the strictest rule you’ll actually keep to.', M, ly + 44, serif(34, t.ink, { font: 'dmserif-400i', tracking: 0 }));
    footer(p, t, 'See both rulebooks  →');
  },
  copy: {
    title: 'What Counts as Visiting a Country? 4 Rules, Loosest to Strictest',
    description:
      'There is no official rule for counting a country. The four common ones, from loosest to strictest: you set foot there (the Travelers’ Century Club rule, which counts a layover if you left the plane), you left the airport, you spent a night, or you did something you would tell a friend about. Pick one and apply it everywhere. #travel #traveltips #countriesvisited',
    link: `${SITE}/guides/what-counts-as-visiting-a-country/`,
    board: BOARD.checklists,
    alt: 'Four rules for counting a country visit, from loosest to strictest: set foot there, left the airport, spent a night, did something there.',
    tags: ['Travel tips', 'Countries visited', 'Travel'],
  },
};

// 9 ─ Poster shapes and frames ----------------------------------------------------------------
const frameShapes: Pin = {
  id: 'poster-shape-for-your-frame',
  theme: PAPER,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Before you frame it', M, 196, t.accent);
    const y = headline(p, ['Which poster shape', 'fits your frame?'], M, 212, serif(92, t.ink));
    const midnight = SAMPLES.find((s) => s.id === 'canada-midnight-atlas')!;
    const nordic = SAMPLES.find((s) => s.id === 'canada-nordic-explorer')!;
    const wide = SAMPLES.find((s) => s.id === 'world-midnight-atlas')!;
    const modern = SAMPLES.find((s) => s.id === 'canada-modern-cartographer')!;
    const shapes = [
      { ratio: '4:5', name: 'Post', sizes: ['8 × 10 in', '16 × 20 in'], s: midnight.settings, map: 'canada' as const, v: midnight.visited, wl: midnight.wishlist },
      { ratio: '3:4', name: 'Poster, upright', sizes: ['9 × 12 in', '12 × 16 in', '18 × 24 in'], s: nordic.settings, map: 'canada' as const, v: nordic.visited, wl: nordic.wishlist },
      { ratio: '4:3', name: 'Poster, wide', sizes: ['12 × 9 in', '16 × 12 in', '24 × 18 in'], s: wide.settings, map: 'world' as const, v: wide.visited, wl: wide.wishlist },
      { ratio: '1:1.414', name: 'A sizes', sizes: ['A4', 'A3', 'A2'], s: { ...modern.settings, format: 'a-series' as const }, map: 'canada' as const, v: modern.visited, wl: modern.wishlist },
    ];
    const top = y + 50;
    const gap = 22;
    const tw = (W - M * 2 - gap) / 2;
    const th = 356;
    const frameW = 7;
    const mat = 12;
    const edge = (frameW + mat) * 2;
    const overlays: Overlay[] = [];
    for (const [i, sh] of shapes.entries()) {
      const x = M + (i % 2) * (tw + gap);
      const ty = top + Math.floor(i / 2) * (th + gap);
      p.path(roundRect(x, ty, tw, th, 16), { fill: t.card });
      // The poster in a thin black frame, as large as fits a 270 × 214 box.
      const probe = await posterPng(sh.s, sh.map, sh.v, sh.wl, 100);
      const ratio = probe.h / probe.w;
      const pw = Math.min(270 - edge, (214 - edge) / ratio);
      const poster = await posterPng(sh.s, sh.map, sh.v, sh.wl, pw);
      const fw = poster.w + edge;
      const fh = poster.h + edge;
      const [frame, art] = await framed(poster, x + (tw - fw) / 2, ty + 22 + (214 - fh) / 2, '#1C1D1F', frameW, mat);
      overlays.push({ ...frame, shadow: 7 }, art);
      const ratioSpec = serif(46, t.accent, { tracking: -4 });
      p.text(sh.ratio, x + 24, ty + 288, ratioSpec);
      p.text(sh.name, x + 24 + p.measure(sh.ratio, ratioSpec) + 12, ty + 284, bold(22, t.ink));
      p.text(sh.sizes.join('  ·  '), x + 24, ty + 326, sans(20, t.soft));
    }
    para(p, 'In North America, 18 × 24 and 16 × 20 in frames are the easiest to find. Elsewhere, pick an A size.', M, top + 2 * (th + gap) + 18, sans(23, t.ink), W - M * 2, 1.35, 2);
    footer(p, t, 'Read the print guide  →');
    return { overlays };
  },
  copy: {
    title: 'Poster Sizes and Frames: Which Shape Fits 8×10, 12×16, 18×24 or A3',
    description:
      'Match the shape of the poster to the frame and nothing gets cropped: 4:5 prints at 8×10 and 16×20 in, 3:4 at 9×12, 12×16 and 18×24 in, 4:3 at 12×9, 16×12 and 24×18 in, and the A shape at A4, A3 and A2. In North America, 18×24 and 16×20 in frames are the easiest to find. #posterframes #wallart #printables',
    link: `${SITE}/guides/print-a-travel-map-poster/`,
    board: BOARD.posters,
    alt: 'Four travel map posters in four shapes, 4:5, 3:4, 4:3 and A size, each with the frame sizes it prints at without cropping.',
    tags: ['Wall art', 'Printables', 'Poster'],
  },
};

// 10 ─ Capitals that aren’t the biggest city -----------------------------------------------------
const capitalQuiz: Pin = {
  id: 'capital-not-biggest-city-quiz',
  theme: SAND,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Canada quiz', M, 196, t.accent);
    const y = headline(p, ['In which 5 provinces', 'is the capital not', 'the biggest city?'], M, 212, serif(90, t.ink));
    const rows: [string, string, string][] = [
      ['CA-BC', 'victoria', 'vancouver'],
      ['CA-AB', 'edmonton', 'calgary'],
      ['CA-SK', 'regina', 'saskatoon'],
      ['CA-QC', 'quebec-city', 'montreal'],
      ['CA-NB', 'fredericton', 'moncton'],
    ];
    const rowH = 112;
    const card: Rect = { x: M - 12, y: y + 50, w: W - (M - 12) * 2, h: 84 + rows.length * rowH + 66 };
    p.path(roundRect(card.x, card.y, card.w, card.h, 18), { fill: t.card });
    const cA = card.x + 400;
    const cB = card.x + 650;
    p.text('CAPITAL', cA, card.y + 50, bold(17, t.soft, { tracking: 140 }));
    p.text('BIGGEST CITY', cB, card.y + 50, bold(17, t.accent, { tracking: 140 }));
    rows.forEach(([rid, cap, big], i) => {
      const ry = card.y + 76 + i * rowH;
      p.line(card.x + 24, ry, card.x + card.w - 24, ry, { stroke: t.line, strokeWidth: 1.5 });
      silhouette(p, rid, { x: card.x + 22, y: ry + 20, w: 72, h: 72 }, t.accent);
      p.text(region(rid).name, card.x + 110, ry + 64, bold(25, t.ink));
      p.text(city(cap).name, cA, ry + 50, bold(25, t.soft));
      p.text(fmt(CMA_POPULATION_2021[cap]), cA, ry + 82, sans(19, t.soft));
      p.text(city(big).name, cB, ry + 50, bold(25, t.accent));
      p.text(fmt(CMA_POPULATION_2021[big]), cB, ry + 82, sans(19, t.soft));
    });
    note(p, 'Metropolitan area populations, 2021 Census, Statistics Canada.', card.x + 28, card.y + card.h - 26, t.soft, 'start', 19);
    footer(p, t, 'All 41 metro areas  →');
  },
  copy: {
    title: 'Canada Quiz: In Which 5 Provinces Is the Capital Not the Biggest City?',
    description:
      'British Columbia (Victoria, not Vancouver), Alberta (Edmonton, not Calgary), Saskatchewan (Regina, not Saskatoon), Quebec (Québec City, not Montréal) and New Brunswick (Fredericton, not Moncton). In the other five provinces the capital is also the largest city. By metropolitan area population, 2021 Census. #canadafacts #canada #trivia',
    link: `${SITE}/guides/largest-cities-in-canada/`,
    board: BOARD.canadaBucket,
    alt: 'A quiz card listing five Canadian provinces whose capital is not the biggest city, with the 2021 metro populations of each capital and largest city.',
    tags: ['Canada facts', 'Trivia', 'Canada'],
  },
};

// 11 ─ The 42 territories --------------------------------------------------------------------------
const territories: Pin = {
  id: '42-territories-not-countries',
  theme: NAVY,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Still worth a tick, on a line of their own', M, 196, t.accent);
    const y = headline(p, ['42 places that aren’t', 'among the 195 countries'], M, 212, serif(86, t.ink));
    para(p, 'Greenland, Puerto Rico, Hong Kong and 39 more, by the state responsible for each.', M, y + 54, sans(27, t.soft), W - M * 2, 1.32, 2);
    const states: [string, string][] = [
      ['GBR', 'United Kingdom'], ['FRA', 'France'], ['USA', 'United States'], ['NLD', 'Netherlands'], ['AUS', 'Australia'],
      ['CHN', 'China'], ['DNK', 'Denmark'], ['NZL', 'New Zealand'], ['FIN', 'Finland'], ['', 'Listed on their own'],
    ];
    const terr = WORLD_UNITS.filter((u) => u.status === 'territory');
    const top = y + 168;
    const rowH = 76;
    const sqX = M + 262;
    states.forEach(([code, name], i) => {
      const list = terr.filter((u) => ((u as { sovereign?: string }).sovereign ?? '') === code).map((u) => u.name).sort();
      const ry = top + i * rowH;
      p.text(name, M, ry, bold(22, t.ink));
      list.forEach((_, k) => p.path(roundRect(sqX + k * 31, ry - 21, 25, 25, 4), { fill: code ? t.accent : t.soft }));
      p.text(String(list.length), W - M, ry, serif(36, t.ink, { anchor: 'end', tracking: 0 }));
      const ex = code === '' ? list.join(', ') : `${list.slice(0, 3).join(', ')}${list.length > 3 ? '…' : ''}`;
      p.text(ex, sqX, ry + 26, sans(16, t.soft));
    });
    footer(p, t, 'Is Greenland a country?  →');
  },
  copy: {
    title: 'Greenland, Puerto Rico, Hong Kong: 42 Places Not Among the 195 Countries',
    description:
      'Greenland, Puerto Rico, Hong Kong, Bermuda and 38 more places on the world map are not among the 195 countries (the 193 UN member states plus the Holy See and Palestine). The United Kingdom is responsible for 14 of them, France for 7 and the United States for 5. Four, such as Antarctica, are listed on their own. Count them on a second line. #travelfacts #territories #geography',
    link: `${SITE}/guides/what-counts-as-a-country/`,
    board: BOARD.checklists,
    alt: 'A chart of the 42 territories on the world map by the state responsible: United Kingdom 14, France 7, United States 5, Netherlands 3, and the rest.',
    tags: ['Travel facts', 'Travel bucket list', 'Geography'],
  },
};

// 12 ─ Which paper ------------------------------------------------------------------------------
const paperGuide: Pin = {
  id: 'best-paper-for-map-posters',
  theme: CREAM,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Printing your travel map', M, 196, t.accent);
    const y = headline(p, ['Which paper for', 'a map poster?'], M, 212, serif(100, t.ink));
    // What the print guide says about each paper.
    const papers: [string, string, Finish][] = [
      ['Matte, 170–230 gsm', 'No glare under glass, and fine lettering stays crisp.', 'matte'],
      ['Satin or lustre', 'Gives dark colours more depth. A good match for the Midnight Atlas design.', 'satin'],
      ['Gloss', 'Shows fingerprints and reflects windows. Avoid it behind glass.', 'gloss'],
      ['Textured fine-art', 'Flatters the Travel Journal design, but softens very small type.', 'art'],
    ];
    // One real poster, the same corner of it on each paper.
    const sample = SAMPLES.find((s) => s.id === 'canada-midnight-atlas')!;
    const sw = 270;
    const sh = 170;
    const poster = await posterPng(sample.settings, 'canada', sample.visited, sample.wishlist, sw / 0.62);
    const crop = { left: Math.round(poster.w * PX * 0.2), top: Math.round(poster.h * PX * 0.235), width: sw * PX, height: sh * PX };
    const top = y + 58;
    const rowH = sh + 34;
    const overlays: Overlay[] = [];
    for (const [i, [name, text, finish]] of papers.entries()) {
      const ry = top + i * rowH;
      overlays.push({ png: await paperSwatch(poster.png, crop, finish), x: M, y: ry, w: sw, h: sh, shadow: 9 });
      const tx = M + sw + 32;
      p.text(name, tx, ry + 40, bold(28, t.ink));
      if (i === 0) {
        const badge = 'BEST FOR MAPS';
        const spec = bold(13, t.onAccent, { tracking: 110 });
        const bw = p.measure(badge, spec) + 28;
        p.path(roundRect(tx, ry + 58, bw, 28, 14), { fill: t.accent });
        p.text(badge, tx + 14, ry + 77, spec);
      }
      para(p, text, tx, ry + (i === 0 ? 120 : 80), sans(22, t.soft), W - M - tx, 1.32, 3);
    }
    footer(p, t, 'Read the print guide  →');
    return { overlays };
  },
  copy: {
    title: 'Best Paper for Printing a Map Poster: Matte, Satin, Gloss or Fine Art?',
    description:
      'Matte paper of 170 to 230 gsm suits map posters best: no glare under glass, and fine lettering stays crisp. Satin or lustre gives dark designs more depth, gloss shows fingerprints and reflects windows, and textured fine-art paper softens very small type. Plus sizes, pixels and bleed in the full print guide. #printables #posterprinting #wallart',
    link: `${SITE}/guides/print-a-travel-map-poster/`,
    board: BOARD.posters,
    alt: 'Four paper swatches for printing a map poster, matte, satin, gloss and textured fine-art, with matte marked best for maps.',
    tags: ['Printables', 'Wall art', 'Home decor'],
  },
};

// 13 ─ Alberta -----------------------------------------------------------------------------------
const alberta = bucketList(
  'CA-AB',
  PRAIRIE,
  'alberta-bucket-list',
  {
    title: 'Alberta Bucket List: 13 Places to See (Checklist)',
    description:
      'Thirteen places to see in Alberta: Lake Louise, the Columbia Icefield, Drumheller and the Royal Tyrrell Museum, Canmore and Kananaskis, plus Banff, Jasper, Waterton Lakes, Elk Island and Wood Buffalo national parks, and three more UNESCO World Heritage Sites, including Dinosaur Provincial Park. Tick them off on a free map of Canada. #alberta #banff #canadatravel',
    link: `${SITE}/maps/canada/`,
    board: BOARD.canadaBucket,
    alt: 'A map of Alberta with a checklist of 13 places to see, from Lake Louise and Banff National Park to Dinosaur Provincial Park.',
    tags: ['Alberta', 'Banff', 'Canada travel'],
  },
  ['calgary|14|8|start', 'edmonton|14|8|start'],
);

// 14 ─ Russia against ten islands --------------------------------------------------------------
const CARIB = ['ATG', 'BHS', 'BRB', 'CUB', 'DOM', 'GRD', 'HTI', 'JAM', 'LCA', 'TTO'];
const landShare = (ids: string[]) => (ids.reduce((s, id) => s + LAND_KM2[id], 0) / WORLD_LAND_KM2) * 100;
/** How many times more land Russia has than the ten island countries together. */
const RUSSIA_TIMES = Math.round(LAND_KM2.RUS / CARIB.reduce((s, id) => s + LAND_KM2[id], 0));
const russiaVsIslands: Pin = {
  id: 'russia-vs-ten-caribbean-islands',
  theme: PAPER,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Share of countries vs share of land', M, 196, t.accent);
    const y = headline(p, ['Which is more', 'of the world?'], M, 212, serif(104, t.ink));
    const gap = 24;
    const cw = (W - M * 2 - gap) / 2;
    const top = y + 58;
    const ch = 640;
    const mh = 262;
    const cards = [
      { title: 'Russia', ids: ['RUS'], count: '1 country', share: `${((1 / 195) * 100).toFixed(2)}%`, landShare: `${landShare(['RUS']).toFixed(1)}%`, crop: around(['RUS'], 60) },
      { title: '10 Caribbean island countries', ids: CARIB, count: '10 countries', share: `${((10 / 195) * 100).toFixed(1)}%`, landShare: `${landShare(CARIB).toFixed(2)}%`, crop: around(CARIB, 50) },
    ];
    const sea = '#E4E9EC';
    cards.forEach((cd, i) => {
      const x = M + i * (cw + gap);
      p.path(roundRect(x, top, cw, ch, 16), { fill: t.card });
      // The map fills the top of the card, like a photograph.
      const c = mapCtx(p, 'world', t, { visited: cd.ids, print: true, look: { paper: sea, water: sea, sphere: sea, sphereLine: sea, graticule: undefined } });
      p.group({ clip: roundRect(x, top, cw, ch, 16) }, () => {
        p.rect(x, top, cw, mh, { fill: sea });
        placeCrop(c, { x, y: top, w: cw, h: mh }, toAspect(cd.crop, cw / mh));
      });
      p.text(cd.title, x + 24, top + mh + 52, p.fit(cd.title, bold(26, t.ink), cw - 48, 18));
      p.text(cd.share, x + 24, top + mh + 140, serif(66, t.ink, { tracking: -8 }));
      p.text(`of the 195 countries (${cd.count})`, x + 24, top + mh + 176, sans(19, t.soft));
      p.line(x + 24, top + mh + 208, x + cw - 24, top + mh + 208, { stroke: t.line, strokeWidth: 1.5 });
      p.text(cd.landShare, x + 24, top + mh + 296, serif(66, t.accent, { tracking: -8 }));
      p.text('of the world’s land', x + 24, top + mh + 332, sans(19, t.soft));
    });
    para(p, `By count, the islands score ten times higher. By land, Russia is about ${RUSSIA_TIMES} times larger than all ten together.`, M, top + ch + 54, sans(25, t.ink), W - M * 2, 1.35, 3);
    footer(p, t, 'What’s my share?  →');
  },
  copy: {
    title: 'Russia vs 10 Caribbean Islands: Share of Countries vs Share of Land',
    description:
      `Russia is 1 of the 195 countries (0.51%) but ${landShare(['RUS']).toFixed(1)}% of the world’s land. Ten Caribbean island countries are 5.1% of the list but ${landShare(CARIB).toFixed(2)}% of the land: Russia is about ${RUSSIA_TIMES} times larger than all ten together. That is why a “percentage of the world visited” depends on how you count. Land areas: World Bank, 2022. #geography #travelfacts #worldmap`,
    link: `${SITE}/guides/what-percentage-of-the-world-have-you-visited/`,
    board: BOARD.checklists,
    alt: `Two cards comparing Russia, 0.51% of countries and ${landShare(['RUS']).toFixed(1)}% of the world’s land, with ten Caribbean island countries, 5.1% of countries and ${landShare(CARIB).toFixed(2)}% of the land.`,
    tags: ['Geography', 'Travel facts', 'World map'],
  },
};

// 15 ─ The cities poster, framed ----------------------------------------------------------------
const citiesPoster: Pin = {
  id: 'canada-cities-poster-framed',
  theme: SAGE_WALL,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Wall art you make yourself', M, 196, t.soft);
    headline(p, ['Every Canadian city', 'you’ve been to,', 'on one poster'], M, 212, serif(96, t.ink));
    // The sample cities poster in the Midnight Atlas design. The cities poster draws on the cities
    // map: the provinces' outlines as a base, with the 45 cities as points, as the studio builds it.
    const sample = SAMPLES.find((s) => s.id === 'cities-modern-cartographer')!;
    const settings = { ...defaultSettings(CANADA_CITIES_MAP), ...sample.settings, template: 'midnight-atlas' as const };
    const format = getFormat(settings.format);
    const geometry = {
      id: 'canada-cities', lod: 'display', width: MAPS.canada.geometry.width, height: MAPS.canada.geometry.height, shapes: {},
      points: CITY_POINTS, baseShapes: MAPS.canada.geometry.shapes, lakes: MAPS.canada.geometry.lakes, graticule: MAPS.canada.geometry.graticule,
    };
    const scene = composePoster(
      { def: CANADA_CITIES_MAP, meta: CITIES_META as never, geometry: geometry as never, selection: normalizeSelection(CANADA_CITIES_MAP, sample.visited, sample.wishlist), settings, format },
      await loadFonts(fontsFor(settings)),
    );
    const pw = 660;
    const cities = { png: await toPng(scene, Math.round(pw * PX)), w: pw, h: (pw * format.height) / format.width };
    const frameW = 16;
    const mat = 46;
    const ow = cities.w + (frameW + mat) * 2;
    const top = 596;
    const overlays = await framed(cities, (W - ow) / 2, top, '#1E1F22', frameW, mat);
    note(p, 'Midnight Atlas design, shown with sample data', W / 2, top + cities.h + (frameW + mat) * 2 + 40, t.soft, 'middle', 20);
    footer(p, t, 'Map my cities  →');
    return { overlays };
  },
  copy: {
    title: 'Canada Cities Map Poster: Every Canadian City You’ve Been To',
    description:
      'Mark the Canadian cities you have visited on a free map of 45 cities, every census metropolitan area plus every provincial and territorial capital, then turn it into a print-ready poster with your name and dates. Free, no sign-up. A gift idea for anyone who has moved around Canada. #canada #canadiancities #travelposter #wallart',
    link: `${SITE}/maps/canada-cities/`,
    board: BOARD.posters,
    alt: 'A framed navy and gold poster titled Canadian Cities I’ve Explored, with the cities a sample traveller has visited marked and named, on a sage green wall.',
    tags: ['Canadian cities', 'Travel poster', 'Wall art'],
  },
};

// 16 ─ UNESCO, year by year ---------------------------------------------------------------------
const unescoTimeline: Pin = {
  id: 'canada-unesco-sites-timeline',
  theme: PAPER,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Canada’s 22 World Heritage Sites', M, 196, t.accent);
    const y = headline(p, ['Canada’s UNESCO sites,', '1978 to 2023'], M, 212, serif(88, t.ink));
    const KIND = { cultural: '#C0532F', natural: '#2F6B5B', mixed: '#B8892E' } as const;
    const sites = [...HERITAGE_CANADA].sort((a, b) => a.years[0] - b.years[0] || a.name.localeCompare(b.name));
    const short = (n: string) => n.replace(' National Historic Site', '');
    const colW = (W - M * 2 - 30) / 2;
    const top = y + 74;
    const half = Math.ceil(sites.length / 2);
    for (const col of [0, 1]) {
      const list = sites.slice(col * half, col * half + half);
      const x = M + col * (colW + 30);
      // The thread first, so the dots sit on it.
      const steps = list.map((s) => 67 + (p.wrap(short(s.name), bold(20, t.ink), colW - 106, 2).length - 1) * 24);
      p.line(x + 8, top - 7, x + 8, top - 7 + steps.slice(0, -1).reduce((a, b) => a + b, 0), { stroke: t.line, strokeWidth: 2 });
      let ry = top;
      for (const s of list) {
        const nameLines = p.wrap(short(s.name), bold(20, t.ink), colW - 106, 2);
        p.circle(x + 8, ry - 7, 8, { fill: KIND[s.kind], stroke: t.paper, strokeWidth: 3 });
        p.text(String(s.years[0]), x + 28, ry, serif(30, t.ink, { tracking: 0 }));
        nameLines.forEach((line, k) => p.text(line, x + 106, ry - 2 + k * 24, bold(20, t.ink)));
        const where = s.provinces.map((id) => region(id).postal).join(' · ') + (s.sharedWith ? ' · with the U.S.' : '');
        p.text(where, x + 106, ry + 22 + (nameLines.length - 1) * 24, sans(16, t.soft));
        ry += 67 + (nameLines.length - 1) * 24;
      }
    }
    const ly = H - 190;
    let lx = M;
    for (const [kind, label] of [['cultural', 'Cultural'], ['natural', 'Natural'], ['mixed', 'Mixed']] as const) {
      p.circle(lx + 8, ly - 6, 7, { fill: KIND[kind] });
      p.text(label, lx + 22, ly, sans(19, t.ink));
      lx += p.measure(label, sans(19, t.ink)) + 58;
    }
    note(p, 'Year first listed. Source: UNESCO World Heritage Centre.', W - M, ly, t.soft, 'end', 17);
    footer(p, t, 'All 22, by province  →');
  },
  copy: {
    title: 'Canada’s UNESCO World Heritage Sites in Order, 1978 to 2023',
    description:
      'Canada has 22 UNESCO World Heritage Sites. The first two were listed in 1978: L’Anse aux Meadows, the Viking site in Newfoundland, and Nahanni National Park. The newest, from 2023, are Anticosti in Quebec and Tr’ondëk-Klondike in Yukon. All 22 by year, with 10 cultural, 11 natural and 1 mixed. Source: UNESCO. #unesco #canadatravel #worldheritage',
    link: `${SITE}/guides/unesco-world-heritage-sites-in-canada/`,
    board: BOARD.canadaChecklists,
    alt: 'A timeline of Canada’s 22 UNESCO World Heritage Sites by the year each was listed, from L’Anse aux Meadows and Nahanni in 1978 to Anticosti and Tr’ondëk-Klondike in 2023.',
    tags: ['UNESCO World Heritage', 'Canada travel', 'Bucket list'],
  },
};

// 17 ─ Which continent? -------------------------------------------------------------------------
const whichContinent: Pin = {
  id: 'which-continent-quiz',
  theme: CREAM,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Continent quiz', M, 196, t.accent);
    const y = headline(p, ['Which continent?'], M, 212, serif(112, t.ink));
    p.text('6 places people argue about, answered.', M, y + 56, sans(30, t.soft));
    const quiz: [string, string, string, Box][] = [
      ['RUS', 'Russia', 'Europe', around(['RUS'], 150)],
      ['TUR', 'Türkiye', 'Asia', around(['TUR'], 260, [1000, 560])],
      ['EGY', 'Egypt', 'Africa', around(['EGY'], 260, [1000, 560])],
      ['CYP', 'Cyprus', 'Asia', around(['CYP'], 60, [700, 390])],
      ['PAN', 'Panama', 'North America', around(['PAN'], 120, [800, 450])],
      ['GRL', 'Greenland', 'North America', around(['GRL'], 160)],
    ];
    const gap = 22;
    const tw = (W - M * 2 - gap) / 2;
    const th = 250;
    const mh = 154;
    const top = y + 104;
    quiz.forEach(([id, name, answer, crop], i) => {
      const x = M + (i % 2) * (tw + gap);
      const ty = top + Math.floor(i / 2) * (th + gap);
      p.path(roundRect(x, ty, tw, th, 14), { fill: t.card });
      const sea = '#DDE3E3';
      const c = mapCtx(p, 'world', t, { visited: [id], print: true, look: { paper: sea, water: sea, sphere: sea, sphereLine: sea, graticule: undefined } });
      p.group({ clip: roundRect(x, ty, tw, th, 14) }, () => {
        p.rect(x, ty, tw, mh, { fill: sea });
        placeCrop(c, { x, y: ty, w: tw, h: mh }, toAspect(crop, tw / mh));
      });
      p.text(name, x + 20, ty + mh + 40, bold(23, t.ink));
      p.text(answer, x + 20, ty + mh + 80, serif(36, t.accent, { tracking: -4 }));
    });
    para(p, 'As the UN’s statistical regions draw them, with the Americas split in two. Other lists draw some of these lines differently.', M, top + 3 * (th + gap) + 14, sans(19, t.soft), W - M * 2, 1.35, 2);
    footer(p, t, 'Countries by continent  →');
  },
  copy: {
    title: 'Which Continent Is It On? Russia, Türkiye, Egypt, Cyprus, Panama, Greenland',
    description:
      'Using the United Nations’ statistical regions: Russia is in Europe, Türkiye and Cyprus are in Asia, Egypt is in Africa, and Panama and Greenland are in North America. Other lists draw some of these lines differently, which changes a continent’s count but never the total of 195 countries. #geography #travelfacts #continents',
    link: `${SITE}/guides/countries-visited-checklist/`,
    board: BOARD.checklists,
    alt: 'A continent quiz with six small maps: Russia in Europe, Türkiye and Cyprus in Asia, Egypt in Africa, Panama and Greenland in North America.',
    tags: ['Geography', 'Travel facts', 'World map'],
  },
};

// 18 ─ Been there, going there ------------------------------------------------------------------
const wishlistMap: Pin = {
  id: 'been-there-want-to-go-map',
  theme: SAND,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Been there, going there', M, 196, t.accent);
    const y = headline(p, ['Map where you’ve', 'been, and where', 'you’re going next'], M, 212, serif(94, t.ink));
    const visited = ['CA-BC', 'CA-AB', 'CA-ON', 'CA-QC', 'CA-NS', 'CA-PE'];
    const wishlist = ['CA-NL', 'CA-YT', 'CA-NU'];
    const c = mapCtx(p, 'canada', t, { visited, wishlist, print: true });
    const placed = placeMap(c, { x: 30, y: y + 30, w: W - 60, h: 684 });
    const ly = y + 764;
    p.rect(M, ly - 22, 30, 30, { fill: t.accent });
    p.text('Been there', M + 44, ly, bold(23, t.ink));
    const hx = M + 250;
    p.rect(hx, ly - 22, 30, 30, { fill: t.land, stroke: t.accent, strokeWidth: 1.5 });
    p.group({ clip: rectD({ x: hx, y: ly - 22, w: 30, h: 30 }) }, () => {
      for (let k = -30; k < 40; k += 7) p.line(hx + k, ly + 8, hx + k + 30, ly - 22, { stroke: t.accent, strokeWidth: 1.5 });
    });
    p.text('Want to go', hx + 44, ly, bold(23, t.ink));
    note(p, 'Example map', W - M, ly, t.soft, 'end', 19);
    // Notes in the open sea: one by Newfoundland, pointing at the island; one by Baffin Island.
    const [sjx, sjy] = placed.at(...CITY_POINTS['st-johns']);
    const [iqx, iqy] = placed.at(...CITY_POINTS.iqaluit);
    return {
      over: (q) => {
        q.text('next summer?', W - 36, sjy + 172, hand(40, t.ink, { anchor: 'end' }));
        arrow(q, sjx + 34, sjy + 132, sjx - 10, sjy + 46, t.ink, -0.25);
        q.text('one day…', iqx + 190, iqy - 120, hand(40, t.ink, { anchor: 'middle' }));
        arrow(q, iqx + 140, iqy - 104, iqx + 30, iqy - 46, t.ink, 0.25);
        footer(q, t, 'Start my map  →');
      },
    };
  },
  copy: {
    title: 'Canada Bucket List Map: Colour Where You’ve Been and Where You Want to Go',
    description:
      'Colour in the provinces and territories you have visited, then mark the ones on your bucket list: they show with stripes, so the two never blur together. The free Canada map keeps your count and percentage, saves in your browser and turns into a poster. #canadabucketlist #canadatravel #travelmap',
    link: `${SITE}/maps/canada/`,
    board: BOARD.canadaBucket,
    alt: 'An example map of Canada with six visited provinces in solid green and Yukon, Nunavut and Newfoundland and Labrador striped as places to go next.',
    tags: ['Canada bucket list', 'Canada travel', 'Travel map'],
  },
};

// 19 ─ Quebec ------------------------------------------------------------------------------------
const quebec = bucketList(
  'CA-QC',
  QBLUE,
  'quebec-bucket-list',
  {
    title: 'Quebec Bucket List: 14 Places to See (Checklist)',
    description:
      'Fourteen places to see in Quebec: Old Montréal, Mont-Tremblant, Montmorency Falls, Percé Rock, Île d’Orléans, Charlevoix, the Saguenay Fjord and the Magdalen Islands, plus Forillon, La Mauricie and Mingan Archipelago national parks and three UNESCO sites, including Old Québec. Tick them off on a free map of Canada. #quebec #montreal #canadatravel',
    link: `${SITE}/maps/canada/`,
    board: BOARD.canadaBucket,
    alt: 'A map of Quebec with a checklist of 14 places to see, from Old Montréal and Percé Rock to Forillon National Park and Old Québec.',
    tags: ['Quebec', 'Montreal', 'Canada travel'],
  },
  ['montreal|-14|20|end', 'quebec-city|14|-12|start'],
);

// 20 ─ World milestones --------------------------------------------------------------------------
const worldMilestones: Pin = {
  id: 'world-travel-milestones',
  theme: NAVY,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'World map milestones', M, 196, t.accent);
    const y = headline(p, ['5 travel milestones.', 'Which have you hit?'], M, 212, serif(90, t.ink));
    // The rules as the world map states them (src/lib/maps/achievements.ts).
    const steps = [
      ['First Adventure', 'Mark your first country.', '1'],
      ['Double Digits', 'Mark 10 countries.', '10'],
      ['Regional Explorer', 'Mark at least one country on each of the six inhabited continents.', '6'],
      ['Halfway There', 'Mark at least half: 98 of the 195 countries.', '98'],
      ['Complete Explorer', 'Mark all 195 countries.', '195'],
    ];
    const top = y + 64;
    const rowH = 174;
    const r = 66;
    const cx = M + r;
    // The thread between the seals, drawn first so the seals sit on it.
    p.line(cx, top + r, cx, top + r + (steps.length - 1) * rowH, { stroke: t.accent, strokeWidth: 2, dash: [3, 8], lineCap: 'round' });
    steps.forEach(([name, rule, n], i) => {
      const ry = top + i * rowH;
      seal(p, t, name, n, cx, ry + r, r, [-9, 6, -4, 8, -6][i]);
      p.text(name, M + r * 2 + 34, ry + 56, serif(44, t.ink, { tracking: -6 }));
      para(p, rule, M + r * 2 + 34, ry + 96, sans(23, t.soft), W - M - (M + r * 2 + 34), 1.3, 2);
    });
    footer(p, t, 'Start counting  →');
  },
  copy: {
    title: 'World Travel Milestones: How Many Countries Have You Been To?',
    description:
      'Five milestones on the WorldTripMap world map: First Adventure (your first country), Double Digits (10 countries), Regional Explorer (a country on each of the six inhabited continents), Halfway There (98 of the 195) and Complete Explorer (all 195). Mark your countries free and see which you have reached. #travelgoals #countriesvisited #wanderlust',
    link: `${SITE}/maps/world/`,
    board: BOARD.checklists,
    alt: 'Five travel milestones as badges: First Adventure, Double Digits at 10 countries, Regional Explorer on six continents, Halfway There at 98 and Complete Explorer at 195.',
    tags: ['Travel goals', 'Countries visited', 'Wanderlust'],
  },
};

// 21 ─ The order they joined ------------------------------------------------------------------
const joinedOrder: Pin = {
  id: 'order-canada-provinces-joined',
  theme: CREAM,
  async draw(p, t) {
    brand(p, t, M + 16, 88);
    kicker(p, 'Canada 101 · provinces and territories', M, 196, t.accent);
    const y = headline(p, ['The order Canada’s', 'provinces joined'], M, 212, serif(92, t.ink));
    const eras: [number[], string][] = [
      [[1867], '#7A2617'],
      [[1870, 1871, 1873], '#A8442B'],
      [[1898, 1905], '#C9704F'],
      [[1949], '#DFA185'],
      [[1999], '#F0CDBB'],
    ];
    const colourOf = (year: number) => eras.find(([years]) => years.includes(year))![1];
    const c = mapCtx(p, 'canada', t, { print: true });
    const placed = placeMap(c, { x: 30, y: y + 24, w: W - 60, h: 456 });
    fillAreas(c, placed, Object.fromEntries(CANADA_REGIONS.map((r) => [r.id, colourOf(Number(r.joined.slice(0, 4)))])));
    const years = [...new Set(CANADA_REGIONS.map((r) => Number(r.joined.slice(0, 4))))].sort((a, b) => a - b);
    const top = y + 540;
    const rowH = 46;
    years.forEach((yr, i) => {
      const ry = top + i * rowH;
      const names = CANADA_REGIONS.filter((r) => Number(r.joined.slice(0, 4)) === yr).map((r) =>
        r.id === 'CA-NL' ? 'Newfoundland (now Newfoundland and Labrador)' : r.name,
      );
      p.rect(M, ry - 20, 24, 24, { fill: colourOf(yr) });
      p.text(String(yr), M + 40, ry, serif(30, t.ink, { tracking: 0 }));
      const spec = p.fit(names.join(', '), bold(20, t.ink), W - M - (M + 130), 15);
      p.text(names.join(', '), M + 130, ry - 2, spec);
    });
    footer(p, t, 'Canada’s 13, explained  →');
  },
  copy: {
    title: 'The Order Canada’s Provinces and Territories Joined (1867 to 1999)',
    description:
      'Canada began on 1 July 1867 with four provinces: Ontario, Quebec, Nova Scotia and New Brunswick. Manitoba and the Northwest Territories followed in 1870, British Columbia in 1871 and Prince Edward Island in 1873. Yukon was created in 1898, Alberta and Saskatchewan became provinces in 1905, Newfoundland joined in 1949, and Nunavut was split from the Northwest Territories in 1999. #canadahistory #canada #canadafacts',
    link: `${SITE}/guides/canada-provinces-and-territories/`,
    board: BOARD.canadaChecklists,
    alt: 'A map of Canada shaded by the year each province and territory joined Canada or was created, from the four provinces of 1867 to Nunavut in 1999, with a timeline below.',
    tags: ['Canada history', 'Canada', 'Canada facts'],
  },
};

// ------------------------------------------------------------------ schedule

/** Seven days, three a day: a Canada pin, a world pin and a poster or how-to pin. */
const SCHEDULE: Pin[][] = [
  [ontario, countriesCloseUp, mapKinds],
  [torontoBars, puertoRico, giftWorld],
  [bc, fourRules, frameShapes],
  [capitalQuiz, territories, paperGuide],
  [alberta, russiaVsIslands, citiesPoster],
  [unescoTimeline, whichContinent, wishlistMap],
  [quebec, worldMilestones, joinedOrder],
];

await buildWeek(SCHEDULE, OUT, ONLY);
