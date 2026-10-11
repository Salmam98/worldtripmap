/**
 * Renders the images the site ships with, using the same poster engine visitors use:
 *
 *   public/samples/*.webp   example posters for the gallery and the home page
 *   public/og/*.png         social sharing images (1200 × 630)
 *   public/icons/*.png      favicon and home-screen icons
 *
 * Run with: npm run assets:build. The output is committed, so a normal site build does not need it.
 */
import { mkdir, readFile } from 'node:fs/promises';
import sharp, { type Sharp } from 'sharp';
import { CANADA } from '../../src/data/definitions/canada';
import { CANADA_CITIES_MAP } from '../../src/data/definitions/canada-cities';
import { WORLD } from '../../src/data/definitions/world';
import { SAMPLES } from '../../src/data/samples';
import { computeAchievements } from '../../src/lib/maps/achievements';
import { computeStats } from '../../src/lib/maps/stats';
import { normalizeSelection } from '../../src/lib/maps/store';
import type { Lod, MapDefinition, MapGeoMeta, MapGeometry, MapId } from '../../src/lib/maps/types';
import { composePoster, drawMap, fontsFor } from '../../src/lib/poster/compose';
import type { Ctx } from '../../src/lib/poster/context';
import { loadFonts } from '../../src/lib/poster/fonts';
import { getFormat } from '../../src/lib/poster/formats';
import { Painter } from '../../src/lib/poster/painter';
import { sceneToSvg } from '../../src/lib/poster/render-svg';
import type { Scene } from '../../src/lib/poster/scene';
import { defaultSettings } from '../../src/lib/poster/settings';
import { TEMPLATES } from '../../src/lib/poster/templates';

const json = async (name: string) => JSON.parse(await readFile(`src/data/maps/${name}`, 'utf8'));

async function mapData(id: MapId, lod: Lod = 'display'): Promise<{ def: MapDefinition; meta: MapGeoMeta; geometry: MapGeometry }> {
  if (id === 'world') return { def: WORLD, meta: await json('world.meta.json'), geometry: await json(`world.${lod}.json`) };
  if (id === 'canada') return { def: CANADA, meta: await json('canada.meta.json'), geometry: await json(`canada.${lod}.json`) };
  const base = await json(`canada.${lod}.json`);
  const points = await json('canada-cities.points.json');
  return {
    def: CANADA_CITIES_MAP,
    meta: await json('canada-cities.meta.json'),
    geometry: {
      id: 'canada-cities',
      lod,
      width: base.width,
      height: base.height,
      shapes: {},
      points: points.points,
      baseShapes: base.shapes,
      lakes: base.lakes,
      graticule: base.graticule,
    },
  };
}

async function raster(scene: Scene, width: number): Promise<Sharp> {
  const svg = sceneToSvg(scene, { pixelWidth: width });
  return sharp(Buffer.from(svg), { limitInputPixels: false });
}

// ------------------------------------------------------------------ samples

async function buildSamples(): Promise<void> {
  await mkdir('public/samples', { recursive: true });
  for (const sample of SAMPLES) {
    const { def, meta, geometry } = await mapData(sample.map);
    const settings = { ...defaultSettings(def), ...sample.settings };
    const selection = normalizeSelection(def, sample.visited, sample.wishlist);
    const fonts = await loadFonts(fontsFor(settings));
    const format = getFormat(settings.format);
    if (format.width !== sample.width || format.height !== sample.height) {
      throw new Error(`${sample.id}: declared size does not match the "${format.id}" format.`);
    }
    const scene = composePoster({ def, meta, geometry, selection, settings, format }, fonts);
    const wide = sample.width > sample.height;
    for (const width of wide ? [800, 1440] : [540, 1080]) {
      const file = `public/samples/${sample.id}-${width}.webp`;
      await (await raster(scene, width)).webp({ quality: 84, effort: 6 }).toFile(file);
      console.log(file);
    }
  }
}

// ---------------------------------------------------------------- og images

interface OgSpec {
  file: string;
  map: MapId;
  lines: string[];
  sub: string;
  visited: string[];
}

const OG: OgSpec[] = [
  {
    file: 'worldtripmap',
    map: 'canada',
    lines: ['Your travels,', 'on a map you made'],
    sub: 'Interactive travel maps and print-ready posters',
    visited: ['CA-ON', 'CA-QC', 'CA-BC', 'CA-AB', 'CA-NS', 'CA-PE', 'CA-YT'],
  },
  {
    file: 'world',
    map: 'world',
    lines: ['How many countries', 'have you explored?'],
    sub: 'Mark them on a world map of 195 countries',
    visited: SAMPLES.find((s) => s.id === 'world-midnight-atlas')!.visited,
  },
  {
    file: 'canada',
    map: 'canada',
    lines: ['Which provinces', 'have you explored?'],
    sub: 'Canada’s 10 provinces and 3 territories',
    visited: ['CA-BC', 'CA-AB', 'CA-ON', 'CA-QC', 'CA-NS', 'CA-NL'],
  },
  {
    file: 'canada-cities',
    map: 'canada-cities',
    lines: ['Canada,', 'city by city'],
    sub: '45 major cities, including every capital',
    visited: SAMPLES.find((s) => s.id === 'cities-modern-cartographer')!.visited,
  },
  {
    file: 'poster',
    map: 'canada',
    lines: ['Turn your travels', 'into a poster'],
    sub: 'Four designs. PNG for sharing, vector PDF for print.',
    visited: ['CA-BC', 'CA-AB', 'CA-SK', 'CA-MB', 'CA-ON', 'CA-QC', 'CA-NB', 'CA-NS', 'CA-PE', 'CA-NL'],
  },
  {
    file: 'guides',
    map: 'world',
    lines: ['Travel inspiration', 'and map know-how'],
    sub: 'Guides from WorldTripMap',
    visited: ['CAN', 'ISL', 'PRT', 'JPN', 'NZL', 'PER', 'MAR', 'KEN'],
  },
];

