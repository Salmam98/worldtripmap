/**
 * Route posters: famous journeys drawn on the site's own world and Canada maps.
 *
 *   npx tsx scripts/marketing/build-route-posters.ts <out-dir>
 *
 * Routes are drawn in outline through their documented stops; sea legs pass through a few unlabelled
 * waypoints so a line does not cut across land. Facts were checked on 12 October 2026 against:
 *   - Around the World in Eighty Days (Verne, 1872): the planned itinerary and the 2 October 1872 start.
 *   - Magellan expedition: departure 20 September 1519 from Sanlúcar de Barrameda, five ships, about
 *     270 men, return of the Victoria with 18 men on 6 September 1522, and the dates of each stop.
 *   - Trans-Canada Highway: opened 1962, completed 1971, Victoria to St. John's, nine provinces on the
 *     main route, ferries across the Strait of Georgia and the Cabot Strait.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { geoConicConformal, geoEqualEarth, geoPath, type GeoProjection } from 'd3-geo';
import sharp from 'sharp';
import { CANADA } from '../../src/data/definitions/canada';
import { WORLD } from '../../src/data/definitions/world';
import { computeAchievements } from '../../src/lib/maps/achievements';
import { computeStats } from '../../src/lib/maps/stats';
import { normalizeSelection } from '../../src/lib/maps/store';
import type { MapDefinition } from '../../src/lib/maps/types';
import { drawMap } from '../../src/lib/poster/compose';
import type { Ctx, PlacedMap } from '../../src/lib/poster/context';
import { loadFonts } from '../../src/lib/poster/fonts';
import { getFormat } from '../../src/lib/poster/formats';
import { Painter, type TextSpec } from '../../src/lib/poster/painter';
import { sceneToSvg } from '../../src/lib/poster/render-svg';
import type { Scene } from '../../src/lib/poster/scene';
import type { TemplateId } from '../../src/lib/poster/settings';
import { defaultSettings } from '../../src/lib/poster/settings';
import { TEMPLATES } from '../../src/lib/poster/templates';

const OUT = process.argv[2] ?? 'route-posters';
const W = 1600;
const H = 2400;
const M = 120;
const MAP_W = 10_000;

const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));

// ------------------------------------------------------------- projections

/** The same projections scripts/geo/build-geo.ts used, so routes land on the drawn maps. */
function fitWidth(projection: GeoProjection, object: any, pad: number): void {
  projection.fitWidth(MAP_W - pad * 2, object);
  const [tx, ty] = projection.translate();
  projection.translate([tx + pad, ty + pad]);
}
const worldProjection = geoEqualEarth().rotate([-11, 0]).precision(0.05);
fitWidth(worldProjection, { type: 'Sphere' }, 20);

const provinces = await json('.cache/natural-earth/v5.1.2/ne_10m_admin_1_states_provinces_lakes.geojson');
const wanted = new Set(CANADA.features.map((f) => f.id));
provinces.features = provinces.features.filter((f: any) => f.properties.iso_a2 === 'CA' && wanted.has(f.properties.iso_3166_2));
const canadaProjection = geoConicConformal().parallels([49, 77]).rotate([91.866667, 0]).center([0, 63.390675]).precision(0.05);
fitWidth(canadaProjection, provinces, 120);

// A check that the projection matches the map: Toronto should land on the cities map's Toronto.
{
  const points = (await json('src/data/maps/canada-cities.points.json')).points;
  const [x, y] = canadaProjection([-79.421967, 43.701926])!;
  const [ex, ey] = points.toronto;
  if (Math.hypot(x - ex, y - ey) > 15) throw new Error(`Canada projection is off: ${x},${y} vs ${ex},${ey}`);
}

// ------------------------------------------------------------- drawing

type LonLat = [number, number];
interface Stop {
  at: LonLat;
  name: string;
  note?: string;
  /** Where the label sits, relative to the dot, in poster units. */
  dx: number;
  dy: number;
  anchor?: 'start' | 'middle' | 'end';
}
interface Leg {
  /** Stops and unlabelled waypoints, in order. */
  path: LonLat[];
  dashed?: boolean;
}
interface Palette {
  paper: string;
  ink: string;
  soft: string;
  route: string;
  dot: string;
  land?: string;
}
interface Spec {
  id: string;
  map: 'world' | 'canada';
  template: TemplateId;
  palette: Palette;
  kicker: string;
  title: string[];
  sub: string;
  stops: Stop[];
  legs: Leg[];
  facts: { value: string; label: string }[];
  footnote: string;
  /** Map box: top and height. */
  mapTop: number;
  mapH: number;
}

