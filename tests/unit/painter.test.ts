import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts, type FontSet } from '../../src/lib/poster/fonts';
import { Painter, type TextSpec } from '../../src/lib/poster/painter';
import { IDENTITY } from '../../src/lib/poster/scene';
import { pathBox } from '../helpers/scene';

let fonts: FontSet;
beforeAll(async () => {
  fonts = await loadFonts(['manrope-500', 'manrope-700', 'dmserif-400', 'caveat-600']);
});

const body: TextSpec = { font: 'manrope-500', size: 20, fill: '#101B2D' };

const SAMPLES = [
  'My Canada Journey',
  'Places I’ve Explored',
  'An unreasonably long caption that goes on and on about every single road, ferry, train and gravel track along the way.',
  'Wolfeschlegelsteinhausenbergerdorffvoralternwarengewissenhaftschaferswessenschafewarenwohlgepflege',
  'Zoë & Li — São Tomé, Türkiye, Côte d’Ivoire',
  'a',
  'one two three four five six seven eight nine ten eleven twelve',
];

describe('measuring and drawing text', () => {
  it('draws text exactly as wide as it measures', () => {
    for (const font of ['manrope-500', 'dmserif-400', 'caveat-600'] as const) {
      const p = new Painter(fonts);
      const spec: TextSpec = { font, size: 40, fill: '#000000' };
      const measured = p.measure('Hamburgefonstiv', spec);
      const drawn = p.text('Hamburgefonstiv', 100, 100, spec);
      expect(drawn).toBeCloseTo(measured, 6);
      const node = p.nodes[0];
      expect(node.type).toBe('path');
      const box = pathBox((node as { d: string }).d, IDENTITY);
      // The ink sits inside the advance width, give or take the side bearings of the end letters.
      expect(box[0]).toBeGreaterThan(100 - 6);
      expect(box[2]).toBeLessThan(100 + measured + 6);
    }
  });

  it('honours the anchor', () => {
    const p = new Painter(fonts);
    const w = p.measure('Canada', body);
    p.text('Canada', 500, 50, { ...body, anchor: 'start' });
    p.text('Canada', 500, 50, { ...body, anchor: 'middle' });
    p.text('Canada', 500, 50, { ...body, anchor: 'end' });
    const [start, middle, end] = p.nodes.map((n) => pathBox((n as { d: string }).d, IDENTITY));
    expect(start[0]).toBeGreaterThanOrEqual(500 - 2);
    expect((middle[0] + middle[2]) / 2).toBeCloseTo(500, 0);
    expect(end[2]).toBeLessThanOrEqual(500 + 2);
    expect(end[0]).toBeCloseTo(500 - w, -1);
  });

  it('draws nothing for empty or blank text', () => {
    const p = new Painter(fonts);
    expect(p.text('', 0, 0, body)).toBe(0);
    expect(p.text('   ', 0, 0, body)).toBe(0);
    expect(p.nodes).toHaveLength(0);
  });

  it('uses the sans-serif when the chosen face lacks a letter', () => {
    const p = new Painter(fonts);
    // The handwriting face has no Vietnamese letters; the text still appears, as outlines.
    expect(p.text('Việt Nam', 0, 50, { font: 'caveat-600', size: 30, fill: '#000000' })).toBeGreaterThan(40);
    expect(p.nodes[0].type).toBe('path');
  });

  it('refuses to guess when a font was not loaded', () => {
    const p = new Painter(fonts);
    expect(() => p.text('x', 0, 0, { font: 'manrope-300', size: 20, fill: '#000000' })).toThrow(/not loaded/);
  });
});

describe('fitting text into a width', () => {
  it('never returns a line wider than the width, whatever the text', () => {
    const p = new Painter(fonts);
    for (const text of SAMPLES) {
      for (const width of [60, 120, 240, 400, 900]) {
        for (const maxLines of [1, 2, 3]) {
          const lines = p.wrap(text, body, width, maxLines);
          expect(lines.length, `${text} @${width}`).toBeLessThanOrEqual(maxLines);
          for (const line of lines) expect(p.measure(line, body), `"${line}" @${width}`).toBeLessThanOrEqual(width + 0.01);
        }
      }
    }
  });

  it('keeps all the words when there is room, and marks a cut with an ellipsis when there is not', () => {
    const p = new Painter(fonts);
    const text = 'one two three four five six seven eight nine ten eleven twelve';
    expect(p.wrap(text, body, 400, 4).join(' ')).toBe(text);
    const cut = p.wrap(text, body, 160, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1].endsWith('…')).toBe(true);
    expect(text.startsWith(cut[0])).toBe(true);
  });

  it('cuts by whole characters, so an emoji is never split in half', () => {
    const p = new Painter(fonts);
    const lines = p.wrap('🌍'.repeat(40), body, 80, 1);
    expect(lines.join('')).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });

  it('shrinks a line to fit before it wraps it', () => {
    const p = new Painter(fonts);
    const text = 'Seven down, six to go';
    const wide = p.fitLines(text, { ...body, size: 27 }, 600, 17);
    expect(wide).toMatchObject({ lines: [text], spec: { size: 27 } });
    const snug = p.fitLines(text, { ...body, size: 27 }, 220, 17);
    expect(snug.lines).toEqual([text]);
    expect(snug.spec.size).toBeLessThan(27);
    expect(snug.spec.size).toBeGreaterThanOrEqual(17);
    const tight = p.fitLines(text, { ...body, size: 27 }, 110, 17);
    expect(tight.spec.size).toBe(17);
    expect(tight.lines).toHaveLength(2);
    for (const line of tight.lines) expect(p.measure(line, tight.spec)).toBeLessThanOrEqual(110.01);
  });

  it('returns no lines for empty text', () => {
    const p = new Painter(fonts);
    expect(p.fitLines('  ', body, 100, 10).lines).toEqual([]);
  });
});

describe('text on a circle', () => {
  const ring: TextSpec = { font: 'manrope-700', size: 10, fill: '#000000', tracking: 200, upper: true };

  it('covers an angle that grows with the text and with the type size', () => {
    const p = new Painter(fonts);
    const short = p.arcAngle('Canada', 40, ring);
    const long = p.arcAngle('Coast to Coast to Coast', 40, ring);
    expect(short).toBeGreaterThan(20);
    expect(long).toBeGreaterThan(short * 2.5);
    expect(p.arcAngle('Canada', 40, { ...ring, size: 20 })).toBeCloseTo(short * 2, 6);
    expect(p.arcAngle('Canada', 80, ring)).toBeCloseTo(short / 2, 6);
    expect(p.arcAngle('', 40, ring)).toBe(0);
  });

  it('places one outline per visible letter, all at the same distance from the centre', () => {
    const p = new Painter(fonts);
    p.arcText('North', 200, 200, 50, 0, ring);
    expect(p.nodes).toHaveLength(5);
    for (const node of p.nodes) {
      const box = pathBox((node as { d: string }).d, (node as { transform: [number, number, number, number, number, number] }).transform);
      const cx = (box[0] + box[2]) / 2;
      const cy = (box[1] + box[3]) / 2;
      const distance = Math.hypot(cx - 200, cy - 200);
      expect(distance).toBeGreaterThan(48);
      expect(distance).toBeLessThan(60);
      expect(cy).toBeLessThan(200);
    }
  });
});
