import type { Font } from 'opentype.js';
import { covers, CSS_FALLBACK, type FontKey, type FontSet } from './fonts';
import {
  circlePath,
  linePath,
  multiply,
  rectPath,
  rotate,
  translate,
  type GroupNode,
  type ImageNode,
  type Matrix,
  type PathNode,
  type SceneNode,
} from './scene';

export interface TextSpec {
  font: FontKey;
  size: number;
  fill: string;
  /** Letter spacing in 1/1000 em. */
  tracking?: number;
  anchor?: 'start' | 'middle' | 'end';
  upper?: boolean;
  opacity?: number;
}

export interface ShapeStyle {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  dash?: number[];
  lineCap?: PathNode['lineCap'];
  lineJoin?: PathNode['lineJoin'];
  transform?: Matrix;
}

/**
 * Draws text in a system font when the bundled fonts lack a glyph (Bengali, Chinese, Arabic,
 * emoji…). Supplied by the browser build; absent in Node, where unsupported characters are dropped.
 */
export type RasterText = (
  text: string,
  css: { family: string; weight: number; style: string },
  size: number,
  fill: string,
  trackingEm: number,
) => { href: string; width: number; ascent: number; descent: number; pixelWidth: number; pixelHeight: number; rgba?: Uint8ClampedArray } | null;

/** Removes the last whole character, so a cut never leaves half an emoji behind. */
function dropLast(text: string): string {
  return [...text].slice(0, -1).join('');
}

/**
 * Collects scene nodes. All text passes through here, where it is measured, wrapped and turned
 * into outlines with the same font data, so the preview, the PNG and the PDF agree to the unit.
 */
export class Painter {
  nodes: SceneNode[] = [];
  private stack: SceneNode[][] = [];

  constructor(
    private fonts: FontSet,
    private raster?: RasterText,
  ) {}

  // ------------------------------------------------------------- structure

  /** Everything drawn inside `draw` is transformed and, optionally, clipped. */
  group(options: { transform?: Matrix; clip?: string }, draw: () => void): void {
    const node: GroupNode = { type: 'group', transform: options.transform, clip: options.clip, children: [] };
    this.nodes.push(node);
    this.stack.push(this.nodes);
    this.nodes = node.children;
    try {
      draw();
    } finally {
      this.nodes = this.stack.pop()!;
    }
  }

  // ---------------------------------------------------------------- shapes

  path(d: string, style: ShapeStyle): void {
    if (!d) return;
    this.nodes.push({ type: 'path', d, ...style });
  }

  rect(x: number, y: number, w: number, h: number, style: ShapeStyle): void {
    this.path(rectPath(x, y, w, h), style);
  }

  circle(cx: number, cy: number, r: number, style: ShapeStyle): void {
    this.path(circlePath(cx, cy, r), style);
  }

  line(x1: number, y1: number, x2: number, y2: number, style: ShapeStyle): void {
    this.path(linePath(x1, y1, x2, y2), { lineCap: 'butt', ...style });
  }

  // ------------------------------------------------------------------ text

  private font(key: FontKey): Font {
    const font = this.fonts.get(key);
    if (!font) throw new Error(`Font "${key}" was not loaded for this poster.`);
    return font;
  }

  private prepare(text: string, spec: TextSpec): string {
    const clean = text.normalize('NFC');
    return spec.upper ? clean.toUpperCase() : clean;
  }

  /** The font that will actually draw this text: the requested face, then Manrope, else null. */
  private resolve(text: string, spec: TextSpec): { key: FontKey; font: Font } | null {
    const wanted = this.font(spec.font);
    if (covers(wanted, text)) return { key: spec.font, font: wanted };
    const weight = spec.font === 'manrope-300' ? 'manrope-300' : spec.font === 'manrope-700' ? 'manrope-700' : 'manrope-500';
    const sans = this.fonts.get(weight) ?? this.fonts.get('manrope-500');
    if (sans && covers(sans, text)) return { key: weight, font: sans };
    return null;
  }

  measure(text: string, spec: TextSpec): number {
    const value = this.prepare(text, spec);
    if (!value) return 0;
    const resolved = this.resolve(value, spec);
    const tracking = spec.tracking ?? 0;
    if (resolved) {
      const width = resolved.font.getAdvanceWidth(value, spec.size, { kerning: true, tracking });
      // opentype adds tracking after every glyph; the space after the last one is not visible.
      return width - (tracking / 1000) * spec.size;
    }
    const image = this.raster?.(value, CSS_FALLBACK[spec.font], spec.size, spec.fill, tracking / 1000);
    if (image) return image.width;
    return this.measure(this.strip(value, spec), spec);
  }

  /** Removes characters no bundled font can draw. Only used where system fonts are unavailable. */
  private strip(text: string, spec: TextSpec): string {
    const font = this.fonts.get('manrope-500') ?? this.font(spec.font);
    const kept = [...text].filter((ch) => ch === ' ' || font.charToGlyphIndex(ch) !== 0).join('');
    return kept === text ? '' : kept;
  }

