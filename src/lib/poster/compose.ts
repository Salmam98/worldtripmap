import { computeAchievements } from '../maps/achievements';
import type { PlacesSummary } from '../maps/places';
import { inkOn, SHADE_STOPS, shadeHex } from '../maps/shade';
import { computeStats, formatCount, type MapStats } from '../maps/stats';
import type { FeatureDef, MapDefinition, MapGeoMeta, MapGeometry, Selection } from '../maps/types';
import type { FontKey, FontSet } from './fonts';
import type { PosterFormat } from './formats';
import { Painter, type RasterText, type TextSpec } from './painter';
import { circlePath, linePath, rectPath, rotate, type Matrix, type Scene } from './scene';
import type { PosterSettings } from './settings';
import { claimCorner, QUIET_CORNERS, type Ctx, type PlacedMap, type Rect } from './context';
import { TEMPLATES } from './templates';

export type { Ctx, PlacedMap, Rect } from './context';

export interface PosterInput {
  def: MapDefinition;
  meta: MapGeoMeta;
  geometry: MapGeometry;
  selection: Selection;
  settings: PosterSettings;
  format: PosterFormat;
  /** Background drawn beyond each edge, in poster units. Zero for screens. */
  bleed?: number;
  /** Places ticked inside the map's features (a province's cities, parks and landmarks). */
  places?: PlacesSummary | null;
}

interface Block {
  h: number;
  draw: (y: number) => void;
}

const EMPTY: Block = { h: 0, draw: () => {} };

/** Places where a short map label would not fit inside its region, moved out with a leader line. */
const LABEL_NUDGE: Record<string, [number, number]> = {
  'CA-PE': [330, -300],
  'CA-NS': [420, 260],
};

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

export function fontsFor(settings: PosterSettings): FontKey[] {
  return TEMPLATES[settings.template].fonts(settings.typeface);
}

export function composePoster(input: PosterInput, fonts: FontSet, raster?: RasterText): Scene {
  const { def, meta, geometry, selection, settings, format } = input;
  const template = TEMPLATES[settings.template];
  const look = template.look(settings);
  const p = new Painter(fonts, raster);
  const W = format.width;
  const H = format.height;
  const stats = computeStats(def, selection);
  // Percentages from places appear only when there is something to show and they are switched on.
  const places = settings.showPlaces && input.places && input.places.visited > 0 ? input.places : null;
  const c: Ctx = {
    p,
    W,
    H,
    bleed: input.bleed ?? 0,
    def,
    meta,
    geometry,
    selection,
    settings,
    format,
    stats,
    places,
    achievements: computeAchievements(def, selection),
    look,
    template,
    top: look.margin + (format.safeTop ?? 0),
    bottom: H - look.margin - (format.safeBottom ?? 0),
    corners: [...(QUIET_CORNERS[def.id] ?? ['top-right'])],
  };

  template.background(c);
  const [bx0, by0, bx1, by1] = meta.bounds;
  const mapAspect = (bx1 - bx0) / (by1 - by0);
  if (W > H && mapAspect < 1.6) columnsLayout(c);
  else stackLayout(c);

  return {
    width: W,
    height: H,
    bleed: c.bleed,
    background: look.paper,
    nodes: p.nodes,
    description:
      `${settings.title || def.defaultPosterTitle}: a ${template.name} poster of ${def.name}. ` +
      `${stats.visited} of ${stats.total} ${def.unit.many} explored.` +
      (places ? ` ${places.visited} of ${places.total} places, ${places.percentLabel} of ${def.place}.` : ''),
  };
}

// ---------------------------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------------------------

