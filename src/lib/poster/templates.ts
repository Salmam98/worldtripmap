import { formatCount } from '../maps/stats';
import { claimCorner, type Ctx, type PlacedMap, type Rect } from './context';
import type { FontKey } from './fonts';
import type { TextSpec } from './painter';
import { circlePath, rectPath, rotate } from './scene';
import type { PosterSettings, TemplateId, Typeface } from './settings';

type Anchor = 'start' | 'middle' | 'end';

export interface Accent {
  id: string;
  name: string;
  /** The fill used for explored places. */
  hex: string;
  /** Text colour that reads on top of the fill. */
  on: string;
  /** A shade of the accent that reads as small text on the template's paper. */
  text: string;
}

export interface Look {
  margin: number;
  align: 'center' | 'left';
  paper: string;
  ink: string;
  inkSoft: string;
  accent: string;
  onAccent: string;
  accentText: string;
  land: string;
  border: string;
  coast: string;
  coastWidth: number;
  water: string;
  landLabel: string;
  leader: string;
  wishBg: string;
  wishLine: string;
  /** Ocean fill and outline of the globe, for world maps. */
  sphere?: string;
  sphereLine?: string;
  graticule?: string;
  /** How far the graticule runs past the map on regional maps, in poster units. */
  graticuleBleed: number;
  /** Space kept clear around the map for frames and notes: top, right, bottom, left. */
  mapInset: [number, number, number, number];
  /** How far a width-limited map may run into the side margins. */
  mapOverscan: number;
  sealInk: string;
  fonts: {
    title: FontKey;
    subtitle: FontKey;
    label: FontKey;
    body: FontKey;
    bodyBold: FontKey;
    numeral: FontKey;
    caption: FontKey;
  };
  titleSize: number;
  titleLeading: number;
  titleTracking: number;
  titleUpper: boolean;
  titleTilt?: number;
  numeralSize: number;
  numeralFill: string;
  numeralTracking: number;
  captionSize: number;
  bylineJoin: string;
  overline?: (c: Ctx) => string;
  titleOrnament?: (c: Ctx, x: number, y: number, anchor: Anchor, width: number) => void;
}

export interface TemplateDef {
  id: TemplateId;
  name: string;
  blurb: string;
  /** The typeface the template is designed around. */
  nativeTypeface: Exclude<Typeface, 'template'>;
  accents: Accent[];
  fonts: (typeface: Typeface) => FontKey[];
  look: (settings: PosterSettings) => Look;
  background: (c: Ctx) => void;
  underMap?: (c: Ctx, placed: PlacedMap, rect: Rect) => void;
  overMap?: (c: Ctx, placed: PlacedMap, rect: Rect) => void;
}

// ---------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------

interface TitleFace {
  title: FontKey;
  numeral: FontKey;
  titleSize: number;
  titleLeading: number;
  titleTracking: number;
  numeralSize: number;
  numeralTracking: number;
}

/** The three title faces a visitor can choose between. Body text is always Manrope. */
function titleFace(typeface: Exclude<Typeface, 'template'>, sansWeight: 'manrope-300' | 'manrope-700' = 'manrope-700'): TitleFace {
  if (typeface === 'serif') {
    return { title: 'dmserif-400', numeral: 'dmserif-400', titleSize: 90, titleLeading: 1.04, titleTracking: -6, numeralSize: 138, numeralTracking: -10 };
  }
  if (typeface === 'script') {
    return { title: 'caveat-600', numeral: 'caveat-600', titleSize: 122, titleLeading: 0.9, titleTracking: 0, numeralSize: 158, numeralTracking: 0 };
  }
  return sansWeight === 'manrope-300'
    ? { title: 'manrope-300', numeral: 'manrope-300', titleSize: 88, titleLeading: 1.08, titleTracking: -34, numeralSize: 148, numeralTracking: -46 }
    : { title: 'manrope-700', numeral: 'manrope-700', titleSize: 76, titleLeading: 1.08, titleTracking: -30, numeralSize: 126, numeralTracking: -44 };
}

function pick(accents: Accent[], id: string): Accent {
  return accents.find((a) => a.id === id) ?? accents[0];
}

function paper(c: Ctx): void {
  const b = c.bleed;
  c.p.rect(-b, -b, c.W + b * 2, c.H + b * 2, { fill: c.look.paper });
}

