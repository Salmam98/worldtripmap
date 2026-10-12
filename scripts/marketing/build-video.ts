/**
 * A short vertical video (1080 × 1920, 30 fps) for Reels, TikTok, Shorts and Pinterest:
 * Canada's provinces fill in one by one with a running count, the map becomes a poster, and the
 * site's address closes it. Drawn frame by frame with the site's own map, poster engine and fonts.
 *
 *   npx tsx scripts/marketing/build-video.ts <out.mp4>
 *
 * It has no sound; music is added in the app it is posted to.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import sharp, { type OverlayOptions } from 'sharp';
import { CANADA } from '../../src/data/definitions/canada';
import { SAMPLES } from '../../src/data/samples';
import { computeAchievements } from '../../src/lib/maps/achievements';
import { canadaAreaShare, computeStats } from '../../src/lib/maps/stats';
import { normalizeSelection } from '../../src/lib/maps/store';
import { composePoster, drawMap, fontsFor } from '../../src/lib/poster/compose';
import type { Ctx } from '../../src/lib/poster/context';
import { loadFonts, type FontSet } from '../../src/lib/poster/fonts';
import { getFormat } from '../../src/lib/poster/formats';
import { Painter, type TextSpec } from '../../src/lib/poster/painter';
import { sceneToSvg } from '../../src/lib/poster/render-svg';
import type { Scene } from '../../src/lib/poster/scene';
import { defaultSettings } from '../../src/lib/poster/settings';
import { TEMPLATES } from '../../src/lib/poster/templates';

const OUT = process.argv[2] ?? 'worldtripmap-canada.mp4';
const FPS = 30;
const W = 1080;
const H = 1920;
const DURATION = 18;
const FRAMES = FPS * DURATION;
/** Map layers are drawn larger than the frame, so the slow push-in only ever scales down. */
const HI = 1.25;
const HW = Math.round(W * HI);
const HH = Math.round(H * HI);
const M = 90;

const PAPER = '#101B2D';
const INK = '#F8F6F0';
const SOFT = '#A9B3C1';
const GOLD = '#E0B252';

// The order a traveller might drive it, west to east.
const ROUTE = ['CA-BC', 'CA-AB', 'CA-ON', 'CA-QC', 'CA-NB', 'CA-NS', 'CA-PE'];
const NAMES: Record<string, string> = { 'CA-BC': 'British Columbia', 'CA-AB': 'Alberta', 'CA-ON': 'Ontario', 'CA-QC': 'Quebec', 'CA-NB': 'New Brunswick', 'CA-NS': 'Nova Scotia', 'CA-PE': 'Prince Edward Island' };
const TOTAL = 13;

