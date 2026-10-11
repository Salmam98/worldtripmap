/**
 * Printable checklists: one sheet of paper with a box to tick beside every name.
 *
 * A checklist is laid out with the poster fonts, so it looks like the posters, and written by the
 * sheet writer (sheet.ts), which stores each letter shape once. The type is set as large as the
 * page allows, so the same list fills a Letter page and an A4 page without a second design.
 */
import type { FontKey, FontSet } from '../poster/fonts';
import { Pen, type Sheet, type TextStyle } from './sheet';

export interface ChecklistItem {
  name: string;
  /** A few words set smaller beside or under the name: "Reserve", "World Heritage Site". */
  note?: string;
}

export interface ChecklistSection {
  heading: string;
  items: ChecklistItem[];
}

/** A band of the page with its own columns. A second zone starts under a line across the page. */
export interface ChecklistZone {
  title?: string;
  /** What is left to fill in by hand at the right of the title: "of 42". */
  tally?: string;
  columns: number;
  /** Keep each section in one column where it fits. For short lists; a long one has to break. */
  keepSections?: boolean;
  sections: ChecklistSection[];
}

export interface ChecklistSpec {
  id: string;
  title: string;
  intro: string;
  /** Printed after a blank to write a number in: "of 195". */
  tally: string;
  tallyLabel: string;
  zones: ChecklistZone[];
  footnotes: string[];
  /** Where the list lives on the site, printed in the footer. */
  address: string;
  /** "List checked 11 October 2026". */
  checked: string;
  /** The largest the names may be set, in points. */
  maxSize: number;
}

export type PaperId = 'letter' | 'a4';

export const PAPERS: Record<PaperId, { name: string; widthPt: number; heightPt: number }> = {
  letter: { name: 'Letter', widthPt: 612, heightPt: 792 },
  a4: { name: 'A4', widthPt: 595.28, heightPt: 841.89 },
};

export const CHECKLIST_FONTS: FontKey[] = ['dmserif-400', 'manrope-300', 'manrope-500', 'manrope-700'];

/** Bump when the drawing changes, so files made by the old drawing are known to be out of date. */
const LAYOUT = 'layout-1';

const INK = '#101b2d';
const SOFT = '#4f5b6b';
const FOREST = '#315c4c';
const GOLD = '#a98a4f';
const LINE = '#cfc8b6';
const PAPER = '#ffffff';

const MARGIN = 36;
const MIN_SIZE = 5.5;

/** A short fingerprint of everything a checklist prints. It is written into the PDF, so a test can tell a stale file. */
export function checklistKey(spec: ChecklistSpec): string {
  const text = JSON.stringify([LAYOUT, spec]);
  // FNV-1a, 32 bits, twice with different seeds: plenty to notice a changed name.
  const hash = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  return hash(0x811c9dc5) + hash(0x9747b28c);
}

export const checklistItemCount = (spec: ChecklistSpec): number =>
  spec.zones.reduce((total, zone) => total + zone.sections.reduce((sum, section) => sum + section.items.length, 0), 0);

// ------------------------------------------------------------------ drawing

/**
 * The fonts have no raised "ᵁ" (as in Akami-Uapishkᵁ-KakKasuak), so it is drawn as a small
 * capital U lifted off the baseline, which is what the letter is.
 */
function drawName(p: Pen, text: string, x: number, y: number, spec: TextStyle): number {
  const parts = text.split('ᵁ');
  let at = x;
  parts.forEach((part, index) => {
    if (part) at += p.text(part, at, y, spec);
    if (index < parts.length - 1) {
      at += spec.size * 0.03;
      at += p.text('U', at, y - spec.size * 0.36, { ...spec, size: spec.size * 0.62 }) + spec.size * 0.04;
    }
  });
  return at - x;
}

function nameWidth(p: Pen, text: string, spec: TextStyle): number {
  const raised = text.split('ᵁ').length - 1;
  return p.measure(text.replace(/ᵁ/g, ''), spec) + raised * (p.measure('U', { ...spec, size: spec.size * 0.62 }) + spec.size * 0.07);
}

