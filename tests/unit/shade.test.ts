import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAP_COLOURS, TONE_RAMP, toneFor } from '../../src/islands/map/tones';
import { contrast, inkOn, mixHex, SHADE_FLOOR, SHADE_STOPS, shadeAmount, shadeHex } from '../../src/lib/maps/shade';

/**
 * The scale that colours a marked province by how much of it has been seen: lightest when none of
 * its places are ticked, the full colour when all of them are.
 */

/** Hue (degrees) and saturation (0 to 1) of a colour, the everyday HSL way. */
function hueAndSaturation(hex: string): [number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return [0, 0];
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const light = (max + min) / 2;
  return [(hue * 60 + 360) % 360, d / (1 - Math.abs(2 * light - 1))];
}

describe('the scale', () => {
  it('runs from a light tone for nothing ticked to the full colour for everything', () => {
    expect(shadeAmount(0)).toBe(SHADE_FLOOR);
    expect(shadeAmount(1)).toBe(1);
    expect(shadeHex('#e3ddce', '#315C4C', 1)).toBe('#315c4c');
    // The lightest tone sits between unmarked land and the full colour, clear of both.
    const lightest = shadeHex('#e3ddce', '#315c4c', 0);
    expect(contrast(lightest, '#e3ddce')).toBeGreaterThanOrEqual(1.5);
    expect(contrast(lightest, '#315c4c')).toBeGreaterThan(2.5);
  });

  it('is a tint of the full colour: the hue holds and the light end is not grey', () => {
    // Forest on the site's map, gold on the dark Midnight Atlas poster, cobalt on white paper.
    for (const [land, full] of [
      ['#e3ddce', '#315c4c'],
      ['#22334f', '#c6a66b'],
      ['#e8e4da', '#1f4e8c'],
    ]) {
      const [hue] = hueAndSaturation(full);
      for (const share of [0, 0.03, 0.16, 0.5, 0.9]) {
        const [toneHue, saturation] = hueAndSaturation(shadeHex(land, full, share));
        const apart = Math.min(Math.abs(toneHue - hue), 360 - Math.abs(toneHue - hue));
        expect(apart, `${full} at ${share}: hue`).toBeLessThan(14);
        expect(saturation, `${full} at ${share}: strength`).toBeGreaterThan(0.12);
      }
    }
  });

  it('gives a dim tone on dark paper and a pale one on light paper, both for a small share', () => {
    // On the navy poster a small share is a darker gold than the full one; on the cream map it is a lighter green.
    expect(contrast(shadeHex('#22334f', '#c6a66b', 0), '#000000')).toBeLessThan(contrast('#c6a66b', '#000000'));
    expect(contrast(shadeHex('#e3ddce', '#315c4c', 0), '#000000')).toBeGreaterThan(contrast('#315c4c', '#000000'));
  });

  it('gets deeper with every place ticked, never lighter', () => {
    let last = -1;
    for (let ticked = 0; ticked <= 31; ticked++) {
      const amount = shadeAmount(ticked / 31);
      expect(amount, `${ticked} of 31`).toBeGreaterThan(last);
      last = amount;
    }
  });

  it('shows the first place ticked, even in the province with the longest list', () => {
    // One of Ontario's 31 places must move the colour by a step people can see beside the lightest tone.
    const none = shadeHex(MAP_COLOURS.land, MAP_COLOURS.visited, 0);
    const one = shadeHex(MAP_COLOURS.land, MAP_COLOURS.visited, 1 / 31);
    expect(contrast(none, one)).toBeGreaterThan(1.15);
  });

  it('treats a share outside 0 to 1, or not a number, as the nearest end', () => {
    expect(shadeAmount(-0.5)).toBe(SHADE_FLOOR);
    expect(shadeAmount(7)).toBe(1);
    expect(shadeAmount(Number.NaN)).toBe(SHADE_FLOOR);
  });

  it('starts further along for a pale colour, so the lightest tone still stands apart from unmarked land', () => {
    // A gold on cream paper leaves little room between the two.
    const [land, gold] = ['#e8e4da', '#b8955a'];
    expect(contrast(gold, land)).toBeLessThan(2.5);
    expect(contrast(shadeHex(land, gold, 0), land)).toBeGreaterThanOrEqual(1.5);
    expect(shadeHex(land, gold, 1)).toBe(gold);
    // Still a scale: more ticked is still closer to the full colour.
    const steps = [0, 0.25, 0.5, 0.75, 1].map((share) => contrast(shadeHex(land, gold, share), land));
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    expect(new Set(steps.map((v) => v.toFixed(3))).size).toBe(5);
  });

  it('only ever returns plain #rrggbb colours, whatever the pair', () => {
    for (const land of ['#000000', '#ffffff', '#22334f', '#dccfb2']) {
      for (const full of ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000', '#c6a66b']) {
        for (const share of [0, 0.1, 0.5, 0.99, 1]) expect(shadeHex(land, full, share), `${land} ${full} ${share}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('mixing two colours', () => {
  it('returns the ends unchanged and the middle halfway', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#E3DDCE', '#315C4C', 0)).toBe('#e3ddce');
  });

  it('keeps the amount between the two colours and refuses anything that is not a colour', () => {
    expect(mixHex('#102030', '#405060', -3)).toBe('#102030');
    expect(mixHex('#102030', '#405060', 3)).toBe('#405060');
    expect(() => mixHex('red', '#405060', 0.5)).toThrow(/Not a #RRGGBB colour/);
    expect(() => mixHex('#12345', '#405060', 0.5)).toThrow();
  });
});

describe('contrast and the ink chosen for a fill', () => {
  it('measures contrast as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
    // The site's body text on its paper, as the quality report states it.
    expect(contrast('#101b2d', '#f8f6f0')).toBeCloseTo(16, 0);
  });

  it('uses one of the offered inks whenever it reads well enough', () => {
    expect(inkOn('#315c4c', ['#f8f6f0', '#101b2d'])).toBe('#f8f6f0');
    expect(inkOn('#e3ddce', ['#f8f6f0', '#101b2d'])).toBe('#101b2d');
  });

  it('always reaches 4.5 to 1, falling back to black or white on the fills in between', () => {
    for (let r = 0; r <= 255; r += 15) {
      for (let g = 0; g <= 255; g += 15) {
        for (let b = 0; b <= 255; b += 51) {
          const fill = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
          expect(contrast(fill, inkOn(fill, ['#f8f6f0', '#101b2d'])), fill).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

describe('the tones of the interactive map', () => {
  it('uses the same colours as the stylesheet', () => {
    const css = readFileSync(fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url)), 'utf8');
    const value = (name: string): string => {
      const found = new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1].trim();
      if (!found) throw new Error(`${name} is not in tokens.css`);
      const alias = /^var\((--[a-z0-9-]+)\)$/.exec(found);
      return alias ? value(alias[1]) : found.toLowerCase();
    };
    expect(MAP_COLOURS.land).toBe(value('--map-land'));
    expect(MAP_COLOURS.visited).toBe(value('--map-visited'));
    expect(MAP_COLOURS.lightInk).toBe(value('--ivory-50'));
    expect(MAP_COLOURS.darkInk).toBe(value('--navy-900'));
  });

  it('ends at exactly the colour every explored place had before, with the same label', () => {
    expect(toneFor(1).fill).toBe(MAP_COLOURS.visited);
    expect(toneFor(1).label).toBe(MAP_COLOURS.lightInk);
  });

  it('shows five steps in the key, each darker than the one before', () => {
    expect(TONE_RAMP).toHaveLength(SHADE_STOPS.length);
    expect(new Set(TONE_RAMP).size).toBe(TONE_RAMP.length);
    const againstWhite = TONE_RAMP.map((tone) => contrast(tone, '#ffffff'));
    expect([...againstWhite].sort((a, b) => a - b)).toEqual(againstWhite);
  });

  it('keeps every tone apart from unmarked land and from the water around it', () => {
    for (let share = 0; share <= 1.0001; share += 0.01) {
      const { fill } = toneFor(share);
      expect(contrast(fill, MAP_COLOURS.land), `${Math.round(share * 100)}%`).toBeGreaterThanOrEqual(1.5);
      expect(contrast(fill, '#ffffff'), `${Math.round(share * 100)}%`).toBeGreaterThanOrEqual(2);
    }
  });

  it('writes the short name of a province in a colour that reads on its tone, and darkens the tone under the pointer', () => {
    for (let share = 0; share <= 1.0001; share += 0.01) {
      const tone = toneFor(share);
      expect(contrast(tone.fill, tone.label), `${Math.round(share * 100)}%`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tone.hover, '#ffffff'), `${Math.round(share * 100)}%`).toBeGreaterThan(contrast(tone.fill, '#ffffff'));
    }
  });
});