// Timeline, in seconds.
const FILL_START = 3.0;
const FILL_GAP = 0.85;
const FILL_DUR = 0.55;
const TO_POSTER = 9.7;
const TO_POSTER_DUR = 1.0;
const TO_END = 14.0;
const TO_END_DUR = 0.7;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const outCubic = (x: number) => 1 - (1 - clamp(x)) ** 3;
const inOutCubic = (x: number) => {
  const t = clamp(x);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
const phase = (t: number, start: number, dur: number) => clamp((t - start) / dur);

// ------------------------------------------------------------------ layers

const json = async (name: string) => JSON.parse(await readFile(`src/data/maps/${name}`, 'utf8'));
const meta = await json('canada.meta.json');
const geometry = await json('canada.display.json');
const fonts = await loadFonts(['dmserif-400', 'manrope-500', 'manrope-700']);

const toRaw = async (svg: string, width: number, height: number) =>
  sharp(Buffer.from(svg), { limitInputPixels: false }).resize(width, height).ensureAlpha().raw().toBuffer();

const VIGNETTE = `<radialGradient id="v" cx="50%" cy="44%" r="75%"><stop offset="0" stop-color="#1A2A45" stop-opacity="0.9"/><stop offset="0.55" stop-color="${PAPER}" stop-opacity="0"/><stop offset="1" stop-color="#050A14" stop-opacity="0.75"/></radialGradient>`;

/** The backdrop and, when `visited` is given, the map: an opaque frame at HI scale. */
async function mapLayer(visited: string[] | null): Promise<Buffer> {
  const p = new Painter(fonts);
  p.rect(0, 0, W, H, { fill: PAPER });
  if (visited) {
    const tpl = TEMPLATES['midnight-atlas'];
    const settings = { ...defaultSettings(CANADA), template: 'midnight-atlas' as const, showLabels: false };
    const look = { ...tpl.look(settings), paper: PAPER, water: PAPER, accent: GOLD };
    const selection = normalizeSelection(CANADA, visited, []);
    const c: Ctx = {
      p, W, H, bleed: 0, def: CANADA, meta, geometry, selection, settings, format: getFormat('print'),
      stats: computeStats(CANADA, selection), places: null, achievements: computeAchievements(CANADA, selection),
      look, template: tpl, top: 0, bottom: H, corners: [],
    };
    drawMap(c, { x: 40, y: 520, w: W - 80, h: 760 });
  }
  const scene: Scene = { width: W, height: H, bleed: 0, background: PAPER, nodes: p.nodes, description: '' };
  const svg = sceneToSvg(scene, { pixelWidth: HW }).replace('</svg>', `<defs>${VIGNETTE}</defs><rect width="${W}" height="${H}" fill="url(#v)"/></svg>`);
  return toRaw(svg, HW, HH);
}

console.log('drawing map layers…');
const backdropHi = await mapLayer(null);
const layers: Buffer[] = [];
for (let k = 0; k <= ROUTE.length; k++) layers.push(await mapLayer(ROUTE.slice(0, k)));
const backdrop = await sharp(backdropHi, { raw: { width: HW, height: HH, channels: 4 } }).resize(W, H).raw().toBuffer();

// Film grain: a few fixed noise frames, cycled.
const grain: Buffer[] = [];
for (let g = 0; g < 4; g++) {
  const b = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    b[i * 4] = v;
    b[i * 4 + 1] = v;
    b[i * 4 + 2] = v;
    b[i * 4 + 3] = Math.floor(Math.random() * 9);
  }
  grain.push(b);
}