async function buildOg(): Promise<void> {
  await mkdir('public/og', { recursive: true });
  const template = TEMPLATES['midnight-atlas'];
  for (const spec of OG) {
    const { def, meta, geometry } = await mapData(spec.map);
    const settings = { ...defaultSettings(def), showLabels: false };
    const look = template.look(settings);
    const fonts = await loadFonts(['dmserif-400', 'manrope-500', 'manrope-700']);
    const p = new Painter(fonts);
    const W = 1200;
    const H = 630;
    const selection = normalizeSelection(def, spec.visited, []);
    const c: Ctx = {
      p,
      W,
      H,
      bleed: 0,
      def,
      meta,
      geometry,
      selection,
      settings,
      format: getFormat('post'),
      stats: computeStats(def, selection),
      places: null,
      achievements: computeAchievements(def, selection),
      look,
      template,
      top: 0,
      bottom: H,
      corners: [],
    };
    p.rect(0, 0, W, H, { fill: look.paper });
    p.rect(22, 22, W - 44, H - 44, { stroke: look.accent, strokeWidth: 1.5 });
    p.rect(30, 30, W - 60, H - 60, { stroke: look.accent, strokeWidth: 0.5 });

    // Mark and wordmark.
    const mx = 92;
    const my = 104;
    const r = 19;
    p.path(`M${mx} ${my - r}C${mx + r * 0.58} ${my - r} ${mx + r * 0.58} ${my + r} ${mx} ${my + r}Z`, { fill: look.accent });
    p.circle(mx, my, r, { stroke: look.ink, strokeWidth: 2 });
    p.path(
      `M${mx} ${my - r}C${mx - r * 0.58} ${my - r} ${mx - r * 0.58} ${my + r} ${mx} ${my + r}` +
        `M${mx} ${my - r}C${mx + r * 0.58} ${my - r} ${mx + r * 0.58} ${my + r} ${mx} ${my + r}` +
        `M${mx} ${my - r}V${my + r}M${mx - r * 0.9} ${my - 7}H${mx + r * 0.9}M${mx - r * 0.9} ${my + 7}H${mx + r * 0.9}`,
      { stroke: look.ink, strokeWidth: 1.6 },
    );
    p.text('WorldTripMap', mx + r + 14, my + 11, { font: 'dmserif-400', size: 34, fill: look.ink });

    const wideMap = spec.map === 'world';
    const textW = wideMap ? 520 : 560;
    let size = 66;
    while (Math.max(...spec.lines.map((l) => p.measure(l, { font: 'dmserif-400', size, fill: look.ink }))) > textW && size > 40) size -= 2;
    spec.lines.forEach((line, i) => p.text(line, 72, 300 + i * size * 1.1, { font: 'dmserif-400', size, fill: look.ink, tracking: -6 }));
    const subY = 300 + (spec.lines.length - 1) * size * 1.1 + 62;
    p.line(72, subY - 34, 136, subY - 34, { stroke: look.accent, strokeWidth: 2 });
    p.text(spec.sub, 72, subY, p.fit(spec.sub, { font: 'manrope-500', size: 24, fill: look.inkSoft }, textW + 20, 16));
    p.text('worldtripmap.com', 72, H - 72, { font: 'manrope-700', size: 17, fill: look.accentText, tracking: 120 });

    const rect = wideMap ? { x: 600, y: 190, w: 540, h: 300 } : { x: 650, y: 86, w: 480, h: 458 };
    drawMap(c, rect);

    const scene: Scene = { width: W, height: H, bleed: 0, background: look.paper, nodes: p.nodes, description: '' };
    const file = `public/og/${spec.file}.png`;
    await (await raster(scene, W)).png({ compressionLevel: 9, palette: false }).toFile(file);
    console.log(file);
  }
}

// -------------------------------------------------------------------- icons

async function buildIcons(): Promise<void> {
  await mkdir('public/icons', { recursive: true });
  const rounded = await readFile('public/favicon.svg', 'utf8');
  const square = rounded.replace('rx="7"', 'rx="0"');
  // A maskable icon keeps the mark inside the central 80% "safe zone".
  const maskable = rounded
    .replace('rx="7"', 'rx="0"')
    .replace('<path d="M16 5.500', '<g transform="translate(16 16) scale(0.72) translate(-16 -16)"><path d="M16 5.500')
    .replace('</svg>', '</g></svg>');
  const jobs: [string, string, number][] = [
    ['favicon-32.png', rounded, 32],
    ['apple-touch-icon.png', square, 180],
    ['icon-192.png', rounded, 192],
    ['icon-512.png', rounded, 512],
    ['icon-maskable-512.png', maskable, 512],
  ];
  for (const [name, svg, size] of jobs) {
    await sharp(Buffer.from(svg), { density: 72 * (size / 32) * 2 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(`public/icons/${name}`);
    console.log(`public/icons/${name}`);
  }
}

const only = process.argv[2];
if (!only || only === 'samples') await buildSamples();
if (!only || only === 'og') await buildOg();
if (!only || only === 'icons') await buildIcons();