/** Title on top, map in the middle, numbers and places underneath. Used for upright formats. */
function stackLayout(c: Ctx): void {
  const { W, look } = c;
  const wide = W > c.H;
  const x0 = look.margin;
  const x1 = W - look.margin;
  const cw = x1 - x0;
  const centre = look.align === 'center';
  const anchor: Anchor = centre ? 'middle' : 'start';
  const gap = wide ? 30 : 38;

  const brand = brandBlock(c, { x: x0, w: cw, anchor });
  const footerBottom = c.bottom - brand.h;

  let headerBottom: number;
  let footer: Block;

  if (wide) {
    // Title on the left, the count on the right, both resting on one baseline row.
    const title = titleBlock(c, { x: x0, w: cw * 0.6, anchor: 'start' });
    const stats = statsBlock(c, { x: x1 - cw * 0.36, w: cw * 0.36, anchor: 'end' });
    const h = Math.max(title.h, stats.h);
    title.draw(c.top + (h - title.h));
    stats.draw(c.top + (h - stats.h));
    headerBottom = c.top + h;
    const caption = captionBlock(c, { x: x0, w: cw, anchor });
    const list = listBlock(c, { x: x0, w: cw, maxH: 150, columns: 6, align: look.align });
    footer = stackBlocks([list, caption], 16);
  } else {
    const title = titleBlock(c, { x: x0, w: cw, anchor });
    title.draw(c.top);
    headerBottom = c.top + title.h;

    const caption = captionBlock(c, { x: x0, w: cw, anchor });
    const [bx0, by0, bx1, by1] = c.meta.bounds;
    const naturalMapH = cw / ((bx1 - bx0) / (by1 - by0));
    // A wide map on a tall page leaves room to spare, so the numbers and names are set larger.
    const roomy = footerBottom - headerBottom - naturalMapH > 620 ? 1.22 : 1;
    if (centre) {
      const stats = statsBlock(c, { x: x0, w: cw, anchor: 'middle' }, roomy);
      const spare = footerBottom - headerBottom - gap * 2 - stats.h - caption.h - naturalMapH - 44;
      const list = listBlock(c, { x: x0, w: cw, maxH: Math.max(118, Math.min(spare, 460)), columns: 3, align: 'center', scale: roomy });
      footer = stackBlocks([stats, list, caption], 22 * roomy);
    } else {
      const statsW = cw * 0.4;
      const stats = statsBlock(c, { x: x0, w: statsW, anchor: 'start' }, roomy);
      const spare = footerBottom - headerBottom - gap * 2 - caption.h - naturalMapH - 30;
      const list = listBlock(c, {
        x: x0 + statsW + 28,
        w: cw - statsW - 28,
        maxH: Math.max(stats.h + 30, Math.min(spare, 460)),
        columns: 2,
        align: 'left',
        scale: roomy,
      });
      const row: Block = {
        h: Math.max(stats.h, list.h),
        draw: (y) => {
          stats.draw(y);
          list.draw(y);
        },
      };
      footer = stackBlocks([row, caption], 22);
    }
  }

  const footerTop = footerBottom - footer.h;
  footer.draw(footerTop);
  brand.draw(c.bottom - brand.h);

  const [it, ir, ib, il] = look.mapInset;
  const mapRect: Rect = {
    x: x0 + il,
    y: headerBottom + gap + it,
    w: cw - il - ir,
    h: footerTop - gap - (headerBottom + gap) - it - ib,
  };
  // A map limited by the page width may run a little way into the side margins.
  const [bx0, by0, bx1, by1] = c.meta.bounds;
  if (!wide && mapRect.w / ((bx1 - bx0) / (by1 - by0)) < mapRect.h * 0.86) {
    mapRect.x -= look.mapOverscan;
    mapRect.w += look.mapOverscan * 2;
  }
  const placed = drawMap(c, mapRect);
  c.template.overMap?.(c, placed, mapRect);
  drawSeal(c, placed);
}

/** Map on the left, a text column on the right. Used for wide formats with a squarer map. */
function columnsLayout(c: Ctx): void {
  const { W, look } = c;
  const x0 = look.margin;
  const x1 = W - look.margin;
  const colW = Math.round((x1 - x0) * 0.31);
  const colX = x1 - colW;
  const gutter = 44;
  const column = { x: colX, w: colW, anchor: 'start' as Anchor };

  const brand = brandBlock(c, column);
  const title = titleBlock(c, { ...column, shrink: 0.8 });
  const stats = statsBlock(c, column);
  const caption = captionBlock(c, column);
  title.draw(c.top);
  const statsY = c.top + title.h + 36;
  stats.draw(statsY);
  const listTop = statsY + stats.h + 30;
  const listMax = c.bottom - brand.h - caption.h - 18 - listTop;
  const list = listBlock(c, { x: colX, w: colW, maxH: Math.max(60, listMax), columns: 2, align: 'left' });
  list.draw(listTop);
  caption.draw(c.bottom - brand.h - caption.h);
  brand.draw(c.bottom - brand.h);

  const [it, ir, ib, il] = look.mapInset;
  const mapRect: Rect = { x: x0 + il, y: c.top + it, w: colX - gutter - x0 - il - ir, h: c.bottom - c.top - it - ib };
  const placed = drawMap(c, mapRect);
  c.template.overMap?.(c, placed, mapRect);
  drawSeal(c, placed);
}