const fonts = await loadFonts(['dmserif-400', 'dmserif-400i', 'manrope-500', 'manrope-700']);

async function poster(spec: Spec): Promise<Buffer> {
  const pal = spec.palette;
  const p = new Painter(fonts);
  p.rect(0, 0, W, H, { fill: pal.paper });
  // A fine double frame, as on a printed map.
  p.rect(48, 48, W - 96, H - 96, { stroke: pal.ink, strokeWidth: 2.2, strokeOpacity: 0.85 });
  p.rect(60, 60, W - 120, H - 120, { stroke: pal.ink, strokeWidth: 0.8, strokeOpacity: 0.5 });

  const label = (size: number, fill = pal.route): TextSpec => ({ font: 'manrope-700', size, fill, tracking: 220, upper: true });
  p.text(spec.kicker, W / 2, 210, { ...label(26), anchor: 'middle' });
  let y = 210;
  const titleSpec: TextSpec = { font: 'dmserif-400', size: 168, fill: pal.ink, tracking: -14, anchor: 'middle' };
  let size = 168;
  while (Math.max(...spec.title.map((l) => p.measure(l, { ...titleSpec, size }))) > W - M * 2 && size > 100) size -= 4;
  for (const line of spec.title) {
    y += size * 1.0;
    p.text(line, W / 2, y, { ...titleSpec, size });
  }
  y += 78;
  p.text(spec.sub, W / 2, y, { font: 'dmserif-400i', size: 44, fill: pal.soft, anchor: 'middle' });
  p.line(W / 2 - 60, y + 50, W / 2 + 60, y + 50, { stroke: pal.route, strokeWidth: 2.5 });

  // The map.
  const def: MapDefinition = spec.map === 'world' ? WORLD : CANADA;
  const meta = await json(`src/data/maps/${spec.map}.meta.json`);
  const geometry = await json(`src/data/maps/${spec.map}.display.json`);
  const tpl = TEMPLATES[spec.template];
  const settings = { ...defaultSettings(def), template: spec.template, showLabels: false };
  const look = { ...tpl.look(settings), paper: pal.paper, water: pal.paper };
  if (pal.land) look.land = pal.land;
  if (look.sphere) look.sphere = pal.paper;
  const selection = normalizeSelection(def, [], []);
  const c: Ctx = {
    p, W, H, bleed: 0, def, meta, geometry, selection, settings, format: getFormat('print'),
    stats: computeStats(def, selection), places: null, achievements: computeAchievements(def, selection),
    look, template: tpl, top: spec.mapTop, bottom: spec.mapTop + spec.mapH, corners: [],
  };
  const placed: PlacedMap = drawMap(c, { x: 80, y: spec.mapTop, w: W - 160, h: spec.mapH });
  const [ox, oy] = placed.at(0, 0);
  const s = placed.scale;
  const proj = spec.map === 'world' ? worldProjection : canadaProjection;
  const path = geoPath(proj);
  const toPoster = (ll: LonLat) => {
    const [x, y2] = proj(ll)!;
    return placed.at(x, y2);
  };

  // Route: a soft wide underlay, then the line itself.
  for (const leg of spec.legs) {
    const d = path({ type: 'LineString', coordinates: leg.path } as any);
    if (!d) continue;
    p.path(d, { stroke: pal.paper, strokeWidth: 13 / s, strokeOpacity: 0.75, lineCap: 'round', lineJoin: 'round', transform: [s, 0, 0, s, ox, oy] });
    p.path(d, { stroke: pal.route, strokeWidth: 5 / s, lineCap: 'round', lineJoin: 'round', dash: leg.dashed ? [14 / s, 11 / s] : undefined, transform: [s, 0, 0, s, ox, oy] });
  }
  // Stops.
  for (const stop of spec.stops) {
    const [x, y2] = toPoster(stop.at);
    p.circle(x, y2, 11, { fill: pal.paper });
    p.circle(x, y2, 7.5, { fill: pal.dot, stroke: pal.paper, strokeWidth: 2.5 });
    const anchor = stop.anchor ?? 'start';
    const halo = (draw: () => void) => {
      const start = p.nodes.length;
      draw();
      const added = p.nodes.splice(start);
      for (const node of added) if (node.type === 'path') p.nodes.push({ ...node, fill: pal.paper, stroke: pal.paper, strokeWidth: 7, lineJoin: 'round', fillOpacity: 0.9, strokeOpacity: 0.9 });
      p.nodes.push(...added);
    };
    halo(() => p.text(stop.name, x + stop.dx, y2 + stop.dy, { font: 'manrope-700', size: 28, fill: pal.ink, anchor }));
    if (stop.note) halo(() => p.text(stop.note!, x + stop.dx, y2 + stop.dy + 31, { font: 'manrope-500', size: 23, fill: pal.soft, anchor }));
  }

  // Facts along the foot.
  const factsTop = H - 640;
  p.line(M, factsTop, W - M, factsTop, { stroke: pal.ink, strokeWidth: 1, strokeOpacity: 0.35 });
  const colW = (W - M * 2) / spec.facts.length;
  spec.facts.forEach((f, i) => {
    const cx = M + colW * (i + 0.5);
    p.text(f.value, cx, factsTop + 130, { font: 'dmserif-400', size: 96, fill: pal.ink, anchor: 'middle', tracking: -10 });
    const lines = p.wrap(f.label, { font: 'manrope-500', size: 26, fill: pal.soft }, colW - 30, 2);
    lines.forEach((l, li) => p.text(l, cx, factsTop + 182 + li * 34, { font: 'manrope-500', size: 26, fill: pal.soft, anchor: 'middle' }));
    if (i > 0) p.line(M + colW * i, factsTop + 40, M + colW * i, factsTop + 220, { stroke: pal.ink, strokeWidth: 1, strokeOpacity: 0.2 });
  });
  p.line(M, factsTop + 270, W - M, factsTop + 270, { stroke: pal.ink, strokeWidth: 1, strokeOpacity: 0.35 });

  const foot = p.wrap(spec.footnote, { font: 'manrope-500', size: 21, fill: pal.soft }, W - M * 2 - 40, 3);
  foot.forEach((l, i) => p.text(l, W / 2, H - 196 + i * 30, { font: 'manrope-500', size: 21, fill: pal.soft, anchor: 'middle' }));
  p.text('worldtripmap.com', W / 2, H - 92, { ...label(24, pal.ink), anchor: 'middle', tracking: 260 });

  const scene: Scene = { width: W, height: H, bleed: 0, background: pal.paper, nodes: p.nodes, description: spec.title.join(' ') };
  return sharp(Buffer.from(sceneToSvg(scene, { pixelWidth: 2000 })), { limitInputPixels: false }).png({ compressionLevel: 9 }).toBuffer();
}