  /**
   * Draws one line of text with its baseline at y. Returns the width drawn.
   * `transform` is applied around the origin after positioning (use rotate(deg, x, y)).
   */
  text(text: string, x: number, y: number, spec: TextSpec, transform?: Matrix): number {
    const value = this.prepare(text, spec);
    if (!value.trim()) return 0;
    const resolved = this.resolve(value, spec);
    const tracking = spec.tracking ?? 0;
    const anchor = spec.anchor ?? 'start';

    if (!resolved) {
      const image = this.raster?.(value, CSS_FALLBACK[spec.font], spec.size, spec.fill, tracking / 1000);
      if (!image) {
        const stripped = this.strip(value, spec);
        return stripped ? this.text(stripped, x, y, spec, transform) : 0;
      }
      const left = anchor === 'middle' ? x - image.width / 2 : anchor === 'end' ? x - image.width : x;
      const node: ImageNode = {
        type: 'image',
        x: left,
        y: y - image.ascent,
        width: image.width,
        height: image.ascent + image.descent,
        pixelWidth: image.pixelWidth,
        pixelHeight: image.pixelHeight,
        href: image.href,
        rgba: image.rgba,
      };
      if (transform) this.nodes.push({ type: 'group', transform, children: [node] });
      else this.nodes.push(node);
      return image.width;
    }

    const width =
      resolved.font.getAdvanceWidth(value, spec.size, { kerning: true, tracking }) - (tracking / 1000) * spec.size;
    const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const d = resolved.font.getPath(value, left, y, spec.size, { kerning: true, tracking }).toPathData(2);
    if (d) this.nodes.push({ type: 'path', d, fill: spec.fill, fillOpacity: spec.opacity, transform });
    return width;
  }

  /** Shrinks the type until the text fits the width, down to a floor. */
  fit(text: string, spec: TextSpec, maxWidth: number, minSize: number): TextSpec {
    const width = this.measure(text, spec);
    if (width <= maxWidth) return spec;
    const size = Math.max(minSize, Math.floor(spec.size * (maxWidth / width) * 100) / 100);
    return { ...spec, size };
  }

  /** Breaks text into lines no wider than maxWidth. The last allowed line ends in an ellipsis. */
  wrap(text: string, spec: TextSpec, maxWidth: number, maxLines = Infinity): string[] {
    const words = this.prepare(text, { ...spec, upper: false }).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const candidate = line ? `${line} ${words[i]}` : words[i];
      if (!line || this.measure(candidate, spec) <= maxWidth) {
        line = candidate;
        continue;
      }
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && line) lines.push(line);
    else if (lines.length === maxLines && line && lines[maxLines - 1] !== line) {
      let last = lines[maxLines - 1];
      while (last && this.measure(`${last}…`, spec) > maxWidth) last = dropLast(last).trimEnd();
      lines[maxLines - 1] = `${last}…`;
    }
    // A single word wider than the line is cut rather than left to overflow.
    return lines.map((l) => {
      if (this.measure(l, spec) <= maxWidth) return l;
      let cut = l;
      while ([...cut].length > 1 && this.measure(`${cut}…`, spec) > maxWidth) cut = dropLast(cut);
      return `${cut}…`;
    });
  }

  /**
   * One line shrunk to fit the width. If it is still too wide at the smallest size allowed, it is
   * wrapped onto up to `maxLines` lines instead, so text never runs off the page.
   */
  fitLines(text: string, spec: TextSpec, maxWidth: number, minSize: number, maxLines = 2): { spec: TextSpec; lines: string[] } {
    if (!text.trim()) return { spec, lines: [] };
    const fitted = this.fit(text, spec, maxWidth, minSize);
    if (this.measure(text, fitted) <= maxWidth) return { spec: fitted, lines: [text] };
    return { spec: fitted, lines: this.wrap(text, fitted, maxWidth, maxLines) };
  }

  /** The glyphs of a line of text and how far each one advances, for setting it on a curve. */
  private arcGlyphs(text: string, spec: TextSpec) {
    const value = this.prepare(text, spec);
    const resolved = value ? this.resolve(value, spec) : null;
    if (!resolved) return null;
    const { font } = resolved;
    const scale = spec.size / font.unitsPerEm;
    const tracking = ((spec.tracking ?? 0) / 1000) * spec.size;
    const glyphs = [...value].map((ch) => font.charToGlyph(ch));
    const advances = glyphs.map((g, i) => {
      const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0;
      return (g.advanceWidth + kern) * scale + (i < glyphs.length - 1 ? tracking : 0);
    });
    return { font, glyphs, advances, total: advances.reduce((a, b) => a + b, 0) };
  }

  /** How much of a circle, in degrees, a line of text would cover at this radius. */
  arcAngle(text: string, radius: number, spec: TextSpec): number {
    const set = this.arcGlyphs(text, spec);
    return set ? (set.total / radius) * (180 / Math.PI) : 0;
  }

  /**
   * Sets text along a circle, centred on `midAngle` (degrees, 0 = top, clockwise). With
   * `inside` false the letters stand on the outside of the circle (the top of a seal); with it
   * true they hang inside and read left to right along the bottom.
   */
  arcText(text: string, cx: number, cy: number, radius: number, midAngle: number, spec: TextSpec, inside = false): void {
    const set = this.arcGlyphs(text, spec);
    if (!set) return;
    const { font, glyphs, advances, total } = set;
    const scale = spec.size / font.unitsPerEm;
    const direction = inside ? -1 : 1;
    let offset = -total / 2;
    glyphs.forEach((glyph, i) => {
      const centre = offset + (glyph.advanceWidth * scale) / 2;
      const angle = midAngle + direction * (centre / radius) * (180 / Math.PI);
      const d = glyph.getPath((-glyph.advanceWidth * scale) / 2, 0, spec.size).toPathData(2);
      if (d) {
        // Stand the glyph on the top (or hang it from the bottom) of the circle, then swing it round.
        const matrix = inside
          ? multiply(rotate(angle - 180, cx, cy), translate(cx, cy + radius))
          : multiply(rotate(angle, cx, cy), translate(cx, cy - radius));
        this.nodes.push({ type: 'path', d, fill: spec.fill, fillOpacity: spec.opacity, transform: matrix });
      }
      offset += advances[i];
    });
  }
}
