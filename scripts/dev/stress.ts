// Dev helper: renders the "worst case" posters the unit tests use, as one contact sheet to look at.
//   npx tsx scripts/dev/stress.ts <out.png> [map] [format,format,...] [case]
import sharp, { type OverlayOptions } from 'sharp';
import { normalizeSelection } from '../../src/lib/maps/store';
import type { MapId } from '../../src/lib/maps/types';
import { composePoster } from '../../src/lib/poster/compose';
import { loadFonts } from '../../src/lib/poster/fonts';
import { getFormat, type FormatId } from '../../src/lib/poster/formats';
import { sceneToSvg } from '../../src/lib/poster/render-svg';
import { defaultSettings, LIMITS, normalizeSettings, TEMPLATE_IDS, type PosterSettings } from '../../src/lib/poster/settings';
import { mapData } from '../../tests/helpers/geo';

const [, , out = '/tmp/stress.png', mapArg = 'canada', formatArg = 'post,print-wide', caseArg = 'long'] = process.argv;
const map = mapArg as MapId;
const { def, meta, geometry } = mapData(map);
const all = def.features.map((f) => f.id);
const fonts = await loadFonts(['manrope-300', 'manrope-500', 'manrope-700', 'dmserif-400', 'dmserif-400i', 'caveat-600']);

const cases: Record<string, { visited: string[]; wishlist: string[]; settings: Partial<PosterSettings> }> = {
  long: {
    visited: all,
    wishlist: [],
    settings: {
      title: 'W'.repeat(LIMITS.title),
      subtitle: 'Mmmmm wwwww '.repeat(8),
      name: 'Wolfeschlegelsteinhausenbergerdorff Senior',
      dates: 'September 2015 – December 2026',
      caption: 'An unreasonably long caption that goes on and on about every single road, ferry, train and gravel track along the way.',
      showWishlist: true,
      badge: 'complete-explorer',
    },
  },
  typical: {
    visited: all.filter((_, i) => i % 4 === 0),
    wishlist: all.filter((_, i) => i % 9 === 1),
    settings: { name: 'Amina Rahman', dates: '2015–2026', subtitle: 'Seven down, six to go', showWishlist: true, badge: 'first-adventure', caption: 'Every road led somewhere good.' },
  },
  empty: { visited: [], wishlist: [], settings: {} },
  wish: { visited: [], wishlist: all, settings: { showWishlist: true } },
};
const chosen = cases[caseArg];
const tiles: { input: Buffer; w: number; h: number }[] = [];
const H = 760;
for (const format of formatArg.split(',') as FormatId[]) {
  for (const template of TEMPLATE_IDS) {
    const settings = normalizeSettings(def, { ...defaultSettings(def), ...chosen.settings, template, format });
    const f = getFormat(format);
    const scene = composePoster({ def, meta, geometry, selection: normalizeSelection(def, chosen.visited, chosen.wishlist), settings, format: f }, fonts);
    const w = Math.round((H * f.width) / f.height);
    tiles.push({ input: await sharp(Buffer.from(sceneToSvg(scene, { pixelWidth: w * 2 })), { limitInputPixels: false }).resize({ width: w }).png().toBuffer(), w, h: H });
  }
}
const gap = 14;
const perRow = TEMPLATE_IDS.length;
const rows: (typeof tiles)[] = [];
for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));
const width = Math.max(...rows.map((r) => r.reduce((a, t) => a + t.w + gap, gap)));
const composite: OverlayOptions[] = [];
rows.forEach((row, r) => {
  let x = gap;
  for (const t of row) {
    composite.push({ input: t.input, left: x, top: gap + r * (H + gap) });
    x += t.w + gap;
  }
});
await sharp({ create: { width, height: rows.length * (H + gap) + gap, channels: 3, background: '#777' } })
  .composite(composite)
  .png()
  .toFile(out);
console.log('saved', out);