interface Placed {
  kind: 'heading' | 'item';
  height: number;
  /** For a heading: how much must follow it in the same column. */
  keep?: number;
  draw: (x: number, y: number) => void;
}

interface Metrics {
  size: number;
  lead: number;
  box: number;
  indent: number;
  headingGap: number;
}

function metrics(size: number): Metrics {
  return { size, lead: size * 1.4, box: size * 0.8, indent: size * 0.8 + size * 0.62, headingGap: size * 0.95 };
}

/** Everything in a zone as blocks of known height, for a column of the given width. */
function blocks(p: Pen, zone: ChecklistZone, m: Metrics, width: number, tick: () => void): Placed[] {
  const name: TextStyle = { font: 'manrope-500', size: m.size, fill: INK };
  const note: TextStyle = { font: 'manrope-300', size: m.size * 0.82, fill: SOFT };
  const heading: TextStyle = { font: 'manrope-700', size: m.size * 0.86, fill: FOREST, tracking: 90, upper: true };
  const tally: TextStyle = { font: 'manrope-500', size: m.size * 0.86, fill: SOFT, anchor: 'end' };
  const textWidth = width - m.indent;
  const out: Placed[] = [];

  for (const section of zone.sections) {
    const headingAt = out.length;
    out.push({
      kind: 'heading',
      height: m.lead * 1.12,
      draw: (x, y) => {
        const base = y + m.size * 0.92;
        p.text(section.heading, x, base, p.fit(section.heading, heading, width - m.size * 2.4, m.size * 0.6));
        p.text(String(section.items.length), x + width, base, tally);
        p.line(x, y + m.lead * 0.94, x + width, y + m.lead * 0.94, { stroke: LINE, strokeWidth: 0.5 });
      },
    });

    for (const item of section.items) {
      const lines = p.wrap(item.name, name, textWidth, 2);
      // A single word longer than the column is set a little smaller instead of being cut.
      const widest = Math.max(...lines.map((line) => nameWidth(p, line, name)), 1);
      const fitted: TextStyle = { ...name, size: Math.max(m.size * 0.7, Math.min(m.size, (m.size * textWidth) / widest)) };
      const last = nameWidth(p, lines[lines.length - 1], fitted);
      const noteWidth = item.note ? p.measure(item.note, note) : 0;
      const beside = Boolean(item.note) && lines.length === 1 && last + m.size * 0.55 + noteWidth <= textWidth;
      const under = item.note && !beside ? p.wrap(item.note, note, textWidth, 2) : [];
      const nameStep = m.size * 1.16;
      const noteStep = m.size * 1.02;
      const height = m.lead + (lines.length - 1) * nameStep + under.length * noteStep;
      out.push({
        kind: 'item',
        height,
        draw: (x, y) => {
          const base = y + m.size * 1.0;
          tick();
          p.rect(x + 0.3, base - m.box * 0.9, m.box, m.box, { stroke: INK, strokeWidth: Math.max(0.5, m.size * 0.075), fill: PAPER });
          lines.forEach((line, index) => drawName(p, line, x + m.indent, base + index * nameStep, fitted));
          if (beside) p.text(item.note!, x + m.indent + last + m.size * 0.55, base, note);
          under.forEach((line, index) => p.text(line, x + m.indent, base + (lines.length - 1) * nameStep + (index + 1) * noteStep, note));
        },
      });
    }
    const items = out.slice(headingAt + 1);
    out[headingAt].keep = (zone.keepSections ? items : items.slice(0, 2)).reduce((sum, block) => sum + block.height, 0);
  }
  return out;
}

interface Column {
  placed: { block: Placed; y: number }[];
  height: number;
}

/** Fills columns top to bottom. A heading is never left alone at the foot of a column. */
function fill(list: Placed[], limit: number, m: Metrics): Column[] {
  const columns: Column[] = [{ placed: [], height: 0 }];
  list.forEach((block) => {
    let column = columns[columns.length - 1];
    let gap = block.kind === 'heading' && column.height > 0 ? m.headingGap : 0;
    const keep = block.keep ?? 0;
    if (column.height > 0 && column.height + gap + block.height + keep > limit + 0.01) {
      column = { placed: [], height: 0 };
      columns.push(column);
      gap = 0;
    }
    column.placed.push({ block, y: column.height + gap });
    column.height += gap + block.height;
  });
  return columns;
}

