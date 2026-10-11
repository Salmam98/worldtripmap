import type { Font } from 'opentype.js';

/**
 * Poster fonts. Each face is a subset WOFF stored as text in its own module, so the browser only
 * downloads the faces a poster actually uses, and only when the poster studio opens. The engine
 * converts text to outlines, which is why exports never have missing or substituted fonts.
 */
export type FontKey = 'manrope-300' | 'manrope-500' | 'manrope-700' | 'dmserif-400' | 'dmserif-400i' | 'caveat-600';

const LOADERS: Record<FontKey, () => Promise<{ default: string }>> = {
  'manrope-300': () => import('./fonts/data/manrope-300'),
  'manrope-500': () => import('./fonts/data/manrope-500'),
  'manrope-700': () => import('./fonts/data/manrope-700'),
  'dmserif-400': () => import('./fonts/data/dmserif-400'),
  'dmserif-400i': () => import('./fonts/data/dmserif-400i'),
  'caveat-600': () => import('./fonts/data/caveat-600'),
};

/** What to ask the browser for when a string needs a system font instead (see text.ts). */
export const CSS_FALLBACK: Record<FontKey, { family: string; weight: number; style: string }> = {
  'manrope-300': { family: 'system-ui, sans-serif', weight: 300, style: 'normal' },
  'manrope-500': { family: 'system-ui, sans-serif', weight: 500, style: 'normal' },
  'manrope-700': { family: 'system-ui, sans-serif', weight: 700, style: 'normal' },
  'dmserif-400': { family: 'Georgia, serif', weight: 400, style: 'normal' },
  'dmserif-400i': { family: 'Georgia, serif', weight: 400, style: 'italic' },
  'caveat-600': { family: 'cursive, system-ui', weight: 600, style: 'normal' },
};

export type FontSet = Map<FontKey, Font>;

const cache = new Map<FontKey, Promise<Font>>();

function decode(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function loadFont(key: FontKey): Promise<Font> {
  let pending = cache.get(key);
  if (!pending) {
    pending = Promise.all([import('opentype.js'), LOADERS[key]()]).then(([opentype, data]) => {
      const parse = (opentype as any).parse ?? (opentype as any).default.parse;
      return parse(decode(data.default)) as Font;
    });
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

export async function loadFonts(keys: Iterable<FontKey>): Promise<FontSet> {
  const unique = [...new Set(keys)];
  const fonts = await Promise.all(unique.map(loadFont));
  return new Map(unique.map((key, i) => [key, fonts[i]]));
}

/** True when the font has a glyph for every character in the text. */
export function covers(font: Font, text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code === 0x20 || code === 0xa0) continue;
    if (font.charToGlyphIndex(ch) === 0) return false;
  }
  return true;
}