// ------------------------------------------------------------- the journeys

const LONDON: LonLat = [-0.1276, 51.5072];

const VERNE: Spec = {
  id: 'around-the-world-in-80-days',
  map: 'world',
  template: 'travel-journal',
  palette: { paper: '#EFE7D4', ink: '#2E2A24', soft: '#6B6150', route: '#A23B26', dot: '#2E2A24', land: '#DCCFB2' },
  kicker: 'Jules Verne · 1872',
  title: ['Around the World', 'in 80 Days'],
  sub: 'Phileas Fogg’s route, as he planned it',
  mapTop: 700,
  mapH: 1000,
  stops: [
    { at: LONDON, name: 'London', note: 'Day 0 · Day 80', dx: -14, dy: -62, anchor: 'end' },
    { at: [32.55, 29.97], name: 'Suez', note: 'Day 7', dx: -14, dy: 42, anchor: 'end' },
    { at: [72.88, 19.08], name: 'Bombay', note: 'Day 20', dx: -16, dy: 44, anchor: 'end' },
    { at: [88.36, 22.57], name: 'Calcutta', note: 'Day 23', dx: 0, dy: -56, anchor: 'middle' },
    { at: [114.17, 22.32], name: 'Hong Kong', note: 'Day 36', dx: 14, dy: 46 },
    { at: [139.64, 35.44], name: 'Yokohama', note: 'Day 42', dx: 16, dy: -10 },
    { at: [-122.42, 37.77], name: 'San Francisco', note: 'Day 64', dx: -16, dy: 46, anchor: 'end' },
    { at: [-74.0, 40.71], name: 'New York', note: 'Day 71', dx: 14, dy: 46 },
  ],
  legs: [
    { path: [LONDON, [2.35, 48.86], [7.69, 45.07], [17.94, 40.63]], dashed: true },
    { path: [[17.94, 40.63], [20.5, 36.0], [32.3, 31.26], [32.55, 29.97]] },
    { path: [[32.55, 29.97], [38.5, 20.0], [43.4, 12.6], [45.03, 12.78], [52.0, 13.5], [65.0, 17.0], [72.88, 19.08]] },
    { path: [[72.88, 19.08], [81.85, 25.43], [88.36, 22.57]], dashed: true },
    { path: [[88.36, 22.57], [89.5, 16.0], [95.5, 7.0], [98.0, 4.5], [103.85, 1.29], [106.5, 6.0], [110.5, 14.0], [114.17, 22.32]] },
    { path: [[114.17, 22.32], [121.5, 25.5], [129.0, 30.5], [139.64, 35.44]] },
    { path: [[139.64, 35.44], [-122.42, 37.77]] },
    { path: [[-122.42, 37.77], [-111.89, 40.76], [-95.93, 41.26], [-87.63, 41.88], [-74.0, 40.71]], dashed: true },
    { path: [[-74.0, 40.71], [-8.3, 51.85], LONDON] },
  ],
  facts: [
    { value: '80', label: 'days, by the plan' },
    { value: '8', label: 'legs, by rail and steamer' },
    { value: '2 Oct', label: '1872, the day he set out' },
  ],
  footnote: 'The route follows the eight legs Fogg planned in the novel. In the story he crossed India partly by elephant, sailed to Shanghai on a pilot boat and reached London through Ireland and Liverpool. Rail legs dashed. Route shown in outline.',
};