/** Mulberry32: a tiny seeded generator, so paper flecks land in the same place on every render. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_FONTS: FontKey[] = ['manrope-500', 'manrope-700'];

function fontsWith(native: FontKey[], typeface: Typeface, sansWeight: FontKey): FontKey[] {
  const extra: FontKey[] =
    typeface === 'serif' ? ['dmserif-400'] : typeface === 'script' ? ['caveat-600'] : typeface === 'sans' ? [sansWeight] : [];
  return [...new Set([...BASE_FONTS, ...native, ...extra])];
}

function imprint(c: Ctx): string {
  const projection = c.meta.projection.name;
  const scale = c.meta.projection.trueScaleNote ? ` ${c.meta.projection.trueScaleNote}` : '';
  return `${projection} projection.${scale} Boundaries: Natural Earth.`;
}

// ---------------------------------------------------------------------------------------------
// Midnight Atlas: dark navy, ivory and antique gold, set like a plate from a classical atlas.
// ---------------------------------------------------------------------------------------------

const ATLAS_ACCENTS: Accent[] = [
  { id: 'gold', name: 'Antique gold', hex: '#C6A66B', on: '#101B2D', text: '#C6A66B' },
  { id: 'ivory', name: 'Ivory', hex: '#F1EEE5', on: '#101B2D', text: '#F1EEE5' },
  { id: 'sage', name: 'Sage', hex: '#8FB5A3', on: '#101B2D', text: '#8FB5A3' },
  { id: 'copper', name: 'Copper', hex: '#D08A5B', on: '#101B2D', text: '#D08A5B' },
  { id: 'sky', name: 'Pale sky', hex: '#8FB3D9', on: '#101B2D', text: '#8FB3D9' },
];

const midnightAtlas: TemplateDef = {
  id: 'midnight-atlas',
  name: 'Midnight Atlas',
  blurb: 'Dark navy, ivory and antique gold, framed like a plate from an old atlas.',
  nativeTypeface: 'serif',
  accents: ATLAS_ACCENTS,
  fonts: (typeface) => fontsWith(['dmserif-400', 'dmserif-400i'], typeface, 'manrope-700'),
  look: (settings) => {
    const accent = pick(ATLAS_ACCENTS, settings.accent);
    const face = titleFace(settings.typeface === 'template' ? 'serif' : settings.typeface);
    return {
      margin: 92,
      align: 'center',
      paper: '#101B2D',
      ink: '#F8F6F0',
      inkSoft: '#A9B3C1',
      accent: accent.hex,
      onAccent: accent.on,
      accentText: accent.text,
      land: '#22334F',
      border: '#101B2D',
      coast: '#62718D',
      coastWidth: 0.55,
      water: '#101B2D',
      landLabel: '#B8C0CC',
      leader: '#8E99A9',
      wishBg: '#22334F',
      wishLine: accent.hex,
      sphere: '#142035',
      sphereLine: '#3A4B6B',
      graticule: '#1D2C47',
      graticuleBleed: 40,
      mapInset: [0, 0, 0, 0],
      mapOverscan: 34,
      sealInk: accent.hex,
      fonts: {
        title: face.title,
        subtitle: 'dmserif-400i',
        label: 'manrope-500',
        body: 'manrope-500',
        bodyBold: 'manrope-700',
        numeral: face.numeral,
        caption: 'dmserif-400i',
      },
      titleSize: face.titleSize,
      titleLeading: face.titleLeading,
      titleTracking: face.titleTracking,
      titleUpper: false,
      numeralSize: face.numeralSize,
      numeralFill: accent.hex,
      numeralTracking: face.numeralTracking,
      captionSize: 25,
      bylineJoin: ', ',
      overline: (c) => c.def.name,
      titleOrnament: (c, x, y, anchor) => {
        // A rule broken by a diamond, the divider on classical title pages.
        const arm = 64;
        const cx = anchor === 'middle' ? x : x + arm + 12;
        const style = { stroke: c.look.accent, strokeWidth: 1 };
        c.p.line(cx - arm - 12, y, cx - 12, y, style);
        c.p.line(cx + 12, y, cx + arm + 12, y, style);
        c.p.path(`M${cx} ${y - 5}L${cx + 5} ${y}L${cx} ${y + 5}L${cx - 5} ${y}Z`, { fill: c.look.accent });
      },
    };
  },
  background: (c) => {
    paper(c);
    const top = c.format.safeTop ? c.format.safeTop - 40 : 0;
    const bottom = c.format.safeBottom ? c.format.safeBottom - 40 : 0;
    const frame = (inset: number, width: number) =>
      c.p.rect(inset, inset + top, c.W - inset * 2, c.H - inset * 2 - top - bottom, { stroke: c.look.accent, strokeWidth: width });
    frame(34, 1.5);
    frame(42, 0.5);
  },
};

// ---------------------------------------------------------------------------------------------
// Nordic Explorer: warm ivory, forest green and a great deal of air.
// ---------------------------------------------------------------------------------------------

const NORDIC_ACCENTS: Accent[] = [
  { id: 'forest', name: 'Forest', hex: '#315C4C', on: '#F8F6F0', text: '#315C4C' },
  { id: 'navy', name: 'Midnight', hex: '#101B2D', on: '#F8F6F0', text: '#101B2D' },
  { id: 'brick', name: 'Brick', hex: '#9B3D2E', on: '#F8F6F0', text: '#9B3D2E' },
  { id: 'ochre', name: 'Ochre', hex: '#A8791F', on: '#101B2D', text: '#7A5612' },
  { id: 'slate', name: 'Slate blue', hex: '#3F5B7A', on: '#F8F6F0', text: '#3F5B7A' },
];

const nordicExplorer: TemplateDef = {
  id: 'nordic-explorer',
  name: 'Nordic Explorer',
  blurb: 'Warm ivory, forest green and light, minimalist type with room to breathe.',
  nativeTypeface: 'sans',
  accents: NORDIC_ACCENTS,
  fonts: (typeface) => fontsWith(['manrope-300'], typeface, 'manrope-300'),
  look: (settings) => {
    const accent = pick(NORDIC_ACCENTS, settings.accent);
    const face = titleFace(settings.typeface === 'template' ? 'sans' : settings.typeface, 'manrope-300');
    return {
      margin: 86,
      align: 'left',
      paper: '#F8F6F0',
      ink: '#101B2D',
      inkSoft: '#4F5B6B',
      accent: accent.hex,
      onAccent: accent.on,
      accentText: accent.text,
      land: '#E2DDD0',
      border: '#F8F6F0',
      coast: '#A7A08C',
      coastWidth: 0.5,
      water: '#F8F6F0',
      landLabel: '#4F5B6B',
      leader: '#5B6676',
      wishBg: '#F1EEE5',
      wishLine: accent.hex,
      sphere: '#F8F6F0',
      sphereLine: '#D6CFBD',
      graticuleBleed: 0,
      mapInset: [0, 0, 0, 0],
      mapOverscan: 40,
      sealInk: accent.text,
      fonts: {
        title: face.title,
        subtitle: 'manrope-300',
        label: 'manrope-500',
        body: 'manrope-500',
        bodyBold: 'manrope-700',
        numeral: face.numeral,
        caption: 'manrope-300',
      },
      titleSize: face.titleSize,
      titleLeading: face.titleLeading,
      titleTracking: face.titleTracking,
      titleUpper: false,
      numeralSize: face.numeralSize,
      numeralFill: accent.text,
      numeralTracking: face.numeralTracking,
      captionSize: 23,
      bylineJoin: ', ',
      titleOrnament: (c, x, y, anchor) => {
        const w = 56;
        const left = anchor === 'middle' ? x - w / 2 : x;
        c.p.rect(left, y - 2, w, 4, { fill: c.look.accent });
      },
    };
  },
  background: paper,
};

// ---------------------------------------------------------------------------------------------
// Modern Cartographer: a survey sheet. Neatline, graticule, scale bar, imprint.
// ---------------------------------------------------------------------------------------------

const CARTO_ACCENTS: Accent[] = [
  { id: 'navy', name: 'Ink navy', hex: '#101B2D', on: '#FBFAF7', text: '#101B2D' },
  { id: 'forest', name: 'Forest', hex: '#315C4C', on: '#FBFAF7', text: '#315C4C' },
  { id: 'brick', name: 'Brick', hex: '#9B3D2E', on: '#FBFAF7', text: '#9B3D2E' },
  { id: 'cobalt', name: 'Cobalt', hex: '#1F4E8C', on: '#FBFAF7', text: '#1F4E8C' },
  { id: 'gold', name: 'Antique gold', hex: '#B8955A', on: '#101B2D', text: '#7E6431' },
];

const NEATLINE = 14;

const modernCartographer: TemplateDef = {
  id: 'modern-cartographer',
  name: 'Modern Cartographer',
  blurb: 'A clean survey sheet: neatline, graticule, scale bar and a precise sans serif.',
  nativeTypeface: 'sans',
  accents: CARTO_ACCENTS,
  fonts: (typeface) => fontsWith([], typeface, 'manrope-700'),
  look: (settings) => {
    const accent = pick(CARTO_ACCENTS, settings.accent);
    const face = titleFace(settings.typeface === 'template' ? 'sans' : settings.typeface, 'manrope-700');
    return {
      margin: 76,
      align: 'left',
      paper: '#FBFAF7',
      ink: '#101B2D',
      inkSoft: '#4F5B6B',
      accent: accent.hex,
      onAccent: accent.on,
      accentText: accent.text,
      land: '#E8E4DA',
      border: '#FBFAF7',
      coast: '#101B2D',
      coastWidth: 0.5,
      water: '#FBFAF7',
      landLabel: '#3D4857',
      leader: '#101B2D',
      wishBg: '#F4F1EA',
      wishLine: accent.hex,
      sphere: '#FBFAF7',
      sphereLine: '#101B2D',
      graticule: '#DAD6CB',
      graticuleBleed: NEATLINE - 1,
      mapInset: [NEATLINE, NEATLINE, NEATLINE + 34, NEATLINE],
      mapOverscan: 0,
      sealInk: '#101B2D',
      fonts: {
        title: face.title,
        subtitle: 'manrope-500',
        label: 'manrope-700',
        body: 'manrope-500',
        bodyBold: 'manrope-700',
        numeral: face.numeral,
        caption: 'manrope-500',
      },
      titleSize: face.titleSize,
      titleLeading: face.titleLeading,
      titleTracking: face.titleTracking,
      titleUpper: false,
      numeralSize: face.numeralSize,
      numeralFill: '#101B2D',
      numeralTracking: face.numeralTracking,
      captionSize: 21,
      bylineJoin: ', ',
      overline: (c) => c.def.name,
      titleOrnament: (c, x, y, anchor, width) => {
        const left = anchor === 'middle' ? x - width / 2 : x;
        c.p.line(left, y, left + width, y, { stroke: c.look.ink, strokeWidth: 1.2 });
      },
    };
  },
  background: paper,
  overMap: (c, placed, rect) => {
    const { p, look, meta } = c;
    // The neatline: a fine inner line and a heavier outer one, hugging the map itself.
    const b = placed.box;
    const inner = NEATLINE - 6;
    p.rect(b.x - inner, b.y - inner, b.w + inner * 2, b.h + inner * 2, { stroke: look.ink, strokeWidth: 0.6 });
    p.rect(b.x - NEATLINE, b.y - NEATLINE, b.w + NEATLINE * 2, b.h + NEATLINE * 2, { stroke: look.ink, strokeWidth: 1.6 });

    const small: TextSpec = { font: 'manrope-500', size: 11.5, fill: look.inkSoft };
    const noteY = b.y + b.h + NEATLINE + 17;
    if (noteY < rect.y + rect.h + 34) p.text(imprint(c), b.x + b.w + NEATLINE, noteY, { ...small, anchor: 'end' });

    // A scale bar, only where the projection has a line of true scale to measure it on.
    const kmPerUnit = meta.projection.kmPerUnit;
    if (kmPerUnit) {
      const km = [2000, 1000, 500, 250, 100].find((v) => (v / kmPerUnit) * placed.scale <= b.w * 0.24) ?? 100;
      const len = (km / kmPerUnit) * placed.scale;
      const x = b.x - NEATLINE;
      const y = b.y + b.h + NEATLINE + 13;
      p.rect(x, y - 4, len / 2, 4, { fill: look.ink });
      p.rect(x + len / 2, y - 4, len / 2, 4, { stroke: look.ink, strokeWidth: 0.8 });
      p.text('0', x, y + 13, small);
      p.text(`${formatCount(km)} km`, x + len, y + 13, { ...small, anchor: 'end' });
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Travel Journal: warm paper, a handwritten title and a postmark.
// ---------------------------------------------------------------------------------------------

const JOURNAL_ACCENTS: Accent[] = [
  { id: 'forest', name: 'Forest', hex: '#315C4C', on: '#F5EFE0', text: '#315C4C' },
  { id: 'brick', name: 'Brick', hex: '#9B3D2E', on: '#F5EFE0', text: '#9B3D2E' },
  { id: 'navy', name: 'Fountain-pen blue', hex: '#22334F', on: '#F5EFE0', text: '#22334F' },
  { id: 'plum', name: 'Plum', hex: '#5A3A52', on: '#F5EFE0', text: '#5A3A52' },
  { id: 'teal', name: 'Teal', hex: '#2F6B73', on: '#F5EFE0', text: '#2A5F66' },
];

const travelJournal: TemplateDef = {
  id: 'travel-journal',
  name: 'Travel Journal',
  blurb: 'Warm speckled paper, a handwritten title and a postmark, like a page you kept.',
  nativeTypeface: 'script',
  accents: JOURNAL_ACCENTS,
  fonts: (typeface) => fontsWith(['caveat-600'], typeface, 'manrope-700'),
  look: (settings) => {
    const accent = pick(JOURNAL_ACCENTS, settings.accent);
    const chosen = settings.typeface === 'template' ? 'script' : settings.typeface;
    const native = chosen === 'script';
    const face = titleFace(chosen, 'manrope-700');
    return {
      margin: 92,
      align: 'center',
      paper: '#EFE7D4',
      ink: '#2E2A24',
      inkSoft: '#655C4C',
      accent: accent.hex,
      onAccent: accent.on,
      accentText: accent.text,
      land: '#DCCFB2',
      border: '#EFE7D4',
      coast: '#8A7957',
      coastWidth: 0.55,
      water: '#EFE7D4',
      landLabel: '#574F41',
      leader: '#655C4C',
      wishBg: '#E8DEC6',
      wishLine: accent.hex,
      sphere: '#EFE7D4',
      sphereLine: '#B9AB8B',
      graticuleBleed: 0,
      mapInset: [0, 0, 0, 0],
      mapOverscan: 34,
      sealInk: accent.text,
      fonts: {
        title: face.title,
        subtitle: 'manrope-500',
        label: 'manrope-700',
        body: 'manrope-500',
        bodyBold: 'manrope-700',
        numeral: face.numeral,
        caption: 'caveat-600',
      },
      titleSize: face.titleSize,
      titleLeading: face.titleLeading,
      titleTracking: face.titleTracking,
      titleUpper: false,
      titleTilt: native ? -1.6 : 0,
      numeralSize: face.numeralSize,
      numeralFill: accent.text,
      numeralTracking: face.numeralTracking,
      captionSize: 38,
      bylineJoin: ', ',
    };
  },
  background: (c) => {
    paper(c);
    const { p, W, H } = c;
    // Flecks and fibres, drawn as vectors so the paper stays crisp at any print size. They are
    // clipped to the sheet, and continue into the bleed so a trimmed edge never shows bare paper.
    const b = c.bleed;
    p.group({ clip: rectPath(-b, -b, W + b * 2, H + b * 2) }, () => {
      const next = random(20261010);
      let dark = '';
      let light = '';
      for (let i = 0; i < 620; i++) {
        const x = next() * W;
        const y = next() * H;
        const r = 0.35 + next() * next() * 1.5;
        if (next() > 0.35) dark += circlePath(x, y, r);
        else light += circlePath(x, y, r * 1.3);
      }
      let fibres = '';
      for (let i = 0; i < 110; i++) {
        const x = next() * W;
        const y = next() * H;
        const a = next() * Math.PI;
        const len = 5 + next() * 16;
        const bend = (next() - 0.5) * 7;
        const ex = x + Math.cos(a) * len;
        const ey = y + Math.sin(a) * len;
        fibres += `M${x.toFixed(1)} ${y.toFixed(1)}Q${((x + ex) / 2 + bend).toFixed(1)} ${((y + ey) / 2 - bend).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      }
      if (b > 0) {
        // The same density of flecks in the strip outside the trim line.
        const edge = random(4070);
        const want = Math.ceil((620 * ((W + b * 2) * (H + b * 2) - W * H)) / (W * H));
        for (let made = 0, tries = 0; made < want && tries < want * 400; tries++) {
          const x = -b + edge() * (W + b * 2);
          const y = -b + edge() * (H + b * 2);
          if (x >= 0 && x <= W && y >= 0 && y <= H) continue;
          dark += circlePath(x, y, 0.35 + edge() * edge() * 1.5);
          made++;
        }
      }
      p.path(dark, { fill: '#6B5A3A', fillOpacity: 0.16 });
      p.path(light, { fill: '#FFFDF6', fillOpacity: 0.5 });
      p.path(fibres, { stroke: '#7A6845', strokeWidth: 0.5, strokeOpacity: 0.22, lineCap: 'round' });
    });

    // A stitched border.
    const top = c.format.safeTop ? c.format.safeTop - 44 : 0;
    const bottom = c.format.safeBottom ? c.format.safeBottom - 44 : 0;
    p.path(rectPath(38, 38 + top, W - 76, H - 76 - top - bottom), {
      stroke: '#8A7957',
      strokeWidth: 1.1,
      strokeOpacity: 0.75,
      dash: [9, 6],
    });
  },
  overMap: (c, placed) => {
    // A postmark in a quiet corner of the map: place on top, dates or "Travel journal" below.
    const { p, look, def, settings } = c;
    const r = 48;
    // Prefer the corner opposite the seal; both sit over open water.
    if (c.achievements.some((a) => a.id === settings.badge && a.earned)) c.corners.push(c.corners.shift()!);
    const [cx, cy] = claimCorner(c, placed, r, 1.02);
    const ink = look.inkSoft;
    p.group({ transform: rotate(-11, cx, cy) }, () => {
      p.circle(cx, cy, r, { stroke: ink, strokeWidth: 1.3, strokeOpacity: 0.7 });
      p.circle(cx, cy, r - 15, { stroke: ink, strokeWidth: 0.8, strokeOpacity: 0.7 });
      const ring: TextSpec = { font: 'manrope-700', size: 9.5, fill: ink, tracking: 200, upper: true, opacity: 0.8 };
      p.arcText(def.place === 'World' ? 'The world' : def.place, cx, cy, r - 11.5, 0, ring);
      // The dates go round the bottom if they fit in under half the circle, a little smaller if
      // need be. Longer dates stay in the line under the title, where there is room for them.
      const dates = settings.dates.trim();
      const room = 165;
      const need = dates ? p.arcAngle(dates, r - 4.5, ring) : 0;
      const lower = !dates || need > room / 0.8 ? 'Travel journal' : dates;
      const lowerSpec = lower === dates && need > room ? { ...ring, size: (ring.size * room) / need } : ring;
      p.arcText(lower, cx, cy, r - 4.5, 180, lowerSpec, true);
      const mid: TextSpec = { font: 'manrope-700', size: 15, fill: ink, anchor: 'middle', opacity: 0.8 };
      p.text(`${c.stats.visited}/${c.stats.total}`, cx, cy + 5.5, mid);
      // Cancellation lines trailing off to the right, or to the left when the postmark sits too
      // close to the edge of the sheet for them to fit.
      const start = r + 6;
      const dir = cx + start + 72 <= c.W - look.margin * 0.5 ? 1 : -1;
      const step = `q${9 * dir} -5 ${18 * dir} 0q${9 * dir} 5 ${18 * dir} 0`;
      let waves = '';
      for (let i = -2; i <= 2; i++) {
        waves += `M${(cx + dir * start).toFixed(2)} ${(cy + i * 9).toFixed(2)}${step}${step}`;
      }
      p.path(waves, { stroke: ink, strokeWidth: 1, strokeOpacity: 0.55, lineCap: 'round' });
    });
  },
};

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  'midnight-atlas': midnightAtlas,
  'nordic-explorer': nordicExplorer,
  'modern-cartographer': modernCartographer,
  'travel-journal': travelJournal,
};

export const TEMPLATE_LIST: TemplateDef[] = [midnightAtlas, nordicExplorer, modernCartographer, travelJournal];
