/**
 * A printed sheet: lines, boxes and text at known positions on one page, with two ways out.
 *
 *  - `sheetToPdf` writes a small vector PDF. Each letter shape is stored once and placed wherever
 *    it is used, so a page of two hundred names is tens of kilobytes rather than most of a
 *    megabyte, and still needs no fonts on the printer's side.
 *  - `sheetToScene` turns the same sheet into a poster scene, for a picture of it.
 *
 * The posters do not use this: a poster has a few dozen words and a map. A checklist is the
 * opposite, nearly all text, which is what makes storing each letter once worth doing.
 */
import { deflateSync } from 'node:zlib';
import type { Font, Glyph } from 'opentype.js';
import type { FontKey, FontSet } from '../poster/fonts';
import { circlePath, linePath, parsePath, rectPath, type Scene, type SceneNode } from '../poster/scene';

export interface TextStyle {
  font: FontKey;
  size: number;
  fill: string;
  /** Letter spacing in 1/1000 em. */
  tracking?: number;
  anchor?: 'start' | 'end';
  upper?: boolean;
}

export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

interface PlacedGlyph {
  glyph: Glyph;
  /** Distance to the next letter's origin, in font units, with kerning and tracking included. */
  advance: number;
}

export type SheetOp =
  | ({ type: 'shape'; d: string } & ShapeStyle)
  | { type: 'text'; font: FontKey; size: number; fill: string; x: number; y: number; glyphs: PlacedGlyph[] };

export interface Sheet {
  width: number;
  height: number;
  background: string;
  ops: SheetOp[];
}

/** Draws on a sheet, and measures with the same numbers it draws with. */
export class Pen {
  ops: SheetOp[] = [];

  constructor(private fonts: FontSet) {}

  private font(key: FontKey): Font {
    const font = this.fonts.get(key);
    if (!font) throw new Error(`Font "${key}" was not loaded for this sheet.`);
    return font;
  }

  /** The letters of a line with the space each takes. Characters the font lacks are left out. */
  private set(text: string, style: TextStyle): { glyphs: PlacedGlyph[]; width: number } {
    const font = this.font(style.font);
    const value = style.upper ? text.normalize('NFC').toUpperCase() : text.normalize('NFC');
    const found = [...value]
      .map((ch) => (ch === ' ' ? ' ' : ch))
      .filter((ch) => ch === ' ' || font.charToGlyphIndex(ch) !== 0)
      .map((ch) => font.charToGlyph(ch));
    const extra = ((style.tracking ?? 0) / 1000) * font.unitsPerEm;
    const glyphs = found.map((glyph, index) => {
      const next = found[index + 1];
      return { glyph, advance: glyph.advanceWidth + (next ? font.getKerningValue(glyph, next) + extra : 0) };
    });
    const units = glyphs.reduce((sum, placed) => sum + placed.advance, 0);
    return { glyphs, width: (units / font.unitsPerEm) * style.size };
  }

  measure(text: string, style: TextStyle): number {
    return this.set(text, style).width;
  }

  /** One line of text with its baseline at y. Returns the width drawn. */
  text(text: string, x: number, y: number, style: TextStyle): number {
    const { glyphs, width } = this.set(text, style);
    if (!glyphs.length) return 0;
    this.ops.push({ type: 'text', font: style.font, size: style.size, fill: style.fill, x: style.anchor === 'end' ? x - width : x, y, glyphs });
    return width;
  }

  /** The style with its size reduced until the text fits, down to a floor. */
  fit(text: string, style: TextStyle, maxWidth: number, minSize: number): TextStyle {
    const width = this.measure(text, style);
    if (width <= maxWidth) return style;
    return { ...style, size: Math.max(minSize, Math.floor(style.size * (maxWidth / width) * 100) / 100) };
  }