const SANLUCAR: LonLat = [-6.35, 36.78];
const MAGELLAN: Spec = {
  id: 'first-voyage-around-the-world',
  map: 'world',
  template: 'midnight-atlas',
  palette: { paper: '#101B2D', ink: '#F4EFE3', soft: '#A9B3C1', route: '#E0B252', dot: '#E0B252', land: '#22334F' },
  kicker: 'Magellan and Elcano · 1519–1522',
  title: ['The First Voyage', 'Around the World'],
  sub: 'Five ships left Spain. One came home.',
  mapTop: 700,
  mapH: 1000,
  stops: [
    { at: SANLUCAR, name: 'Sanlúcar', note: 'Sep 1519 · Sep 1522', dx: 18, dy: -28 },
    { at: [-43.17, -22.91], name: 'Rio de Janeiro', note: 'Dec 1519', dx: 18, dy: 10 },
    { at: [-67.72, -49.31], name: 'San Julián', note: 'Mar 1520', dx: 18, dy: 0 },
    { at: [-70.9, -53.2], name: 'The Strait', note: 'Nov 1520', dx: -16, dy: 40, anchor: 'end' },
    { at: [144.75, 13.45], name: 'Guam', note: 'Mar 1521', dx: 16, dy: -14 },
    { at: [123.9, 10.31], name: 'Cebu', note: 'Apr 1521', dx: -16, dy: -26, anchor: 'end' },
    { at: [127.4, 0.68], name: 'Tidore', note: 'Nov 1521', dx: 16, dy: 34 },
    { at: [18.47, -34.36], name: 'Cape of Good Hope', note: 'May 1522', dx: 0, dy: 48, anchor: 'middle' },
    { at: [-23.51, 14.93], name: 'Cape Verde', note: 'Jul 1522', dx: -18, dy: 8, anchor: 'end' },
  ],
  legs: [
    {
      path: [
        SANLUCAR, [-16.25, 28.47], [-22.0, 12.0], [-30.0, 0.0], [-34.8, -7.5], [-43.17, -22.91], [-50.0, -30.0], [-56.5, -35.5],
        [-63.0, -42.5], [-67.72, -49.31], [-68.35, -52.33], [-70.9, -53.2], [-74.7, -52.7], [-76.5, -46.0], [-80.0, -32.0],
        [-110.0, -22.0], [-138.8, -14.8], [-160.0, -4.0], [175.0, 8.0], [144.75, 13.45], [125.72, 10.73], [123.9, 10.31],
      ],
    },
    { path: [[123.9, 10.31], [122.0, 7.0], [125.0, 3.0], [127.4, 0.68]] },
    {
      path: [
        [127.4, 0.68], [125.5, -8.5], [110.0, -15.0], [80.0, -30.0], [40.0, -37.5], [18.47, -34.36], [10.0, -20.0], [-5.0, 0.0],
        [-23.51, 14.93], [-25.0, 25.0], [-15.0, 33.0], SANLUCAR,
      ],
    },
  ],
  facts: [
    { value: '5', label: 'ships set out from Spain' },
    { value: '~270', label: 'men sailed with the fleet' },
    { value: '18', label: 'came home on the Victoria' },
  ],
  footnote: 'Magellan was killed at Mactan in the Philippines in April 1521. Juan Sebastián Elcano brought the Victoria home on 6 September 1522, completing the first circumnavigation. Route shown in outline.',
};

