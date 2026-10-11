// Dev helper: composes sample posters in Node and writes SVG, PNG and PDF files for inspection.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { CANADA } from '../../src/data/definitions/canada';
import { CANADA_CITIES_MAP } from '../../src/data/definitions/canada-cities';
import { WORLD } from '../../src/data/definitions/world';
import { normalizeSelection } from '../../src/lib/maps/store';
import type { MapDefinition, MapGeoMeta, MapGeometry } from '../../src/lib/maps/types';
import { composePoster, fontsFor } from '../../src/lib/poster/compose';
import { loadFonts } from '../../src/lib/poster/fonts';
import { getFormat } from '../../src/lib/poster/formats';
import { sceneToPdf } from '../../src/lib/poster/pdf';
import { sceneToSvg } from '../../src/lib/poster/render-svg';
import { defaultSettings, type PosterSettings } from '../../src/lib/poster/settings';

const out = process.argv[2] ?? '/home/claude/scratch/posters';
mkdirSync(out, { recursive: true });
const J = (name: string) => JSON.parse(readFileSync(`src/data/maps/${name}`, 'utf8'));

function data(id: string, lod = 'display'): { def: MapDefinition; meta: MapGeoMeta; geometry: MapGeometry } {
  if (id === 'world') return { def: WORLD, meta: J('world.meta.json'), geometry: J(`world.${lod}.json`) };
  if (id === 'canada') return { def: CANADA, meta: J('canada.meta.json'), geometry: J(`canada.${lod}.json`) };
  const base = J(`canada.${lod}.json`);
  return {
    def: CANADA_CITIES_MAP,
    meta: J('canada-cities.meta.json'),
    geometry: { id: 'canada-cities', lod: lod as any, width: base.width, height: base.height, shapes: {}, points: J('canada-cities.points.json').points, baseShapes: base.shapes, lakes: base.lakes, graticule: base.graticule },
  };
}

const SELECT: Record<string, { visited: string[]; wishlist: string[] }> = {
  canada: { visited: ['CA-ON', 'CA-QC', 'CA-BC', 'CA-AB', 'CA-NS', 'CA-PE', 'CA-YT'], wishlist: ['CA-NL', 'CA-NU'] },
  world: {
    visited: ['CAN', 'USA', 'MEX', 'CUB', 'GBR', 'FRA', 'ESP', 'PRT', 'ITA', 'DEU', 'NLD', 'CHE', 'GRC', 'TUR', 'MAR', 'EGY', 'KEN', 'ZAF', 'ARE', 'IND', 'BGD', 'THA', 'VNM', 'SGP', 'JPN', 'AUS', 'NZL', 'BRA', 'PER', 'ARG', 'ISL', 'MCO', 'MLT', 'HKG'],
    wishlist: ['NOR', 'CHL', 'NPL', 'MDG'],
  },
  'canada-cities': { visited: ['toronto', 'montreal', 'vancouver', 'ottawa-gatineau', 'calgary', 'quebec-city', 'halifax', 'victoria', 'winnipeg', 'st-johns', 'kelowna', 'hamilton', 'whitehorse'], wishlist: ['yellowknife', 'iqaluit'] },
};

const jobs: [string, string, Partial<PosterSettings>][] = [
  ['canada', 'a1-atlas-post', { template: 'midnight-atlas', format: 'post', name: 'Sample Traveller', dates: '2015–2026', subtitle: 'Seven down, six to go', badge: 'halfway-there' }],
  ['canada', 'a2-nordic-print', { template: 'nordic-explorer', format: 'print', title: 'Places I’ve Explored', name: 'Sample Traveller', showWishlist: true }],
  ['canada', 'a3-carto-post', { template: 'modern-cartographer', format: 'post', title: 'Canada Explorer', name: 'Sample Traveller', dates: '2015–2026' }],
  ['canada', 'a4-journal-story', { template: 'travel-journal', format: 'story', title: 'My Travel Story', caption: 'Every road led somewhere good.', dates: 'Summer 2026' }],
  ['world', 'b1-atlas-wide', { template: 'midnight-atlas', format: 'print-wide', name: 'Sample Traveller' }],
  ['world', 'b2-nordic-post', { template: 'nordic-explorer', format: 'post', showWishlist: true }],
  ['world', 'b3-carto-a', { template: 'modern-cartographer', format: 'a-series-wide', title: 'World Explorer' }],
  ['world', 'b4-journal-pin', { template: 'travel-journal', format: 'pin', caption: 'Thirty-four countries and counting.' }],
  ['canada-cities', 'c1-atlas-post', { template: 'midnight-atlas', format: 'post' }],
  ['canada-cities', 'c2-carto-wide', { template: 'modern-cartographer', format: 'print-wide', name: 'Sample Traveller' }],
  ['canada', 'a5-atlas-wide', { template: 'midnight-atlas', format: 'print-wide', name: 'Sample Traveller', badge: 'halfway-there' }],
];

const only = process.argv[3];
for (const [map, name, overrides] of jobs) {
  if (only && !name.includes(only)) continue;
  const { def, meta, geometry } = data(map);
  const settings = { ...defaultSettings(def), ...overrides };
  const selection = normalizeSelection(def, SELECT[map].visited, SELECT[map].wishlist);
  const fonts = await loadFonts(fontsFor(settings));
  const format = getFormat(settings.format);
  const t0 = performance.now();
  const scene = composePoster({ def, meta, geometry, selection, settings, format }, fonts);
  const t1 = performance.now();
  const svg = sceneToSvg(scene, { pixelWidth: format.width });
  writeFileSync(`${out}/${name}.svg`, svg);
  await sharp(Buffer.from(svg), { limitInputPixels: false }).png().toFile(`${out}/${name}.png`);
  let pdfNote = '';
  if (format.pdf) {
    const pdf = await sceneToPdf(scene, { widthPt: format.pdf.widthPt, heightPt: format.pdf.heightPt, title: settings.title });
    writeFileSync(`${out}/${name}.pdf`, pdf);
    try {
      execFileSync('qpdf', ['--check', `${out}/${name}.pdf`], { stdio: 'pipe' });
      pdfNote = `pdf ${(pdf.length / 1024).toFixed(0)}KB ok`;
    } catch (e: any) {
      pdfNote = 'PDF CHECK FAILED: ' + (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '');
    }
  }
  console.log(name, `compose ${(t1 - t0).toFixed(0)}ms`, `svg ${(svg.length / 1024).toFixed(0)}KB`, `nodes ${scene.nodes.length}`, pdfNote);
}