function stackBlocks(blocks: Block[], gap: number): Block {
  const present = blocks.filter((b) => b.h > 0);
  const h = present.reduce((a, b) => a + b.h, 0) + gap * Math.max(0, present.length - 1);
  return {
    h,
    draw: (y) => {
      let at = y;
      for (const block of present) {
        block.draw(at);
        at += block.h + gap;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Text blocks
// ---------------------------------------------------------------------------------------------

type Anchor = 'start' | 'middle' | 'end';

/** Where a block sits: its left edge, its width, and which edge its text hangs from. */
interface Slot {
  x: number;
  w: number;
  anchor: Anchor;
}

function anchorX(slot: Slot): number {
  return slot.anchor === 'start' ? slot.x : slot.anchor === 'middle' ? slot.x + slot.w / 2 : slot.x + slot.w;
}

function titleBlock(c: Ctx, slot: Slot & { shrink?: number }): Block {
  const { p, look, settings, def } = c;
  const { anchor, w: width } = slot;
  const x = anchorX(slot);
  const title = settings.title.trim() || def.defaultPosterTitle;

  const overline = look.overline ? look.overline(c) : '';
  let overSpec: TextSpec = { font: look.fonts.label, size: 17, fill: look.accentText, tracking: 260, upper: true, anchor };
  if (overline && p.measure(overline, overSpec) > width) overSpec = p.fit(overline, { ...overSpec, tracking: 160 }, width, 11);

  const base: TextSpec = {
    font: look.fonts.title,
    size: look.titleSize * (slot.shrink ?? 1),
    fill: look.ink,
    tracking: look.titleTracking,
    upper: look.titleUpper,
    anchor,
  };
  let spec = base;
  let lines = [title];
  if (p.measure(title, base) > width) {
    let found = false;
    for (let size = base.size * 0.92; size >= base.size * 0.46; size *= 0.94) {
      const trial = { ...base, size };
      const wrapped = p.wrap(title, trial, width, 2);
      if (wrapped.length <= 2 && !wrapped.some((l) => l.endsWith('…'))) {
        spec = trial;
        lines = wrapped;
        found = true;
        break;
      }
    }
    if (!found) {
      spec = { ...base, size: base.size * 0.46 };
      lines = p.wrap(title, spec, width, 2);
    }
  }
  const leading = spec.size * look.titleLeading;

  // The subtitle and byline shrink to fit one line, and wrap onto a second in a narrow column.
  const sub = p.fitLines(settings.subtitle.trim(), { font: look.fonts.subtitle, size: 27, fill: look.inkSoft, anchor }, width, 17);
  const byline = [settings.name.trim(), settings.dates.trim()].filter(Boolean).join(look.bylineJoin);
  const by = p.fitLines(byline, { font: look.fonts.label, size: 18, fill: look.inkSoft, tracking: 140, upper: true, anchor }, width, 12);
  const subLeading = sub.spec.size * 1.3;
  const byLeading = by.spec.size * 1.45;

  const overH = overline ? 17 + 22 : 0;
  const titleH = spec.size * 0.82 + leading * (lines.length - 1) + spec.size * 0.2;
  const ornamentH = look.titleOrnament ? 34 : 0;
  const subH = sub.lines.length ? 14 + sub.spec.size + subLeading * (sub.lines.length - 1) : 0;
  const byH = by.lines.length ? 18 + by.spec.size + byLeading * (by.lines.length - 1) : 0;
  const h = overH + titleH + ornamentH + subH + byH;

  return {
    h,
    draw: (top) => {
      let y = top;
      if (overline) {
        p.text(overline, x, y + 15, overSpec);
        y += overH;
      }
      lines.forEach((line, i) => {
        const baseline = y + spec.size * 0.82 + leading * i;
        p.text(line, x, baseline, spec, look.titleTilt ? rotate(look.titleTilt, x, baseline) : undefined);
      });
      y += titleH;
      if (look.titleOrnament) {
        look.titleOrnament(c, x, y + ornamentH / 2 + 2, anchor, width);
        y += ornamentH;
      }
      if (sub.lines.length) {
        y += 14;
        sub.lines.forEach((line, i) => p.text(line, x, y + sub.spec.size * 0.8 + subLeading * i, sub.spec));
        y += sub.spec.size + subLeading * (sub.lines.length - 1);
      }
      if (by.lines.length) {
        y += 18;
        by.lines.forEach((line, i) => p.text(line, x, y + by.spec.size * 0.8 + byLeading * i, by.spec));
      }
    },
  };
}

/** The words of the numbers block, kept apart from the drawing so they can be read as text. */
export interface PosterFigures {
  /** The large figure. */
  numeral: string;
  /** The line beside it, and the words that follow on the next. */
  first: string;
  label: string;
  /** Smaller lines underneath. */
  extras: string[];
}

/**
 * What a poster says about the map in numbers. With places ticked inside the provinces, the page
 * leads with how much of the country that comes to, and the count of provinces moves to the small
 * lines underneath. Without them it leads with the count, as on every other map.
 */
export function posterFigures(def: MapDefinition, stats: MapStats, places: PlacesSummary | null): PosterFigures {
  const unit = stats.total === 1 ? def.unit.one : def.unit.many;
  const extras: string[] = places
    ? [
        `${formatCount(places.visited)} of ${formatCount(places.total)} places visited`,
        `${formatCount(stats.visited)} of ${formatCount(stats.total)} ${unit}`,
      ]
    : [`${stats.percentLabel} of ${def.id === 'canada-cities' ? 'the cities on this map' : def.unit.many}`];
  if (def.otherUnit && stats.otherVisited > 0) {
    extras.push(`plus ${stats.otherVisited} ${stats.otherVisited === 1 ? def.otherUnit.one : def.otherUnit.many}`);
  }
  if (def.id === 'world' && stats.visited > 0) extras.push(`${stats.groupsTouched} of ${stats.groupsTotal} inhabited continents`);
  return places
    ? { numeral: places.percentLabel, first: `of ${def.place}`, label: 'explored', extras }
    : { numeral: String(stats.visited), first: `of ${formatCount(stats.total)}`, label: `${unit} explored`, extras };
}

function statsBlock(c: Ctx, slot: Slot, k = 1): Block {
  const { p, look, stats, def, places } = c;
  const { anchor, w: width } = slot;
  const { numeral, first, label, extras } = posterFigures(def, stats, places);
  const row = 24 * k;
  const labelSpec: TextSpec = { font: look.fonts.bodyBold, size: 21 * k, fill: look.ink };
  const smallSpec: TextSpec = { font: look.fonts.body, size: 17 * k, fill: look.inkSoft, anchor };

  // The figure and the words beside it share one line. "100%" is much wider than "7", so the
  // figure gives way, a little at a time, until the two fit the room the block has.
  const numBase: TextSpec = { font: look.fonts.numeral, size: look.numeralSize * k, fill: look.numeralFill, tracking: look.numeralTracking };
  const arrange = (size: number) => {
    const spec: TextSpec = { ...numBase, size };
    const w = p.measure(numeral, spec);
    const lines = p.wrap(label, labelSpec, Math.max(150, width - w - 22), 2);
    const text = Math.max(p.measure(first, labelSpec), ...lines.map((l) => p.measure(l, labelSpec)));
    return { spec, w, lines, total: w + 20 + text };
  };
  let fit = arrange(numBase.size);
  while (fit.total > width && fit.spec.size > numBase.size * 0.5) fit = arrange(fit.spec.size * 0.97);
  const { spec: numSpec, w: numW, lines: labelLines, total: blockW } = fit;
  const numeralSize = numSpec.size;

  const numH = numeralSize * 0.74;
  const labelH = row * (1 + labelLines.length);
  const topH = Math.max(numH, labelH);
  const h = topH + 14 + extras.length * row;

  return {
    h,
    draw: (top) => {
      const left = anchor === 'start' ? slot.x : anchor === 'middle' ? slot.x + (width - blockW) / 2 : slot.x + width - blockW;
      const baseline = top + topH;
      p.text(numeral, left, baseline, numSpec);
      const tx = left + numW + 20;
      const firstBaseline = baseline - row * labelLines.length - 2;
      p.text(first, tx, firstBaseline, labelSpec);
      labelLines.forEach((line, i) => p.text(line, tx, firstBaseline + row * (i + 1), labelSpec));
      extras.forEach((line, i) => p.text(line, anchorX(slot), baseline + 14 + 18 * k + row * i, smallSpec));
    },
  };
}

function captionBlock(c: Ctx, slot: Slot): Block {
  const { p, look, settings } = c;
  const caption = settings.caption.trim();
  if (!caption) return EMPTY;
  const spec: TextSpec = { font: look.fonts.caption, size: look.captionSize, fill: look.ink, anchor: slot.anchor };
  const lines = p.wrap(caption, spec, Math.min(slot.w, 760), 2);
  const leading = spec.size * 1.28;
  return {
    h: leading * lines.length + 6,
    draw: (top) => lines.forEach((line, i) => p.text(line, anchorX(slot), top + spec.size * 0.86 + leading * i, spec)),
  };
}

function brandBlock(c: Ctx, slot: Slot): Block {
  const { p, look, settings } = c;
  if (!settings.showBrand) return EMPTY;
  const spec: TextSpec = { font: look.fonts.label, size: 14, fill: look.inkSoft, tracking: 120, opacity: 0.9 };
  const text = 'worldtripmap.com';
  const w = p.measure(text, spec);
  const mark = 15;
  const total = mark + 9 + w;
  return {
    h: 40,
    draw: (top) => {
      const left = slot.anchor === 'middle' ? slot.x + slot.w / 2 - total / 2 : slot.anchor === 'end' ? slot.x + slot.w - total : slot.x;
      const cy = top + 30;
      const r = mark / 2;
      // The site mark: a globe with one gore filled in.
      p.path(`M${left + r} ${cy - r}C${left + r + r * 0.58} ${cy - r} ${left + r + r * 0.58} ${cy + r} ${left + r} ${cy + r}Z`, {
        fill: look.accent,
      });
      p.circle(left + r, cy, r, { stroke: look.inkSoft, strokeWidth: 1 });
      p.line(left + r, cy - r, left + r, cy + r, { stroke: look.inkSoft, strokeWidth: 0.8 });
      p.text(text, left + mark + 9, cy + 4.6, spec);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The list of places
// ---------------------------------------------------------------------------------------------

interface ListOptions {
  x: number;
  w: number;
  maxH: number;
  columns: number;
  align: 'center' | 'left';
  /** Enlarges the type when the page has room to spare. */
  scale?: number;
}

function marker(c: Ctx, x: number, y: number, state: 'visited' | 'wishlist' | 'none', fill?: string): void {
  const { p, look } = c;
  const s = 9;
  if (state === 'visited') p.rect(x, y - s, s, s, { fill: fill ?? look.accent });
  else if (state === 'wishlist') {
    p.rect(x, y - s, s, s, { fill: look.wishBg, stroke: look.wishLine, strokeWidth: 1 });
    p.line(x, y, x + s, y - s, { stroke: look.wishLine, strokeWidth: 1.2 });
  } else p.rect(x + 0.5, y - s + 0.5, s - 1, s - 1, { stroke: look.inkSoft, strokeWidth: 1, strokeOpacity: 0.7 });
}

function listBlock(c: Ctx, o: ListOptions): Block {
  const { def, settings } = c;
  if (!settings.showList) return legendBlock(c, o);
  return def.features.length <= 16 ? checklistBlock(c, o) : namesBlock(c, o);
}

/** A compact key, shown when the list of places is switched off. */
function legendBlock(c: Ctx, o: ListOptions): Block {
  const { p, look, settings, stats } = c;
  // With provinces coloured by their percentage, the key shows the scale instead of one square.
  const ramp = shaded(c) ? SHADE_STOPS.map((share) => shadeHex(look.land, look.accent, share)) : null;
  const items: ['visited' | 'wishlist' | 'none', string][] = [['visited', ramp ? 'Explored: stronger colour, more places visited' : 'Explored']];
  if (settings.showWishlist && stats.wishlist > 0) items.push(['wishlist', 'Want to go']);
  items.push(['none', 'Not yet']);
  const gap = 26;
  const lead = (state: string) => (state === 'visited' && ramp ? ramp.length * 9 + 7 : 16);
  let spec: TextSpec = { font: look.fonts.body, size: 16, fill: look.inkSoft };
  const measure = () => items.map(([state, label]) => lead(state) + p.measure(label, spec));
  const sum = (list: number[]) => list.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  while (spec.size > 11 && sum(measure()) > o.w) spec = { ...spec, size: spec.size - 0.5 };
  const widths = measure();
  const total = sum(widths);
  return {
    h: 22,
    draw: (top) => {
      let x = o.align === 'center' ? o.x + (o.w - total) / 2 : o.x;
      items.forEach(([state, label], i) => {
        if (state === 'visited' && ramp) ramp.forEach((fill, step) => marker(c, x + step * 9, top + 16, 'visited', fill));
        else marker(c, x, top + 16, state);
        p.text(label, x + lead(state), top + 16, spec);
        x += widths[i] + gap;
      });
    },
  };
}

/** Every place with its state, for maps short enough to list in full. Doubles as the map key. */
function checklistBlock(c: Ctx, o: ListOptions): Block {
  const { p, look, def, selection, settings, places } = c;
  const row = 23;
  const items = def.features.map((feature) => {
    const visited = selection.visited.has(feature.id);
    const wished = !visited && settings.showWishlist && selection.wishlist.has(feature.id);
    const inside = places?.byFeature[feature.id];
    return {
      feature,
      state: (visited ? 'visited' : wished ? 'wishlist' : 'none') as 'visited' | 'wishlist' | 'none',
      // How much of this province has been seen, by the places ticked inside it.
      share: inside && inside.visited > 0 ? inside.percentLabel : '',
    };
  });
  // With percentages on the page, one small line says what they are, and what the colours mean.
  const footnote = places
    ? 'Percentages: places visited, out of those listed for each one.' + (shaded(c) ? ' Stronger colour, higher percentage.' : '')
    : '';
  const footH = footnote ? 24 : 0;
  let columns = o.columns;
  const colGap = 24;
  let rows = Math.ceil(items.length / columns);
  while (rows * row + footH > o.maxH && columns < 5) {
    columns++;
    rows = Math.ceil(items.length / columns);
  }
  const colW = (o.w - colGap * (columns - 1)) / columns;
  const shareGap = 7;
  const widthOf = (item: (typeof items)[number], s: number) =>
    17 +
    p.measure(item.feature.name, { font: look.fonts.bodyBold, size: s, fill: look.ink }) +
    (item.share ? shareGap + p.measure(item.share, { font: look.fonts.bodyBold, size: s * 0.9, fill: look.ink }) : 0);
  const widestAt = (s: number) => Math.max(...items.map((item) => widthOf(item, s)));
  /** Each column as wide as its own longest line. Used when percentages make the lines uneven. */
  const fitted = (s: number): number[] =>
    Array.from({ length: columns }, (_, col) => Math.max(0, ...items.slice(col * rows, (col + 1) * rows).map((item) => widthOf(item, s))));
  const sum = (widths: number[]) => widths.reduce((a, b) => a + b, 0) + colGap * (columns - 1);

  // One type size for the whole list: the largest at which every line fits.
  let size = 16.5;
  let widths: number[];
  if (places) {
    // A name with a percentage after it can be much longer than its neighbours, so the columns
    // share the width by need instead of equally, and the type may go a little smaller.
    while (size > 9.5 && sum(fitted(size)) > o.w) size -= 0.5;
    widths = fitted(size);
  } else {
    while (size > 11.5 && widestAt(size) > colW) size -= 0.5;
    widths = new Array<number>(columns).fill(Math.min(colW, widestAt(size)));
  }
  const offsets = widths.map((_, col) => widths.slice(0, col).reduce((a, b) => a + b, 0) + colGap * col);
  const blockW = sum(widths);
  const spec: TextSpec = { font: look.fonts.body, size, fill: look.inkSoft };
  const bold: TextSpec = { font: look.fonts.bodyBold, size, fill: look.ink };
  const shareSpec: TextSpec = { font: look.fonts.bodyBold, size: size * 0.9, fill: look.accentText };
  const footSpec = footnote
    ? p.fit(footnote, { font: look.fonts.body, size: 12.5, fill: look.inkSoft, anchor: o.align === 'center' ? 'middle' : 'start' }, o.w, 8.5)
    : null;
  return {
    h: rows * row + footH,
    draw: (top) => {
      const left = o.align === 'center' ? o.x + (o.w - blockW) / 2 : o.x;
      items.forEach((item, i) => {
        const x = left + offsets[Math.floor(i / rows)];
        const y = top + 17 + (i % rows) * row;
        const nameSpec = item.state === 'visited' ? bold : spec;
        marker(c, x, y, item.state, item.state === 'visited' ? toneOf(c, item.feature.id) : undefined);
        p.text(item.feature.name, x + 17, y, nameSpec);
        if (item.share) p.text(item.share, x + 17 + p.measure(item.feature.name, nameSpec) + shareGap, y, shareSpec);
      });
      if (footSpec) p.text(footnote, o.align === 'center' ? o.x + o.w / 2 : o.x, top + rows * row + 16, footSpec);
    },
  };
}

/** The explored places written out, grouped by continent or region, for long lists. */
function namesBlock(c: Ctx, o: ListOptions): Block {
  const { p, look, def, selection, settings } = c;
  const visited = def.features.filter((f) => selection.visited.has(f.id));
  const wished = settings.showWishlist ? def.features.filter((f) => selection.wishlist.has(f.id) && !selection.visited.has(f.id)) : [];
  const anchor: Anchor = o.align === 'center' ? 'middle' : 'start';
  const x = anchorX({ x: o.x, w: o.w, anchor });

  if (!visited.length && !wished.length) {
    const spec: TextSpec = { font: look.fonts.body, size: 18, fill: look.inkSoft, anchor };
    return { h: 26, draw: (top) => p.text(`No ${def.unit.many} marked yet.`, x, top + 19, spec) };
  }

  interface Line {
    label?: string;
    text: string;
  }
  const build = (size: number): { lines: Line[]; leading: number; labelW: number } => {
    const spec: TextSpec = { font: look.fonts.body, size, fill: look.ink };
    const labelSpec: TextSpec = { font: look.fonts.bodyBold, size: size * 0.78, fill: look.accentText, tracking: 140, upper: true };
    const groups = def.groups
      .map((g) => ({ name: g.name, items: visited.filter((f) => f.group === g.id) }))
      .filter((g) => g.items.length);
    const grouped = groups.length > 1 && o.align === 'left';
    const labelW = grouped ? Math.max(...groups.map((g) => p.measure(g.name, labelSpec))) + 18 : 0;
    const lines: Line[] = [];
    const flow = (names: FeatureDef[], label?: string) => {
      const text = names.map((f) => f.name).join(', ');
      p.wrap(text, spec, o.w - labelW, 99).forEach((line, i) => lines.push({ label: i === 0 ? label : undefined, text: line }));
    };
    if (grouped) groups.forEach((g) => flow(g.items, g.name));
    else if (visited.length) flow(visited);
    if (wished.length) flow(wished, grouped ? 'Next' : undefined);
    return { lines, leading: size * 1.42, labelW };
  };

  let size = 19 * (o.scale ?? 1);
  let built = build(size);
  while (built.lines.length * built.leading > o.maxH && size > 12.5) {
    size -= 0.75;
    built = build(size);
  }
  const maxLines = Math.max(1, Math.floor(o.maxH / built.leading));
  let lines = built.lines;
  let hidden = 0;
  if (lines.length > maxLines) {
    const shown = lines.slice(0, maxLines).map((l) => l.text).join(', ');
    hidden = visited.length + wished.length - shown.split(', ').filter(Boolean).length;
    lines = lines.slice(0, maxLines);
    const last = lines[lines.length - 1];
    last.text = `${last.text.replace(/,?\s*[^,]*$/, '')}, and ${Math.max(1, hidden)} more`;
  }
  const spec: TextSpec = { font: look.fonts.body, size, fill: look.ink, anchor };
  const labelSpec: TextSpec = { font: look.fonts.bodyBold, size: size * 0.78, fill: look.accentText, tracking: 140, upper: true };
  return {
    h: lines.length * built.leading,
    draw: (top) => {
      lines.forEach((line, i) => {
        const y = top + size * 0.95 + built.leading * i;
        if (line.label) p.text(line.label, o.x, y, labelSpec);
        p.text(line.text, anchor === 'middle' ? x : o.x + built.labelW, y, spec);
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------------------------

function stateOf(c: Ctx, id: string): 'visited' | 'wishlist' | 'none' {
  if (c.selection.visited.has(id)) return 'visited';
  if (c.settings.showWishlist && c.selection.wishlist.has(id)) return 'wishlist';
  return 'none';
}

/** True when each province is coloured by the share of its places ticked, not all in one colour. */
function shaded(c: Ctx): boolean {
  return Boolean(c.places && c.settings.shadePlaces);
}

/**
 * The colour of an explored place. Usually the accent. When provinces are coloured by their
 * percentage it runs from a light tone for nothing ticked to the full accent for everything, on
 * the same scale as the interactive map (see shade.ts).
 */
function toneOf(c: Ctx, id: string): string {
  const inside = shaded(c) ? c.places!.byFeature[id] : undefined;
  return inside && inside.total ? shadeHex(c.look.land, c.look.accent, inside.visited / inside.total) : c.look.accent;
}

/** The colour of a short label written on an explored place. */
function labelOn(c: Ctx, id: string): string {
  return shaded(c) ? inkOn(toneOf(c, id), [c.look.onAccent, c.look.landLabel]) : c.look.onAccent;
}

function hatch(c: Ctx, d: string, box: [number, number, number, number], unit: number): void {
  const { p, look } = c;
  const [x0, y0, x1, y1] = box;
  const step = 7 * unit;
  let lines = '';
  const span = y1 - y0;
  for (let x = x0 - span; x < x1 + step; x += step) lines += linePath(x, y1, x + span, y0);
  p.group({ clip: d }, () => {
    p.path(rectPath(x0, y0, x1 - x0, y1 - y0), { fill: look.wishBg });
    p.path(lines, { stroke: look.wishLine, strokeWidth: 1.5 * unit });
  });
}

export function drawMap(c: Ctx, rect: Rect): PlacedMap {
  const { p, look, def, meta, geometry, settings } = c;
  const [bx0, by0, bx1, by1] = meta.bounds;
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  const s = Math.min(rect.w / bw, rect.h / bh);
  const ox = rect.x + (rect.w - bw * s) / 2 - bx0 * s;
  const oy = rect.y + (rect.h - bh * s) / 2 - by0 * s;
  const T: Matrix = [s, 0, 0, s, ox, oy];
  const unit = 1 / s;
  const at = (x: number, y: number): [number, number] => [x * s + ox, y * s + oy];
  const box: Rect = { x: ox + bx0 * s, y: oy + by0 * s, w: bw * s, h: bh * s };

  const areas = def.features.filter((f) => geometry.shapes[f.id]);
  const points = def.features.filter((f) => geometry.points?.[f.id]);
  const land = [geometry.base ?? '', ...Object.values(geometry.baseShapes ?? {}), ...Object.values(geometry.shapes)].join('');

  c.template.underMap?.(c, { scale: s, at, box }, rect);

  p.group({ transform: T }, () => {
    if (geometry.outline && look.sphere) {
      p.path(geometry.outline, { fill: look.sphere, stroke: look.sphereLine, strokeWidth: 1 * unit });
    }
    if (geometry.graticule && look.graticule) {
      const draw = () => p.path(geometry.graticule!, { stroke: look.graticule!, strokeWidth: 0.7 * unit });
      if (geometry.outline) draw();
      else {
        const m = look.graticuleBleed * unit;
        const clip = rectPath(bx0 - m, by0 - m, bw + m * 2, bh + m * 2);
        p.group({ clip }, draw);
      }
    }
    // All land once, underneath, with a heavier line: the visible outer half is the coastline.
    p.path(land, { fill: look.land, stroke: look.coast, strokeWidth: look.coastWidth * 2 * unit });

    if (geometry.base) p.path(geometry.base, { fill: look.land, stroke: look.border, strokeWidth: 0.7 * unit });
    for (const d of Object.values(geometry.baseShapes ?? {})) {
      p.path(d, { fill: look.land, stroke: look.border, strokeWidth: 0.9 * unit });
    }
    for (const feature of areas) {
      const d = geometry.shapes[feature.id];
      const state = stateOf(c, feature.id);
      if (state === 'wishlist') {
        hatch(c, d, meta.features[feature.id].bbox, unit);
        p.path(d, { stroke: look.border, strokeWidth: 0.7 * unit });
      } else {
        p.path(d, { fill: state === 'visited' ? toneOf(c, feature.id) : look.land, stroke: look.border, strokeWidth: 0.7 * unit });
      }
    }
    if (geometry.lakes) p.path(geometry.lakes, { fill: look.water, stroke: look.coast, strokeWidth: 0.45 * unit });
  });

  // Countries too small to see at this size still show up as a dot when they are marked.
  for (const feature of areas) {
    const geo = meta.features[feature.id];
    const state = stateOf(c, feature.id);
    if (state === 'none' || geo.size * s >= 5) continue;
    const [x, y] = at(...geo.label);
    if (state === 'visited') p.circle(x, y, 2.7, { fill: toneOf(c, feature.id), stroke: look.paper, strokeWidth: 0.8 });
    else p.circle(x, y, 2.6, { fill: look.wishBg, stroke: look.wishLine, strokeWidth: 1 });
  }

  // Region labels: the short code inside each region, or beside it with a leader line.
  if (settings.showLabels && def.level === 'region') {
    for (const feature of areas) {
      if (!feature.short) continue;
      const geo = meta.features[feature.id];
      const state = stateOf(c, feature.id);
      const spec: TextSpec = {
        font: look.fonts.bodyBold,
        size: 13.5,
        fill: state === 'visited' ? labelOn(c, feature.id) : look.landLabel,
        tracking: 60,
        anchor: 'middle',
      };
      const [x, y] = at(...geo.label);
      const nudge = LABEL_NUDGE[feature.id];
      if (geo.size * s >= 30) {
        if (state === 'wishlist') {
          const w = p.measure(feature.short, spec) + 10;
          p.rect(x - w / 2, y - 9.5, w, 19, { fill: look.wishBg });
        }
        p.text(feature.short, x, y + 4.8, spec);
      } else if (nudge) {
        const [lx, ly] = at(geo.label[0] + nudge[0], geo.label[1] + nudge[1]);
        const dx = lx - x;
        const dy = ly - y;
        const len = Math.hypot(dx, dy) || 1;
        p.line(x, y, lx - (dx / len) * 13, ly - (dy / len) * 13, { stroke: look.leader, strokeWidth: 0.9 });
        p.circle(x, y, 1.7, { fill: look.leader });
        p.text(feature.short, lx, ly + 4.8, { ...spec, fill: look.ink });
      }
    }
  }

  // Cities: a dot for every city, a name beside the ones explored.
  if (points.length) {
    const taken: Rect[] = [];
    const hits = (r: Rect) => taken.some((t) => r.x < t.x + t.w && r.x + r.w > t.x && r.y < t.y + t.h && r.y + r.h > t.y);
    const dots = points.map((feature) => ({ feature, state: stateOf(c, feature.id), xy: at(...geometry.points![feature.id]) }));
    for (const dot of dots) {
      if (dot.state === 'none') p.circle(dot.xy[0], dot.xy[1], 2.3, { fill: look.inkSoft, fillOpacity: 0.55 });
    }
    for (const dot of dots) {
      if (dot.state === 'wishlist') p.circle(dot.xy[0], dot.xy[1], 4, { fill: look.paper, stroke: look.wishLine, strokeWidth: 1.6 });
      if (dot.state === 'visited') p.circle(dot.xy[0], dot.xy[1], 4.8, { fill: look.accent, stroke: look.paper, strokeWidth: 1.3 });
      if (dot.state !== 'none') taken.push({ x: dot.xy[0] - 6, y: dot.xy[1] - 6, w: 12, h: 12 });
    }
    if (settings.showLabels) {
      const spec: TextSpec = { font: look.fonts.bodyBold, size: 13, fill: look.ink };
      for (const dot of dots) {
        if (dot.state !== 'visited') continue;
        const w = p.measure(dot.feature.name, spec);
        const [x, y] = dot.xy;
        const candidates: [number, number][] = [
          [x + 9, y + 4.5],
          [x - 9 - w, y + 4.5],
          [x - w / 2, y - 10],
          [x - w / 2, y + 19],
          [x + 7, y - 7],
          [x - 7 - w, y - 7],
          [x + 7, y + 16],
          [x - 7 - w, y + 16],
        ];
        for (const [tx, ty] of candidates) {
          const r: Rect = { x: tx - 2, y: ty - 12, w: w + 4, h: 16 };
          if (r.x < box.x + 2 || r.x + r.w > box.x + box.w - 2 || r.y < box.y + 2 || r.y + r.h > box.y + box.h - 2 || hits(r)) continue;
          // A thin paper-coloured edge keeps the name readable over coastlines.
          taken.push(r);
          p.text(dot.feature.name, tx, ty, spec);
          break;
        }
      }
    }
  }

  return { scale: s, at, box };
}

// ---------------------------------------------------------------------------------------------
// Achievement seal
// ---------------------------------------------------------------------------------------------

function drawSeal(c: Ctx, placed: PlacedMap): void {
  const { p, look, settings, achievements, def } = c;
  const badge = achievements.find((a) => a.id === settings.badge && a.earned);
  if (!badge) return;
  const r = 62;
  const [cx, cy] = claimCorner(c, placed, r);
  p.group({ transform: rotate(-9, cx, cy) }, () => {
    p.circle(cx, cy, r, { fill: look.paper, stroke: look.sealInk, strokeWidth: 1.6 });
    p.circle(cx, cy, r - 5, { stroke: look.sealInk, strokeWidth: 0.7 });
    p.circle(cx, cy, r - 25, { stroke: look.sealInk, strokeWidth: 0.7 });
    const ring: TextSpec = { font: look.fonts.bodyBold, size: 10.5, fill: look.sealInk, tracking: 190, upper: true };
    // A long name is set a little smaller, so it stays clear of the place name at the bottom.
    const span = p.arcAngle(badge.name, r - 19.5, ring);
    const nameSpec = span > 205 ? { ...ring, size: (ring.size * 205) / span } : ring;
    const nameSpan = Math.min(span, 205);
    p.arcText(badge.name, cx, cy, r - 19.5, 0, nameSpec);
    p.arcText(def.place === 'World' ? 'The world' : def.place, cx, cy, r - 11, 180, ring, true);
    // A four-point star, the mapmaker's mark for a place worth finding.
    const k = r - 32;
    const q = k * 0.22;
    p.path(
      `M${cx} ${cy - k}L${cx + q} ${cy - q}L${cx + k} ${cy}L${cx + q} ${cy + q}L${cx} ${cy + k}L${cx - q} ${cy + q}L${cx - k} ${cy}L${cx - q} ${cy - q}Z`,
      { fill: look.sealInk },
    );
    // Two dots separate the name from the place, where the name leaves room for them.
    if (nameSpan < 150) p.path(circlePath(cx - (r - 15), cy, 1.5) + circlePath(cx + (r - 15), cy, 1.5), { fill: look.sealInk });
  });
}