const TCH: Spec = {
  id: 'trans-canada-highway',
  map: 'canada',
  template: 'nordic-explorer',
  palette: { paper: '#F6F3EC', ink: '#14202F', soft: '#556172', route: '#C0392B', dot: '#14202F', land: '#E3DDCF' },
  kicker: 'Coast to coast · Mile 0 to St. John’s',
  title: ['The Trans-Canada', 'Highway'],
  sub: 'From the Pacific to the Atlantic, by road',
  mapTop: 750,
  mapH: 1000,
  stops: [
    { at: [-123.35, 48.433], name: 'Victoria', note: 'Mile 0', dx: 0, dy: 48, anchor: 'middle' },
    { at: [-114.08, 51.08], name: 'Calgary', dx: 0, dy: -26, anchor: 'middle' },
    { at: [-104.62, 50.45], name: 'Regina', dx: 0, dy: 48, anchor: 'middle' },
    { at: [-97.17, 49.88], name: 'Winnipeg', dx: 0, dy: -26, anchor: 'middle' },
    { at: [-89.27, 48.45], name: 'Thunder Bay', dx: 0, dy: 50, anchor: 'middle' },
    { at: [-75.7, 45.42], name: 'Ottawa', dx: -12, dy: 46, anchor: 'end' },
    { at: [-73.59, 45.5], name: 'Montréal', dx: 0, dy: -26, anchor: 'middle' },
    { at: [-66.63, 45.95], name: 'Fredericton', dx: 0, dy: 50, anchor: 'middle' },
    { at: [-59.15, 47.57], name: 'Port aux Basques', dx: -14, dy: -22, anchor: 'end' },
    { at: [-52.68, 47.58], name: 'St. John’s', dx: 0, dy: 50, anchor: 'middle' },
  ],
  legs: [
    { path: [[-123.35, 48.433], [-123.93, 49.146]] },
    { path: [[-123.93, 49.146], [-123.27, 49.37]], dashed: true },
    {
      path: [
        [-123.27, 49.37], [-121.95, 49.17], [-121.44, 49.38], [-120.33, 50.67], [-118.18, 51.0], [-117.0, 51.3], [-115.57, 51.18], [-114.08, 51.08],
        [-110.68, 50.03], [-107.77, 50.28], [-105.55, 50.4], [-104.62, 50.45], [-99.95, 49.83], [-97.17, 49.88], [-94.47, 49.77],
        [-92.0, 49.4], [-89.27, 48.45], [-87.3, 48.75], [-86.5, 48.65], [-84.78, 48.0], [-84.33, 46.52], [-80.97, 46.5], [-79.45, 46.3],
        [-77.1, 45.8], [-75.7, 45.42], [-73.59, 45.5], [-72.5, 46.1], [-71.18, 46.8], [-69.53, 47.83], [-68.33, 47.38], [-67.6, 46.6],
        [-66.63, 45.95], [-64.77, 46.08], [-63.28, 45.36], [-61.5, 45.6], [-60.25, 46.21],
      ],
    },
    { path: [[-60.25, 46.21], [-59.15, 47.57]], dashed: true },
    { path: [[-59.15, 47.57], [-58.4, 48.4], [-57.93, 48.95], [-56.0, 48.95], [-54.55, 48.95], [-53.9, 48.2], [-52.68, 47.58]] },
  ],
  facts: [
    { value: '1962', label: 'officially opened' },
    { value: '9', label: 'provinces on the main route' },
    { value: '2', label: 'ferry crossings, west and east' },
  ],
  footnote: 'The main route runs from Mile 0 in Victoria to St. John’s, Newfoundland, with ferries across the Strait of Georgia and the Cabot Strait (dashed). Construction was completed in 1971. Route shown in outline.',
};

await mkdir(OUT, { recursive: true });
for (const spec of [VERNE, MAGELLAN, TCH]) {
  const png = await poster(spec);
  await writeFile(`${OUT}/${spec.id}.png`, png);
  console.log(spec.id);
}