  /** Breaks text at spaces into lines no wider than maxWidth. Anything past the last line allowed stays on it. */
  wrap(text: string, style: TextStyle, maxWidth: number, maxLines = Infinity): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || this.measure(candidate, style) <= maxWidth || lines.length === maxLines - 1) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  path(d: string, style: ShapeStyle): void {
    if (d) this.ops.push({ type: 'shape', d, ...style });
  }

  rect(x: number, y: number, w: number, h: number, style: ShapeStyle): void {
    this.path(rectPath(x, y, w, h), style);
  }

  circle(cx: number, cy: number, r: number, style: ShapeStyle): void {
    this.path(circlePath(cx, cy, r), style);
  }

  line(x1: number, y1: number, x2: number, y2: number, style: ShapeStyle): void {
    this.path(linePath(x1, y1, x2, y2), style);
  }
}

// -------------------------------------------------------------------- scene

/** The sheet as a poster scene, every letter an outline, for rendering a picture of it. */
export function sheetToScene(sheet: Sheet, fonts: FontSet, description: string): Scene {
  const nodes: SceneNode[] = [{ type: 'path', d: rectPath(0, 0, sheet.width, sheet.height), fill: sheet.background }];
  for (const op of sheet.ops) {
    if (op.type === 'shape') {
      nodes.push({ type: 'path', d: op.d, fill: op.fill, stroke: op.stroke, strokeWidth: op.strokeWidth, lineCap: 'butt' });
      continue;
    }
    const font = fonts.get(op.font)!;
    const k = op.size / font.unitsPerEm;
    let at = op.x;
    let d = '';
    for (const { glyph, advance } of op.glyphs) {
      d += glyph.getPath(at, op.y, op.size).toPathData(2);
      at += advance * k;
    }
    if (d) nodes.push({ type: 'path', d, fill: op.fill });
  }
  return { width: sheet.width, height: sheet.height, bleed: 0, background: sheet.background, nodes, description };
}

// ---------------------------------------------------------------------- pdf

export interface SheetPdfOptions {
  title: string;
  author?: string;
  subject?: string;
  /** A fixed date gives the same bytes every time. */
  date: Date;
}

function num(value: number, places = 3): string {
  if (!Number.isFinite(value)) throw new Error('A sheet coordinate was not a finite number.');
  const text = value.toFixed(places);
  return text.includes('.') ? text.replace(/\.?0+$/, '') || '0' : text;
}

function rgb(hex: string): string {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) throw new Error(`Unsupported colour "${hex}". Use #RRGGBB.`);
  return match
    .slice(1)
    .map((channel) => num(parseInt(channel, 16) / 255))
    .join(' ');
}

