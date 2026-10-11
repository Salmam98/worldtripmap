// Dev helper: renders one poster large. npx tsx scripts/dev/one.ts <out.png> <map> <template> <format> <all|half|some> [settings-json]
import sharp from 'sharp';
import { normalizeSelection } from '../../src/lib/maps/store';
import { composePoster } from '../../src/lib/poster/compose';
import { loadFonts } from '../../src/lib/poster/fonts';
import { getFormat } from '../../src/lib/poster/formats';
import { sceneToSvg } from '../../src/lib/poster/render-svg';
import { defaultSettings, normalizeSettings } from '../../src/lib/poster/settings';
import { mapData } from '../../tests/helpers/geo';
const [, , out, map, template, format, mode, extra] = process.argv;
const { def, meta, geometry } = mapData(map as any);
const all = def.features.map((f) => f.id);
const fonts = await loadFonts(['manrope-300', 'manrope-500', 'manrope-700', 'dmserif-400', 'dmserif-400i', 'caveat-600']);
const visited = mode === 'all' ? all : mode === 'half' ? all.filter((_, i) => i % 2 === 0) : all.filter((_, i) => i % 4 === 0);
const settings = normalizeSettings(def, { ...defaultSettings(def), template, format, name: 'Amina Rahman', dates: '2015–2026', showWishlist: true, ...(extra ? JSON.parse(extra) : {}) });
const f = getFormat(format);
const scene = composePoster({ def, meta, geometry, selection: normalizeSelection(def, visited, all.filter((_, i) => i % 9 === 1)), settings, format: f }, fonts);
await sharp(Buffer.from(sceneToSvg(scene, { pixelWidth: 1600 })), { limitInputPixels: false }).png().toFile(out);
console.log('saved', out);
