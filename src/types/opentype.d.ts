/** The small part of opentype.js that the poster engine uses. */
declare module 'opentype.js' {
  export interface RenderOptions {
    kerning?: boolean;
    /** Extra space between letters, in 1/1000 em. */
    tracking?: number;
    letterSpacing?: number;
  }
  export interface Path {
    toPathData(decimalPlaces?: number): string;
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
  }
  export interface Glyph {
    index: number;
    advanceWidth: number;
    getPath(x: number, y: number, fontSize: number): Path;
  }
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    tables: Record<string, any>;
    charToGlyphIndex(char: string): number;
    charToGlyph(char: string): Glyph;
    getPath(text: string, x: number, y: number, fontSize: number, options?: RenderOptions): Path;
    getAdvanceWidth(text: string, fontSize: number, options?: RenderOptions): number;
    getKerningValue(left: Glyph, right: Glyph): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
  const opentype: { parse: typeof parse };
  export default opentype;
}