/** A PDF text string: plain ASCII when possible, otherwise UTF-16BE with a byte-order mark. */
function textString(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return `(${value.replace(/([\\()])/g, '\\$1')})`;
  let hex = 'FEFF';
  for (let i = 0; i < value.length; i++) hex += value.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

function pdfDate(date: Date): string {
  const p = (value: number, length = 2) => String(value).padStart(length, '0');
  return (
    `D:${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

function pathOps(d: string, places: number): string {
  let out = '';
  for (const s of parsePath(d)) {
    if (s.op === 'M') out += `${num(s.x, places)} ${num(s.y, places)} m\n`;
    else if (s.op === 'L') out += `${num(s.x, places)} ${num(s.y, places)} l\n`;
    else if (s.op === 'C') out += `${num(s.x1, places)} ${num(s.y1, places)} ${num(s.x2, places)} ${num(s.y2, places)} ${num(s.x, places)} ${num(s.y, places)} c\n`;
    else out += 'h\n';
  }
  return out;
}

/**
 * Writes the sheet as a one-page PDF 1.4 file.
 *
 * Shapes are drawn directly. Each letter shape is a form (a reusable drawing) in the font's own
 * units, placed with a scale and a position, so the page holds every outline once.
 */
export function sheetToPdf(sheet: Sheet, fonts: FontSet, options: SheetPdfOptions): Uint8Array {
  const { width: W, height: H } = sheet;
  const forms = new Map<string, { name: string; d: string; box: number[] }>();
  const formFor = (key: FontKey, glyph: Glyph): string | null => {
    const id = `${key}/${glyph.index}`;
    const known = forms.get(id);
    if (known) return known.name;
    const font = fonts.get(key)!;
    // The outline at one font unit per unit, y running down the page like everything else here.
    const path = glyph.getPath(0, 0, font.unitsPerEm);
    const d = path.toPathData(1);
    if (!d) return null;
    const b = path.getBoundingBox();
    const name = `G${forms.size + 1}`;
    forms.set(id, { name, d, box: [Math.floor(b.x1) - 2, Math.floor(b.y1) - 2, Math.ceil(b.x2) + 2, Math.ceil(b.y2) + 2] });
    return name;
  };

  // Paper, then everything else in units that run down the page from the top left corner.
  let content = `q\n${rgb(sheet.background)} rg\n0 0 ${num(W)} ${num(H)} re\nf\nQ\nq\n1 0 0 -1 0 ${num(H)} cm\n`;
  for (const op of sheet.ops) {
    if (op.type === 'shape') {
      if (!op.fill && !op.stroke) continue;
      content += 'q\n';
      if (op.fill) content += `${rgb(op.fill)} rg\n`;
      if (op.stroke) content += `${rgb(op.stroke)} RG\n${num(op.strokeWidth ?? 1)} w\n0 j\n0 J\n`;
      content += pathOps(op.d, 3);
      content += op.fill && op.stroke ? 'B\n' : op.fill ? 'f\n' : 'S\n';
      content += 'Q\n';
      continue;
    }
    const font = fonts.get(op.font)!;
    const k = op.size / font.unitsPerEm;
    content += `q\n${rgb(op.fill)} rg\n${num(k, 6)} 0 0 ${num(k, 6)} ${num(op.x)} ${num(op.y)} cm\n`;
    let pending = 0;
    for (const { glyph, advance } of op.glyphs) {
      const name = formFor(op.font, glyph);
      if (name) {
        if (pending) content += `1 0 0 1 ${num(pending, 2)} 0 cm\n`;
        pending = 0;
        content += `/${name} Do\n`;
      }
      pending += advance;
    }
    content += 'Q\n';
  }
  content += 'Q\n';

  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Buffer) => {
    const bytes = typeof data === 'string' ? Buffer.from(data, 'latin1') : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const stream = (id: number, dictionary: string, raw: string) => {
    const packed = deflateSync(Buffer.from(raw, 'latin1'), { level: 9 });
    offsets[id] = length;
    push(`${id} 0 obj\n<< ${dictionary}/Filter /FlateDecode /Length ${packed.length} >>\nstream\n`);
    push(packed);
    push('\nendstream\nendobj\n');
  };

  const list = [...forms.values()];
  const [catalogId, pagesId, pageId, contentId, infoId] = [1, 2, 3, 4, 5];
  const formId = (index: number) => 6 + index;

  push('%PDF-1.4\n');
  push(Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R /Lang (en-CA) >>`);
  object(pagesId, `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  const resources = list.length ? `<< /XObject << ${list.map((form, index) => `/${form.name} ${formId(index)} 0 R`).join(' ')} >> >>` : '<< >>';
  object(pageId, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(W)} ${num(H)}] /Resources ${resources} /Contents ${contentId} 0 R >>`);
  stream(contentId, '', content);
  const date = pdfDate(options.date);
  object(
    infoId,
    `<< /Title ${textString(options.title)} ` +
      (options.author ? `/Author ${textString(options.author)} ` : '') +
      (options.subject ? `/Subject ${textString(options.subject)} ` : '') +
      `/Creator (WorldTripMap) /Producer (WorldTripMap sheet writer) /CreationDate (${date}) /ModDate (${date}) >>`,
  );
  list.forEach((form, index) => {
    stream(formId(index), `/Type /XObject /Subtype /Form /FormType 1 /BBox [${form.box.join(' ')}] /Resources << >> `, `${pathOps(form.d, 1)}f\n`);
  });

  const count = 6 + list.length;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Uint8Array(Buffer.concat(chunks, length));
}