/** The least height at which the zone fits its columns, which also makes the columns even. */
function balance(list: Placed[], count: number, m: Metrics): { columns: Column[]; height: number } {
  const total = list.reduce((sum, block) => sum + block.height + (block.kind === 'heading' ? m.headingGap : 0), 0);
  const tallest = Math.max(...list.map((block) => block.height));
  // No arrangement can be shorter than the content shared evenly, so the search starts there.
  for (let limit = Math.max(tallest, total / count - m.headingGap); limit <= total + 1; limit += 0.5) {
    const columns = fill(list, limit, m);
    if (columns.length <= count) return { columns, height: Math.max(...columns.map((column) => column.height)) };
  }
  const columns = fill(list, total + 1, m);
  return { columns, height: Math.max(...columns.map((column) => column.height)) };
}

export interface ChecklistLayout {
  sheet: Sheet;
  /** One sentence describing the sheet, for a picture of it. */
  description: string;
  /** The size the names were set at, in points. */
  size: number;
  /** Tick boxes drawn. One per item, or something has been dropped. */
  boxes: number;
  /** How far down the page the lists reach, and the line they must stay above. */
  bottom: number;
  limit: number;
}

export function checklistSheet(spec: ChecklistSpec, paper: PaperId, fonts: FontSet): ChecklistLayout {
  const { widthPt: W, heightPt: H } = PAPERS[paper];
  const inner = W - MARGIN * 2;
  const p = new Pen(fonts);
  let boxes = 0;

  // ---------------------------------------------------------------- header
  const top = MARGIN;
  const r = 6.2;
  const mx = MARGIN + r;
  const my = top + r + 0.5;
  p.path(`M${mx} ${my - r}C${mx + r * 0.58} ${my - r} ${mx + r * 0.58} ${my + r} ${mx} ${my + r}Z`, { fill: GOLD });
  p.circle(mx, my, r, { stroke: INK, strokeWidth: 0.9 });
  p.path(
    `M${mx} ${my - r}C${mx - r * 0.58} ${my - r} ${mx - r * 0.58} ${my + r} ${mx} ${my + r}` +
      `M${mx} ${my - r}C${mx + r * 0.58} ${my - r} ${mx + r * 0.58} ${my + r} ${mx} ${my + r}` +
      `M${mx} ${my - r}V${my + r}M${mx - r * 0.9} ${my - 2.3}H${mx + r * 0.9}M${mx - r * 0.9} ${my + 2.3}H${mx + r * 0.9}`,
    { stroke: INK, strokeWidth: 0.7 },
  );
  p.text('WorldTripMap', mx + r + 5, my + 4.2, { font: 'dmserif-400', size: 13, fill: INK });
  p.text('worldtripmap.com', W - MARGIN, my + 3, { font: 'manrope-700', size: 7, fill: FOREST, tracking: 110, anchor: 'end', upper: true });

  // The blank to write a number in, at the right of the title.
  const tallySpec: TextStyle = { font: 'dmserif-400', size: 19, fill: INK, anchor: 'end' };
  const tallyWidth = p.measure(spec.tally, tallySpec);
  const blank = 46;
  const tallyBase = top + 54;
  p.text(spec.tally, W - MARGIN, tallyBase, tallySpec);
  p.line(W - MARGIN - tallyWidth - 7 - blank, tallyBase + 1.5, W - MARGIN - tallyWidth - 7, tallyBase + 1.5, { stroke: INK, strokeWidth: 0.8 });
  p.text(spec.tallyLabel, W - MARGIN, tallyBase - 24, { font: 'manrope-700', size: 6.6, fill: SOFT, tracking: 110, anchor: 'end', upper: true });

  const titleWidth = inner - tallyWidth - blank - 30;
  const title = p.fit(spec.title, { font: 'dmserif-400', size: 27, fill: INK, tracking: -4 }, titleWidth, 16);
  p.text(spec.title, MARGIN, top + 46, title);
  const intro: TextStyle = { font: 'manrope-500', size: 8.6, fill: SOFT };
  const introLines = p.wrap(spec.intro, intro, titleWidth, 2);
  introLines.forEach((line, index) => p.text(line, MARGIN, top + 61 + index * 11.2, intro));
  const ruleY = top + 61 + (introLines.length - 1) * 11.2 + 10;
  p.line(MARGIN, ruleY, W - MARGIN, ruleY, { stroke: GOLD, strokeWidth: 1 });
  const bodyTop = ruleY + 13;

  // ---------------------------------------------------------------- footer
  const foot: TextStyle = { font: 'manrope-500', size: 6.7, fill: SOFT };
  const footLines = spec.footnotes.flatMap((line) => p.wrap(line, foot, inner, 3));
  const footStep = 9;
  const lastBase = H - MARGIN;
  const footTop = lastBase - footLines.length * footStep - 16;
  p.line(MARGIN, footTop, W - MARGIN, footTop, { stroke: LINE, strokeWidth: 0.6 });
  footLines.forEach((line, index) => p.text(line, MARGIN, footTop + 11 + index * footStep, foot));
  p.text(spec.address, MARGIN, lastBase, { font: 'manrope-700', size: 6.9, fill: INK });
  p.text(spec.checked, W - MARGIN, lastBase, { ...foot, anchor: 'end' });
  const limit = footTop - 9;

  // ------------------------------------------------------------------ body
  const zoneTitle = (zone: ChecklistZone) => (zone.title ? 30 : 0);
  const gutter = (zone: ChecklistZone) => (zone.columns >= 4 ? 13 : 24);
  const columnWidth = (zone: ChecklistZone) => (inner - gutter(zone) * (zone.columns - 1)) / zone.columns;

  const arrange = (size: number) => {
    const m = metrics(size);
    const zones = spec.zones.map((zone) => ({ zone, m, ...balance(blocks(p, zone, m, columnWidth(zone), () => boxes++), zone.columns, m) }));
    const height = zones.reduce((sum, z) => sum + zoneTitle(z.zone) + z.height, 0);
    return { zones, height };
  };

  let size = spec.maxSize;
  let plan = arrange(size);
  while (plan.height > limit - bodyTop && size > MIN_SIZE) {
    size = Math.round((size - 0.1) * 10) / 10;
    plan = arrange(size);
  }
  if (plan.height > limit - bodyTop) throw new Error(`"${spec.id}" does not fit on ${PAPERS[paper].name} even at ${MIN_SIZE} pt.`);

  let y = bodyTop;
  let bottom = bodyTop;
  for (const { zone, columns, height } of plan.zones) {
    if (zone.title) {
      p.line(MARGIN, y + 9, W - MARGIN, y + 9, { stroke: LINE, strokeWidth: 0.6 });
      p.text(zone.title, MARGIN, y + 22, { font: 'manrope-700', size: 8.4, fill: INK });
      if (zone.tally) {
        const spec2: TextStyle = { font: 'manrope-700', size: 8.4, fill: INK, anchor: 'end' };
        const width = p.measure(zone.tally, spec2);
        p.text(zone.tally, W - MARGIN, y + 22, spec2);
        p.line(W - MARGIN - width - 5 - 30, y + 23.2, W - MARGIN - width - 5, y + 23.2, { stroke: INK, strokeWidth: 0.6 });
      }
      y += zoneTitle(zone);
    }
    columns.forEach((column, index) => {
      const x = MARGIN + index * (columnWidth(zone) + gutter(zone));
      for (const { block, y: offset } of column.placed) block.draw(x, y + offset);
    });
    y += height;
    bottom = y;
  }

  const sheet: Sheet = { width: W, height: H, background: PAPER, ops: p.ops };
  return { sheet, description: `${spec.title}: a checklist of ${checklistItemCount(spec)} places to tick off by hand.`, size, boxes, bottom, limit };
}