// The poster the map becomes.
console.log('drawing the poster…');
const sample = SAMPLES.find((s) => s.id === 'canada-midnight-atlas')!;
const posterSettings = { ...defaultSettings(CANADA), ...sample.settings, name: '', dates: '2019–2026', badge: '' };
const posterFormat = getFormat(posterSettings.format);
const posterScene = composePoster(
  { def: CANADA, meta, geometry, selection: normalizeSelection(CANADA, ROUTE, []), settings: posterSettings, format: posterFormat },
  await loadFonts(fontsFor(posterSettings)),
);
const POSTER_W = 800;
const POSTER_H = Math.round((POSTER_W * posterFormat.height) / posterFormat.width);
const posterPng = await sharp(Buffer.from(sceneToSvg(posterScene, { pixelWidth: POSTER_W * 2 })), { limitInputPixels: false }).png().toBuffer();
const shadowPad = 96;
const shadowPng = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_W + shadowPad * 2}" height="${POSTER_H + shadowPad * 2}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter></defs><rect x="${shadowPad}" y="${shadowPad + 30}" width="${POSTER_W}" height="${POSTER_H}" fill="#000" fill-opacity="0.6" filter="url(#b)"/></svg>`,
  ),
).png().toBuffer();

// ------------------------------------------------------------------ text

const SERIF = (size: number, fill = INK, opacity = 1): TextSpec => ({ font: 'dmserif-400', size, fill, opacity, tracking: -10 });
const SANS = (size: number, fill = SOFT, opacity = 1, bold = false): TextSpec => ({ font: bold ? 'manrope-700' : 'manrope-500', size, fill, opacity });
const LABEL = (size: number, fill = GOLD, opacity = 1): TextSpec => ({ font: 'manrope-700', size, fill, opacity, tracking: 190, upper: true });

/** Words that rise into place one after another. */
function words(p: Painter, lines: string[], x: number, y0: number, spec: TextSpec, t: number, start: number, lead = 1.06, stagger = 0.1): void {
  let i = 0;
  lines.forEach((line, li) => {
    let cx = x;
    const space = p.measure(' ', spec);
    for (const word of line.split(' ')) {
      const e = outCubic(phase(t, start + i * stagger, 0.75));
      if (e > 0) p.text(word, cx, y0 + li * spec.size * lead + 28 * (1 - e), { ...spec, opacity: (spec.opacity ?? 1) * e });
      cx += p.measure(word, spec) + space;
      i++;
    }
  });
}

/** A value that slides up and out as the next one slides in. */
function ticker(p: Painter, values: string[], changes: number[], t: number, x: number, y: number, spec: TextSpec): void {
  let idx = 0;
  for (let i = 0; i < changes.length; i++) if (t >= changes[i]) idx = i + 1;
  const since = idx > 0 ? t - changes[idx - 1] : Infinity;
  const e = outCubic(since / 0.35);
  if (idx > 0 && e < 1) {
    const out = 1 - e;
    p.text(values[idx - 1], x, y - 26 * e, { ...spec, opacity: (spec.opacity ?? 1) * out });
  }
  p.text(values[idx], x, y + 26 * (1 - Math.min(1, e)), { ...spec, opacity: (spec.opacity ?? 1) * Math.min(1, e) });
}

const fillTimes = ROUTE.map((_, i) => FILL_START + i * FILL_GAP);
const counts = ['0', ...ROUTE.map((_, i) => String(i + 1))];
const areas = ['0%', ...ROUTE.map((_, i) => canadaAreaShare(normalizeSelection(CANADA, ROUTE.slice(0, i + 1), [])).label)];

function mapText(p: Painter, t: number): void {
  p.text('Canada · 10 provinces, 3 territories', M, 212, LABEL(23, GOLD, outCubic(phase(t, 0.3, 0.8))));
  words(p, ['How much of Canada', 'have you seen?'], M, 340, SERIF(104), t, 0.55);

  const show = outCubic(phase(t, 2.3, 0.8));
  if (show <= 0) return;
  p.line(M, 1318, W - M, 1318, { stroke: SOFT, strokeWidth: 1.2, strokeOpacity: 0.28 * show });
  // The province just reached.
  const current = fillTimes.reduce((acc, ft, i) => (t >= ft ? i : acc), -1);
  if (current >= 0) {
    const since = t - fillTimes[current];
    const a = outCubic(since / 0.4) * (current === ROUTE.length - 1 ? 1 : 1 - clamp((since - FILL_GAP + 0.25) / 0.25));
    p.text(NAMES[ROUTE[current]], M, 1376 + 14 * (1 - outCubic(since / 0.4)), LABEL(24, GOLD, a));
  }
  // The count, and the share of Canada's area.
  const numSpec = SERIF(156, INK, show);
  const numW = p.measure('7', numSpec);
  ticker(p, counts, fillTimes, t, M, 1528, numSpec);
  p.text(`of ${TOTAL}`, M + numW + 26, 1468, SANS(34, INK, show, true));
  p.text('provinces and', M + numW + 26, 1506, SANS(29, SOFT, show));
  p.text('territories', M + numW + 26, 1540, SANS(29, SOFT, show));
  ticker(p, areas, fillTimes, t, W - M, 1528, { ...SERIF(156, GOLD, show), anchor: 'end' });
  p.text('of Canada, by area', W - M, 1574, { ...SANS(29, SOFT, show), anchor: 'end' });
}

function posterText(p: Painter, t: number): void {
  const s = TO_POSTER + 0.45;
  words(p, ['Then make it a poster'], M, 236, SERIF(76), t, s, 1, 0.08);
  words(p, ['Four designs · print-ready PDF'], M, 300, SANS(30, SOFT), t, s + 0.45, 1, 0.06);
}

function endText(p: Painter, t: number): void {
  const s = TO_END + 0.45;
  // The WorldTripMap mark.
  const a = outCubic(phase(t, s, 0.6));
  const x = M + 30;
  const y = 700;
  const r = 30;
  p.path(`M${x} ${y - r}C${x + r * 0.58} ${y - r} ${x + r * 0.58} ${y + r} ${x} ${y + r}Z`, { fill: GOLD, fillOpacity: a });
  p.circle(x, y, r, { stroke: INK, strokeWidth: 2.6, strokeOpacity: a });
  p.path(
    `M${x} ${y - r}C${x - r * 0.58} ${y - r} ${x - r * 0.58} ${y + r} ${x} ${y + r}M${x} ${y - r}C${x + r * 0.58} ${y - r} ${x + r * 0.58} ${y + r} ${x} ${y + r}M${x} ${y - r}V${y + r}M${x - r * 0.9} ${y - 10}H${x + r * 0.9}M${x - r * 0.9} ${y + 10}H${x + r * 0.9}`,
    { stroke: INK, strokeWidth: 2, strokeOpacity: a },
  );
  words(p, ['Map yours.'], M, 900, SERIF(150), t, s + 0.15, 1, 0.12);
  words(p, ['Free. No sign-up.', 'Your map stays on your device.'], M, 990, SANS(38, SOFT), t, s + 0.5, 1.4, 0.05);
  const rule = outCubic(phase(t, s + 0.9, 0.7));
  p.line(M, 1128, M + 120 * rule, 1128, { stroke: GOLD, strokeWidth: 3 });
  words(p, ['worldtripmap.com'], M, 1196, { ...LABEL(42, GOLD), tracking: 90, upper: false }, t, s + 1.0, 1, 0);
}

async function overlay(draw: (p: Painter) => void, fade = 0): Promise<Buffer> {
  const p = new Painter(fonts);
  draw(p);
  if (fade > 0) p.rect(0, 0, W, H, { fill: '#000', fillOpacity: fade });
  const scene: Scene = { width: W, height: H, bleed: 0, background: 'none', nodes: p.nodes, description: '' };
  return sharp(Buffer.from(sceneToSvg(scene, { pixelWidth: W }))).png().toBuffer();
}

// ------------------------------------------------------------------ frames

function blend(a: Buffer, b: Buffer, k: number): Buffer {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const out = Buffer.allocUnsafe(a.length);
  const kb = Math.round(k * 256);
  const ka = 256 - kb;
  for (let i = 0; i < a.length; i++) out[i] = (a[i] * ka + b[i] * kb) >> 8;
  return out;
}

const raw = { raw: { width: W, height: H, channels: 4 as const } };

/** The map scene at time t, before text: fills crossfade, and the camera pushes in slowly. */
async function mapScene(t: number): Promise<Buffer> {
  let img: Buffer;
  if (t < 2.2) img = blend(backdropHi, layers[0], inOutCubic(phase(t, 0.9, 1.3)));
  else {
    let k = 0;
    let p = 0;
    for (let i = 0; i < fillTimes.length; i++) {
      if (t >= fillTimes[i] + FILL_DUR) k = i + 1;
      else if (t >= fillTimes[i]) {
        k = i;
        p = inOutCubic((t - fillTimes[i]) / FILL_DUR);
      }
    }
    img = p > 0 ? blend(layers[k], layers[k + 1], p) : layers[k];
  }
  const zoom = 1 + 0.06 * inOutCubic(phase(t, 0.6, TO_POSTER + TO_POSTER_DUR - 0.6));
  const zw = Math.round(W * zoom);
  const zh = Math.round(H * zoom);
  const ax = 0.5;
  const ay = 900 / H;
  return sharp(img, { raw: { width: HW, height: HH, channels: 4 } })
    .resize(zw, zh)
    .extract({ left: Math.round((zw - W) * ax), top: Math.round((zh - H) * ay), width: W, height: H })
    .raw()
    .toBuffer();
}

async function posterScene2(t: number): Promise<Buffer> {
  const e = outCubic(phase(t, TO_POSTER + 0.3, 3.2));
  const scale = 1.06 - 0.06 * e;
  const w = Math.round(POSTER_W * scale);
  const h = Math.round(POSTER_H * scale);
  const cx = W / 2;
  const top = 390 + (POSTER_H - h) / 2 + 40 * (1 - outCubic(phase(t, TO_POSTER + 0.3, 1.2)));
  const poster = await sharp(posterPng).resize(w, h).png().toBuffer();
  const sw = Math.round((POSTER_W + shadowPad * 2) * scale);
  const sh = Math.round((POSTER_H + shadowPad * 2) * scale);
  const shadow = await sharp(shadowPng).resize(sw, sh).png().toBuffer();
  return sharp(backdrop, raw)
    .composite([
      { input: shadow, left: Math.round(cx - sw / 2), top: Math.round(top - shadowPad * scale) },
      { input: poster, left: Math.round(cx - w / 2), top: Math.round(top) },
    ])
    .raw()
    .toBuffer();
}

async function frame(i: number): Promise<Buffer> {
  const t = i / FPS;
  const fadeIn = 1 - outCubic(phase(t, 0, 0.6));
  let base: Buffer;
  let text: (p: Painter) => void;
  if (t < TO_POSTER) {
    base = await mapScene(t);
    text = (p) => mapText(p, t);
  } else if (t < TO_POSTER + TO_POSTER_DUR) {
    // The map dissolves to the bare backdrop, then the poster rises onto it.
    const k = inOutCubic(phase(t, TO_POSTER, 0.4));
    const k2 = inOutCubic(phase(t, TO_POSTER + 0.3, TO_POSTER_DUR - 0.3));
    const m = k < 1 ? blend(await mapScene(t), backdrop, k) : backdrop;
    base = k2 > 0 ? blend(m, await posterScene2(t), k2) : m;
    // The map's words leave as the poster arrives.
    text = (p) => {
      const sub = new Painter(fonts);
      mapText(sub, t);
      for (const node of sub.nodes) if (node.type === 'path') node.fillOpacity = (node.fillOpacity ?? 1) * (1 - k);
      for (const node of sub.nodes) if (node.type === 'path' && node.strokeOpacity !== undefined) node.strokeOpacity *= 1 - k;
      p.nodes.push(...sub.nodes);
      posterText(p, t);
    };
  } else if (t < TO_END) {
    base = await posterScene2(t);
    text = (p) => posterText(p, t);
  } else {
    const k = inOutCubic(phase(t, TO_END, TO_END_DUR));
    base = k < 1 ? blend(await posterScene2(t), backdrop, k) : backdrop;
    text = (p) => {
      if (k < 1) {
        const sub = new Painter(fonts);
        posterText(sub, t);
        for (const node of sub.nodes) if (node.type === 'path') node.fillOpacity = (node.fillOpacity ?? 1) * (1 - k);
        p.nodes.push(...sub.nodes);
      }
      endText(p, t);
    };
  }
  const layers: OverlayOptions[] = [
    { input: await overlay(text, fadeIn) },
    { input: grain[Math.floor(i / 2) % grain.length], raw: { width: W, height: H, channels: 4 } },
  ];
  return sharp(base, raw).composite(layers).removeAlpha().raw().toBuffer();
}

// ------------------------------------------------------------------ encode

const only = process.argv[3];
if (only) {
  // Stills for checking: node build-video.ts out.mp4 5.0,9.0,12.0
  for (const s of only.split(',')) {
    const buf = await frame(Math.round(Number(s) * FPS));
    await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(OUT.replace(/\.mp4$/, `-${s}.png`));
    console.log('still', s);
  }
  process.exit(0);
}

const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', OUT,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise<void>((resolve, reject) => ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
const started = Date.now();
for (let i = 0; i < FRAMES; i++) {
  const buf = await frame(i);
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 60 === 0) console.log(`frame ${i}/${FRAMES} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await done;
console.log('wrote', OUT);
