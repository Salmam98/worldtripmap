import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CANADA_PLACES } from '../../src/data/definitions/canada-places';
import { summarizePlaces } from '../../src/lib/maps/places';
import { MAPS, MAP_IDS } from '../../src/lib/maps/registry';
import { contrast, inkOn, SHADE_STOPS, shadeHex } from '../../src/lib/maps/shade';
import { computeStats } from '../../src/lib/maps/stats';
import { normalizeSelection } from '../../src/lib/maps/store';
import type { MapId } from '../../src/lib/maps/types';
import { composePoster, posterFigures } from '../../src/lib/poster/compose';
import { bleedUnits, withDpi } from '../../src/lib/poster/export';
import { loadFonts, type FontSet } from '../../src/lib/poster/fonts';
import { BLEED_PT, FORMATS, getFormat, type FormatId } from '../../src/lib/poster/formats';
import { sceneToPdf } from '../../src/lib/poster/pdf';
import { sceneToSvg } from '../../src/lib/poster/render-svg';
import { parsePath, type Scene } from '../../src/lib/poster/scene';
import { defaultSettings, LIMITS, normalizeSettings, TEMPLATE_IDS, type PosterSettings, type TemplateId } from '../../src/lib/poster/settings';
import { TEMPLATES, TEMPLATE_LIST } from '../../src/lib/poster/templates';
import { mapData } from '../helpers/geo';
import { colours, describeNode, drawn, outside } from '../helpers/scene';

const hasQpdf = spawnSync('qpdf', ['--version']).status === 0;
const hasPdfinfo = spawnSync('pdfinfo', ['-v']).status === 0;

let fonts: FontSet;
beforeAll(async () => {
  fonts = await loadFonts(['manrope-300', 'manrope-500', 'manrope-700', 'dmserif-400', 'dmserif-400i', 'caveat-600']);
});

const scratch = mkdtempSync(join(tmpdir(), 'wtm-poster-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

interface Case {
  map: MapId;
  visited: string[];
  wishlist?: string[];
  settings?: Partial<PosterSettings>;
  bleed?: number;
  /** Places ticked inside provinces (Canada only). */
  places?: string[];
}

function compose(c: Case, template: TemplateId, format: FormatId, lod: 'display' | 'print' = 'display'): Scene {
  const { def, meta, geometry } = mapData(c.map, lod);
  const settings = normalizeSettings(def, { ...defaultSettings(def), ...c.settings, template, format });
  const places = c.map === 'canada' && c.places ? summarizePlaces(CANADA_PLACES, new Set(c.places)) : null;
  return composePoster(
    { def, meta, geometry, selection: normalizeSelection(def, c.visited, c.wishlist ?? []), settings, format: getFormat(format), bleed: c.bleed, places },
    fonts,
  );
}

const everything = (map: MapId) => MAPS[map].features.map((f) => f.id);
const everyPlace = CANADA_PLACES.places.map((p) => p.id);
/** The colours a design uses, with its first accent. */
const lookOf = (template: TemplateId, accent = 'default') =>
  TEMPLATES[template].look(normalizeSettings(MAPS.canada, { ...defaultSettings(MAPS.canada), template, accent }));
/** The tone each province gets on a poster, from the places ticked. */
function tonesFor(template: TemplateId, places: string[]): Map<string, string> {
  const look = lookOf(template);
  const summary = summarizePlaces(CANADA_PLACES, new Set(places));
  return new Map(MAPS.canada.features.map((f) => [f.id, shadeHex(look.land, look.accent, summary.byFeature[f.id].visited / summary.byFeature[f.id].total)]));
}
const fillsOf = (scene: Scene) => drawn(scene).flatMap(({ node }) => (node.type === 'path' && node.fill ? [node.fill.toLowerCase()] : []));
const LONGEST = {
  title: 'W'.repeat(LIMITS.title),
  subtitle: 'Mmmmm wwwww '.repeat(8),
  name: 'Wolfeschlegelsteinhausenbergerdorff Senior',
  dates: 'September 2015 – December 2026',
  caption: 'An unreasonably long caption that goes on and on about every single road, ferry, train and gravel track along the way.',
};

/** The situations a poster has to survive: nothing marked, a normal map, and everything at once. */
const CASES: Record<string, (map: MapId) => Case> = {
  'an empty map': (map) => ({ map, visited: [] }),
  'a typical map': (map) => ({
    map,
    visited: everything(map).filter((_, i) => i % 4 === 0),
    wishlist: everything(map).filter((_, i) => i % 9 === 1),
    settings: { name: 'Amina', dates: '2015–2026', showWishlist: true, badge: 'first-adventure' },
    places: everyPlace.filter((_, i) => i % 3 === 0),
  }),
  'every place, every option and the longest text allowed': (map) => ({
    map,
    visited: everything(map),
    settings: { ...LONGEST, showWishlist: true, showList: true, showLabels: true, showBrand: true, badge: 'complete-explorer' },
    // Every place ticked: "100%" beside all thirteen names, the widest the list can get.
    places: everyPlace,
  }),
  'everything on the bucket list with the lists switched on': (map) => ({
    map,
    visited: [],
    wishlist: everything(map),
    settings: { showWishlist: true, caption: LONGEST.caption },
  }),
};

describe('templates', () => {
  it('offers the four named designs', () => {
    expect(TEMPLATE_LIST.map((t) => t.name)).toEqual(['Midnight Atlas', 'Nordic Explorer', 'Modern Cartographer', 'Travel Journal']);
    expect(TEMPLATE_IDS).toEqual(TEMPLATE_LIST.map((t) => t.id));
  });

  it('gives each design at least three accent colours, with readable ink chosen for each', () => {
    for (const t of TEMPLATE_LIST) {
      expect(t.accents.length, t.id).toBeGreaterThanOrEqual(3);
      expect(new Set(t.accents.map((a) => a.id)).size, t.id).toBe(t.accents.length);
      for (const accent of t.accents) {
        expect(accent.id, t.id).toMatch(/^[a-z-]{1,24}$/);
        for (const colour of [accent.hex, accent.on, accent.text]) expect(colour, `${t.id} ${accent.id}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('has the fonts it asks for, whichever lettering is chosen', () => {
    for (const t of TEMPLATE_LIST) {
      for (const typeface of ['template', 'serif', 'sans', 'script'] as const) {
        for (const key of t.fonts(typeface)) expect(fonts.has(key), `${t.id} ${typeface} ${key}`).toBe(true);
      }
    }
  });
});

describe.each(TEMPLATE_IDS)('%s', (template) => {
  describe.each(MAP_IDS)('%s map', (map) => {
    it.each(FORMATS.map((f) => f.id))('fits the %s shape in every situation, with nothing cut off', (format) => {
      for (const [label, make] of Object.entries(CASES)) {
        const scene = compose(make(map), template, format);
        const f = getFormat(format);
        expect(scene.width).toBe(f.width);
        expect(scene.height).toBe(f.height);
        const shapes = drawn(scene);
        expect(shapes.length, label).toBeGreaterThan(20);
        const cut = outside(scene);
        if (cut.length) {
          throw new Error(`${template} / ${map} / ${format} / ${label}: ${cut.length} shape(s) leave the page, e.g. ${describeNode(cut[0])}`);
        }
      }
    });
  });

  it('uses only plain #RRGGBB colours, which every renderer understands', () => {
    const scene = compose(CASES['a typical map']('canada'), template, 'post');
    for (const colour of colours(scene)) expect(colour, colour).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('paints the paper right to the edge of the bleed for print', () => {
    const format = getFormat('print');
    const bleed = bleedUnits(format, format.pdf!);
    const scene = compose({ ...CASES['a typical map']('canada'), bleed }, template, 'print', 'print');
    expect(scene.bleed).toBeCloseTo(bleed, 6);
    const boxes = drawn(scene).map((d) => d.box);
    expect(Math.min(...boxes.map((b) => b[0]))).toBeLessThanOrEqual(-bleed + 0.01);
    expect(Math.min(...boxes.map((b) => b[1]))).toBeLessThanOrEqual(-bleed + 0.01);
    expect(Math.max(...boxes.map((b) => b[2]))).toBeGreaterThanOrEqual(format.width + bleed - 0.01);
    expect(Math.max(...boxes.map((b) => b[3]))).toBeGreaterThanOrEqual(format.height + bleed - 0.01);
    expect(outside(scene)).toHaveLength(0);
  });

  it('changes the picture when the accent colour changes', () => {
    const accents = TEMPLATES[template].accents;
    const base = CASES['a typical map']('canada');
    const a = sceneToSvg(compose({ ...base, settings: { ...base.settings, accent: accents[0].id } }, template, 'post'));
    const b = sceneToSvg(compose({ ...base, settings: { ...base.settings, accent: accents[1].id } }, template, 'post'));
    expect(a).not.toBe(b);
  });
});

describe('what a poster shows', () => {
  it('draws explored and unexplored places differently', () => {
    const none = sceneToSvg(compose({ map: 'canada', visited: [] }, 'nordic-explorer', 'post'));
    const some = sceneToSvg(compose({ map: 'canada', visited: ['CA-ON', 'CA-BC'] }, 'nordic-explorer', 'post'));
    expect(some).not.toBe(none);
  });

  it('describes itself for screen readers with the real count', () => {
    const scene = compose({ map: 'canada', visited: ['CA-ON', 'CA-BC', 'CA-QC', 'CA-NS'], settings: { title: 'Places I’ve Explored' } }, 'midnight-atlas', 'post');
    expect(scene.description).toBe('Places I’ve Explored: a Midnight Atlas poster of Canada: provinces and territories. 4 of 13 provinces and territories explored.');
  });

  it('leads with the Canada percentage once places are ticked, and keeps the count of provinces underneath', () => {
    const def = MAPS.canada;
    const stats = computeStats(def, normalizeSelection(def, ['CA-ON', 'CA-AB', 'CA-BC'], []));
    expect(posterFigures(def, stats, null)).toEqual({
      numeral: '3',
      first: 'of 13',
      label: 'provinces and territories explored',
      extras: ['23% of provinces and territories'],
    });
    const ticked = (ids: string[]) => summarizePlaces(CANADA_PLACES, new Set(ids));
    expect(posterFigures(def, stats, ticked(['toronto', 'niagara-falls', 'banff']))).toEqual({
      numeral: '2%',
      first: 'of Canada',
      label: 'explored',
      extras: ['3 of 178 places visited', '3 of 13 provinces and territories'],
    });
    // Someone who has only been to Toronto: a small share is said as such, never rounded down to nothing.
    expect(posterFigures(def, stats, ticked(['toronto'])).numeral).toBe('<1%');
    expect(posterFigures(def, stats, ticked(everyPlace)).numeral).toBe('100%');
  });

  it('leaves the other maps leading with their count', () => {
    const world = MAPS.world;
    const figures = posterFigures(world, computeStats(world, normalizeSelection(world, ['CAN', 'FRA', 'GRL'], [])), null);
    expect(figures.numeral).toBe('2');
    expect(figures.first).toBe('of 195');
    expect(figures.extras).toEqual(['1% of countries', 'plus 1 territory', '2 of 6 inhabited continents']);
  });

  it('writes a percentage beside each province with places ticked, and one line saying what they are', () => {
    const base = { map: 'canada' as const, visited: ['CA-ON', 'CA-AB', 'CA-BC'] };
    const plain = compose(base, 'nordic-explorer', 'post');
    const ontario = compose({ ...base, places: ['toronto', 'niagara-falls'] }, 'nordic-explorer', 'post');
    const withPlaces = compose({ ...base, places: ['toronto', 'niagara-falls', 'banff'] }, 'nordic-explorer', 'post');
    expect(withPlaces.description).toBe(
      'My Canada Journey: a Nordic Explorer poster of Canada: provinces and territories. 3 of 13 provinces and territories explored. 3 of 178 places, 2% of Canada.',
    );
    expect(plain.description).not.toContain('places');
    // Alberta's percentage is the one piece of text the second poster has and the first does not.
    expect(drawn(withPlaces).length).toBe(drawn(ontario).length + 1);
    expect(sceneToSvg(ontario)).not.toBe(sceneToSvg(plain));
    expect(outside(withPlaces)).toHaveLength(0);
  });

  it('never lets one line of the list run into another, even with 100% beside every name', () => {
    const settings = { showLabels: false, badge: '', name: '', dates: '', subtitle: '', caption: '' };
    for (const template of TEMPLATE_IDS) {
      for (const format of FORMATS) {
        for (const places of [everyPlace, everyPlace.filter((_, i) => i % 3 === 0)]) {
          const scene = compose({ map: 'canada', visited: everything('canada'), places, settings }, template, format.id);
          const small = drawn(scene).filter(({ node, box }) => node.type === 'path' && node.fill && !node.stroke && box[3] - box[1] > 5 && box[3] - box[1] < 22);
          // The list is found by its thirteen square markers, nine units a side, each in its province's tone.
          const tones = new Set([...tonesFor(template, places).values()].map((tone) => tone.toLowerCase()));
          const markers = small.filter(
            ({ node, box }) =>
              node.type === 'path' && tones.has(node.fill!.toLowerCase()) && Math.abs(box[2] - box[0] - 9) < 0.2 && Math.abs(box[3] - box[1] - 9) < 0.2,
          );
          expect(markers.length, `${template} ${format.id}: the thirteen markers`).toBe(13);
          const top = Math.min(...markers.map((m) => m.box[1])) - 6;
          const bottom = Math.max(...markers.map((m) => m.box[3])) + 6;
          const left = Math.min(...markers.map((m) => m.box[0])) - 1;
          // Markers, names and percentages: everything small in the band the list occupies.
          const lines = small.map(({ box }) => box).filter((box) => box[1] >= top && box[3] <= bottom && box[0] >= left && box[2] - box[0] > 7);
          expect(lines.length, `${template} ${format.id}`).toBeGreaterThanOrEqual(13 * 2 + (places.length === everyPlace.length ? 13 : 1));
          for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
              const [a, b] = [lines[i], lines[j]];
              const overlapX = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
              const overlapY = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
              if (overlapX > 1 && overlapY > 1) {
                throw new Error(`${template} / ${format.id}: two parts of the list overlap at [${a.map((v) => v.toFixed(0))}] and [${b.map((v) => v.toFixed(0))}]`);
              }
            }
          }
          // The large figure sits beside the list in some designs. "100%" is the widest it gets, and
          // neither it nor the words next to it may reach across into the list.
          const beside = drawn(scene).filter(
            ({ node, box }) =>
              node.type === 'path' && node.fill && !node.stroke && box[3] - box[1] < 240 && box[2] - box[0] < 700 && box[3] > top && box[1] < bottom && box[0] < left - 1,
          );
          for (const { box } of beside) {
            if (box[2] > left) throw new Error(`${template} / ${format.id}: something beside the list runs into it at [${box.map((v) => v.toFixed(0))}], list starts at ${left.toFixed(0)}`);
          }
        }
      }
    }
  });

  it('colours each province by its percentage: lightest for none of its places, the full colour for all of them', () => {
    const base = { map: 'canada' as const, visited: ['CA-PE', 'CA-ON', 'CA-QC', 'CA-AB'] };
    // All six places of Prince Edward Island, two of Ontario's 31, three of Alberta's 17, none of Quebec's.
    const places = [...CANADA_PLACES.places.filter((p) => p.within === 'CA-PE').map((p) => p.id), 'toronto', 'cn-tower', 'calgary', 'banff', 'jasper'];
    for (const template of TEMPLATE_IDS) {
      const look = lookOf(template);
      const tones = tonesFor(template, places);
      expect(tones.get('CA-PE')!.toLowerCase(), template).toBe(look.accent.toLowerCase());
      expect(tones.get('CA-QC'), template).toBe(shadeHex(look.land, look.accent, 0));
      // More of a province seen means a tone further from unmarked land and closer to the accent.
      const order = ['CA-QC', 'CA-ON', 'CA-AB', 'CA-PE'].map((id) => contrast(tones.get(id)!, look.land));
      expect([...order].sort((a, b) => a - b), template).toEqual(order);
      expect(new Set(order).size, template).toBe(4);

      const fills = fillsOf(compose({ ...base, places }, template, 'post'));
      // Each tone is drawn at least twice: the province on the map and its square in the list.
      for (const id of base.visited) expect(fills.filter((fill) => fill === tones.get(id)!.toLowerCase()).length, `${template} ${id}`).toBeGreaterThanOrEqual(2);

      // Switched off, every explored province is the one accent colour again, as before.
      const flat = fillsOf(compose({ ...base, places, settings: { shadePlaces: false } }, template, 'post'));
      for (const id of ['CA-ON', 'CA-QC', 'CA-AB']) expect(flat, `${template} ${id}`).not.toContain(tones.get(id)!.toLowerCase());
    }
  });

  it('keeps the short names on the map readable on every tone, in every design and accent colour', () => {
    for (const template of TEMPLATE_IDS) {
      for (const accent of TEMPLATES[template].accents) {
        const look = lookOf(template, accent.id);
        for (let share = 0; share <= 1.0001; share += 0.02) {
          const tone = shadeHex(look.land, look.accent, share);
          const ink = inkOn(tone, [look.onAccent, look.landLabel]);
          expect(contrast(tone, ink), `${template} ${accent.id} at ${Math.round(share * 100)}%`).toBeGreaterThanOrEqual(4.5);
        }
        // The lightest tone must still be told apart from land that is not marked at all.
        expect(contrast(shadeHex(look.land, look.accent, 0), look.land), `${template} ${accent.id}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it('shows the scale in the key when the list of provinces is switched off', () => {
    const base = { map: 'canada' as const, visited: ['CA-ON', 'CA-AB'], places: ['toronto', 'banff', 'jasper'] };
    const look = lookOf('nordic-explorer');
    const flat = compose({ ...base, settings: { showList: false, shadePlaces: false } }, 'nordic-explorer', 'post');
    const scaled = compose({ ...base, settings: { showList: false } }, 'nordic-explorer', 'post');
    const fills = fillsOf(scaled);
    for (const share of SHADE_STOPS) expect(fills).toContain(shadeHex(look.land, look.accent, share).toLowerCase());
    // Five squares in place of one.
    expect(drawn(scaled).length).toBe(drawn(flat).length + SHADE_STOPS.length - 1);
    expect(outside(scaled)).toHaveLength(0);
  });

  it('leaves the percentages off when they are switched off, or when no place is ticked', () => {
    const base = { map: 'canada' as const, visited: ['CA-ON', 'CA-AB'] };
    const plain = sceneToSvg(compose(base, 'midnight-atlas', 'post'));
    const off = compose({ ...base, places: ['toronto', 'banff'], settings: { showPlaces: false } }, 'midnight-atlas', 'post');
    const none = compose({ ...base, places: [] }, 'midnight-atlas', 'post');
    expect(sceneToSvg(off)).toBe(plain);
    expect(sceneToSvg(none)).toBe(plain);
    expect(off.description).not.toContain('places');
  });

  it('keeps the percentages when the list of provinces is switched off, in the line under the count', () => {
    const base = { map: 'canada' as const, visited: ['CA-ON'], settings: { showList: false } };
    const without = sceneToSvg(compose(base, 'travel-journal', 'post'));
    const withPlaces = sceneToSvg(compose({ ...base, places: ['toronto', 'cn-tower'] }, 'travel-journal', 'post'));
    expect(withPlaces).not.toBe(without);
  });

  it('adds shapes for the title, list, labels and site mark, and removes them when switched off', () => {
    const base = { map: 'canada' as const, visited: ['CA-ON', 'CA-BC'] };
    const full = drawn(compose({ ...base, settings: { showLabels: true, showList: true, showBrand: true } }, 'modern-cartographer', 'post')).length;
    const bare = drawn(compose({ ...base, settings: { showLabels: false, showList: false, showBrand: false } }, 'modern-cartographer', 'post')).length;
    expect(full).toBeGreaterThan(bare + 10);
  });

  it('shows an achievement seal only once it has been earned', () => {
    const settings = { badge: 'complete-explorer' };
    const without = drawn(compose({ map: 'canada', visited: ['CA-ON'], settings }, 'midnight-atlas', 'post')).length;
    const withSeal = drawn(compose({ map: 'canada', visited: everything('canada'), settings: { ...settings, showList: false } }, 'midnight-atlas', 'post')).length;
    const noSeal = drawn(compose({ map: 'canada', visited: everything('canada'), settings: { badge: '', showList: false } }, 'midnight-atlas', 'post')).length;
    const unearned = drawn(compose({ map: 'canada', visited: ['CA-ON'], settings: { badge: '' } }, 'midnight-atlas', 'post')).length;
    expect(without).toBe(unearned);
    expect(withSeal).toBeGreaterThan(noSeal);
  });

  it('draws nothing unreadable for text the bundled fonts cannot set, when no system fonts are available', () => {
    const scene = compose({ map: 'canada', visited: ['CA-ON'], settings: { title: 'আমার কানাডা', name: '山田 太郎', caption: 'Åland, Zoë, São Tomé' } }, 'travel-journal', 'post');
    expect(outside(scene)).toHaveLength(0);
    expect(sceneToSvg(scene)).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe('SVG output (the live preview)', () => {
  it('is one well-formed drawing with no broken numbers and no text or script elements', () => {
    for (const template of TEMPLATE_IDS) {
      const svg = sceneToSvg(compose(CASES['every place, every option and the longest text allowed']('world'), template, 'print-wide'), { idPrefix: 't' });
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1080">')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(svg).not.toMatch(/<(script|text|foreignObject|style|a)\b/i);
      expect(svg).not.toMatch(/\son[a-z]+=/i);
      expect((svg.match(/<g/g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length);
    }
  });

  it('never lets typed text reach the markup: letters arrive as outlines', () => {
    const hostile = '"><script>alert(1)</script><img src=x onerror=alert(1)>';
    const scene = compose({ map: 'canada', visited: ['CA-ON'], settings: { title: hostile, subtitle: hostile, name: hostile, caption: hostile, dates: hostile } }, 'midnight-atlas', 'post');
    const svg = sceneToSvg(scene);
    expect(svg).not.toContain('script');
    expect(svg).not.toContain('onerror');
    expect(svg).not.toContain('alert');
  });

  it('gives unique clip ids per poster so several can share a page', () => {
    const scene = compose(CASES['a typical map']('canada'), 'modern-cartographer', 'post');
    const a = sceneToSvg(scene, { idPrefix: 'a' });
    const b = sceneToSvg(scene, { idPrefix: 'b' });
    const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(a).length).toBeGreaterThan(0);
    expect(new Set(ids(a)).size).toBe(ids(a).length);
    expect(ids(a).some((id) => ids(b).includes(id))).toBe(false);
  });

  it('can include the bleed area', () => {
    const format = getFormat('print');
    const bleed = bleedUnits(format, format.pdf!);
    const scene = compose({ ...CASES['a typical map']('canada'), bleed }, 'nordic-explorer', 'print');
    expect(sceneToSvg(scene, { withBleed: true })).toContain(`viewBox="${-bleed} ${-bleed} `);
    expect(sceneToSvg(scene)).toContain('viewBox="0 0 1080 1440"');
  });
});

describe('PDF output', () => {
  const fixed = new Date(Date.UTC(2026, 9, 10, 12, 0, 0));
  const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

  async function pdfFor(format: FormatId, options: { bleed?: boolean; title?: string; author?: string; map?: MapId; template?: TemplateId } = {}) {
    const f = getFormat(format);
    const bleed = options.bleed ? bleedUnits(f, f.pdf!) : 0;
    const scene = compose({ ...CASES['a typical map'](options.map ?? 'canada'), bleed }, options.template ?? 'midnight-atlas', format, 'print');
    const bytes = await sceneToPdf(scene, {
      widthPt: f.pdf!.widthPt,
      heightPt: f.pdf!.heightPt,
      bleedPt: options.bleed ? BLEED_PT : 0,
      title: options.title ?? 'My Canada Journey',
      author: options.author,
      subject: 'Test',
      date: fixed,
    });
    return { bytes, scene, format: f };
  }

  const printable = FORMATS.filter((f) => f.pdf).map((f) => f.id);

  it('offers a PDF for the post and every print shape, and not for story or pin', () => {
    expect(printable).toEqual(['post', 'print', 'print-wide', 'a-series', 'a-series-wide']);
  });

  it.each(printable)('writes a valid single-page file at the stated %s size', async (format) => {
    const { bytes, format: f } = await pdfFor(format);
    const s = text(bytes);
    expect(s.startsWith('%PDF-1.4\n')).toBe(true);
    expect(s.endsWith('%%EOF\n')).toBe(true);
    const media = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(s)!;
    expect(Number(media[1])).toBeCloseTo(f.pdf!.widthPt, 2);
    expect(Number(media[2])).toBeCloseTo(f.pdf!.heightPt, 2);
    expect(s).toContain('/Count 1');

    // Every entry in the cross-reference table points at the object it names.
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(s)![1]);
    expect(s.slice(start, start + 4)).toBe('xref');
    const entries = [...s.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries.length).toBeGreaterThanOrEqual(5);
    entries.forEach((offset, i) => expect(s.slice(offset, offset + `${i + 1} 0 obj`.length), `object ${i + 1}`).toBe(`${i + 1} 0 obj`));

    if (hasQpdf || hasPdfinfo) {
      const file = join(scratch, `${format}.pdf`);
      writeFileSync(file, bytes);
      if (hasQpdf) {
        const check = spawnSync('qpdf', ['--check', file], { encoding: 'utf8' });
        expect(check.status, check.stdout + check.stderr).toBe(0);
        expect(check.stdout).toContain('No syntax or stream encoding errors found');
      }
      if (hasPdfinfo) {
        const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
        const size = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info)!;
        expect(Number(size[1])).toBeCloseTo(f.pdf!.widthPt, 1);
        expect(Number(size[2])).toBeCloseTo(f.pdf!.heightPt, 1);
        expect(info).toMatch(/Pages:\s+1\b/);
      }
    }
  });

  it('contains only vector drawing operators: no fonts and no images', async () => {
    const { bytes } = await pdfFor('print');
    const s = text(bytes);
    expect(s).not.toContain('/Font');
    expect(s).not.toContain('/XObject');
    expect(s).not.toContain('/Subtype /Image');
  });

  it('declares trim and bleed boxes 3 mm apart when bleed is asked for', async () => {
    const { bytes, format: f } = await pdfFor('print', { bleed: true });
    const s = text(bytes);
    const box = (name: string) => new RegExp(`/${name} \\[([\\d. ]+)\\]`).exec(s)![1].split(' ').map(Number);
    const mm3 = (3 * 72) / 25.4;
    expect(box('MediaBox')[2]).toBeCloseTo(f.pdf!.widthPt + 2 * mm3, 2);
    expect(box('MediaBox')[3]).toBeCloseTo(f.pdf!.heightPt + 2 * mm3, 2);
    expect(box('BleedBox')).toEqual(box('MediaBox'));
    const trim = box('TrimBox');
    expect(trim[0]).toBeCloseTo(mm3, 2);
    expect(trim[2] - trim[0]).toBeCloseTo(f.pdf!.widthPt, 2);
    expect(trim[3] - trim[1]).toBeCloseTo(f.pdf!.heightPt, 2);
  });

  it('records the title and name safely, in any alphabet', async () => {
    const plain = text((await pdfFor('post', { title: 'Tricky (title) \\ here', author: 'Amina' })).bytes);
    expect(plain).toContain('/Title (Tricky \\(title\\) \\\\ here)');
    expect(plain).toContain('/Author (Amina)');
    const bengali = text((await pdfFor('post', { title: 'আমার', author: 'সালমান' })).bytes);
    expect(bengali).toContain('/Title <FEFF0986');
    expect(bengali).not.toContain('আ');
  });

  it('produces the same bytes for the same poster', async () => {
    const a = await pdfFor('post');
    const b = await pdfFor('post');
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });

  it('refuses a page whose proportions do not match the poster', async () => {
    const scene = compose(CASES['a typical map']('canada'), 'midnight-atlas', 'post');
    await expect(sceneToPdf(scene, { widthPt: 576, heightPt: 576 })).rejects.toThrow(/different proportions/);
  });

  it('stays a sensible size for the most detailed map', async () => {
    const { bytes } = await pdfFor('print-wide', { map: 'world', template: 'modern-cartographer' });
    expect(bytes.length).toBeGreaterThan(50_000);
    expect(bytes.length).toBeLessThan(3_000_000);
  });
});

describe('formats', () => {
  it('keeps every image within what phones can draw', () => {
    for (const f of FORMATS) for (const size of f.png) expect(size.width * size.height, `${f.id} ${size.id}`).toBeLessThanOrEqual(16_777_216);
  });

  it('keeps every PNG and PDF in the same proportions as the design, so nothing is stretched or cropped', () => {
    for (const f of FORMATS) {
      const ratio = f.width / f.height;
      for (const size of f.png) expect(Math.abs(size.width / size.height / ratio - 1), `${f.id} ${size.id}`).toBeLessThan(0.0005);
      if (f.pdf) expect(Math.abs(f.pdf.widthPt / f.pdf.heightPt / ratio - 1), `${f.id} pdf`).toBeLessThan(0.0005);
    }
  });

  it('states print resolutions that match the pixel counts', () => {
    const inches: Record<string, number> = { A4: 210 / 25.4, A3: 297 / 25.4 };
    for (const f of FORMATS.filter((x) => x.group === 'print')) {
      for (const size of f.png) {
        expect(size.dpi, `${f.id} ${size.id}`).toBeDefined();
        const m = /^(\d+) dpi at (?:(A\d)|(\d+) × (\d+) in)$/.exec(size.note)!;
        expect(m, size.note).not.toBeNull();
        expect(Number(m[1])).toBe(size.dpi);
        const shortSideInches = m[2] ? inches[m[2]] : Math.min(Number(m[3]), Number(m[4]));
        const shortSidePixels = Math.min(size.width, size.height);
        expect(Math.abs(shortSidePixels / shortSideInches - size.dpi!), size.note).toBeLessThan(1);
      }
    }
  });

  it('sizes the social shapes the way the networks expect', () => {
    expect(getFormat('post').png[0]).toMatchObject({ width: 1080, height: 1350 });
    expect(getFormat('story').png[0]).toMatchObject({ width: 1080, height: 1920 });
    expect(getFormat('pin').png[0]).toMatchObject({ width: 1000, height: 1500 });
  });

  it('falls back to the post shape for an unknown id', () => {
    expect(getFormat('poster-9000').id).toBe('post');
    expect(getFormat(undefined).id).toBe('post');
  });
});

describe('print resolution tag', () => {
  // The smallest valid PNG: signature, a 13-byte header chunk, and the end chunk.
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89, 0,
    0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  it('adds a physical-size chunk straight after the header', () => {
    const out = withDpi(png, 300);
    expect(out.length).toBe(png.length + 21);
    expect(String.fromCharCode(...out.slice(37, 41))).toBe('pHYs');
    const view = new DataView(out.buffer);
    expect(view.getUint32(41)).toBe(11811);
    expect(view.getUint32(45)).toBe(11811);
    expect(out[49]).toBe(1);
    expect(String.fromCharCode(...out.slice(out.length - 8, out.length - 4))).toBe('IEND');
  });

  it('does not add it twice, and leaves anything that is not a PNG alone', () => {
    const once = withDpi(png, 300);
    expect(withDpi(once, 300)).toBe(once);
    const other = new Uint8Array([1, 2, 3]);
    expect(withDpi(other, 300)).toBe(other);
  });
});

describe('poster settings', () => {
  const def = MAPS.canada;

  it('starts from the design in the brief', () => {
    expect(defaultSettings(def)).toMatchObject({ template: 'midnight-atlas', format: 'post', title: 'My Canada Journey', showBrand: true, bleed: false });
  });

  it('trims every text field to its limit, counting whole characters', () => {
    const s = normalizeSettings(def, { title: 'x'.repeat(500), subtitle: '🌍'.repeat(500), name: 'n'.repeat(500), dates: 'd'.repeat(500), caption: 'c'.repeat(500) });
    expect([...s.title]).toHaveLength(LIMITS.title);
    expect([...s.subtitle]).toHaveLength(LIMITS.subtitle);
    expect([...s.name]).toHaveLength(LIMITS.name);
    expect([...s.dates]).toHaveLength(LIMITS.dates);
    expect([...s.caption]).toHaveLength(LIMITS.caption);
  });

  it('flattens line breaks and removes hidden characters from typed text', () => {
    const s = normalizeSettings(def, { title: 'My\nCanada‮ Journey', caption: '  two\t\tspaces  ' });
    expect(s.title).toBe('My Canada Journey');
    expect(s.caption).toBe('two spaces');
  });

  it('replaces anything unrecognised with a safe default', () => {
    const s = normalizeSettings(def, {
      template: 'neon-dreams',
      format: 'billboard',
      accent: 'url(javascript:alert(1))',
      typeface: 'comic',
      badge: '<b>',
      showLabels: 'yes',
      bleed: 1,
      title: 42,
    } as never);
    expect(s).toMatchObject({ template: 'midnight-atlas', format: 'post', accent: 'default', typeface: 'template', badge: '', showLabels: true, bleed: false, title: 'My Canada Journey' });
  });

  it('accepts null, arrays and strings without throwing', () => {
    for (const junk of [null, [], 'text', 7, true]) expect(normalizeSettings(def, junk as never)).toEqual(defaultSettings(def));
  });

  it('allows an empty title, so a poster can be left untitled', () => {
    expect(normalizeSettings(def, { title: '' }).title).toBe('');
  });
});

describe('path data', () => {
  it('reads absolute and relative commands, with repeats and compact numbers', () => {
    expect(parsePath('M10 20l5-5 5 5h10v-10H0V0z')).toEqual([
      { op: 'M', x: 10, y: 20 },
      { op: 'L', x: 15, y: 15 },
      { op: 'L', x: 20, y: 20 },
      { op: 'L', x: 30, y: 20 },
      { op: 'L', x: 30, y: 10 },
      { op: 'L', x: 0, y: 10 },
      { op: 'L', x: 0, y: 0 },
      { op: 'Z' },
    ]);
  });

  it('treats extra pairs after a move as lines, and returns to the start after closing', () => {
    expect(parsePath('m1 1 2 0 0 2zl-1 0')).toEqual([
      { op: 'M', x: 1, y: 1 },
      { op: 'L', x: 3, y: 1 },
      { op: 'L', x: 3, y: 3 },
      { op: 'Z' },
      { op: 'L', x: 0, y: 1 },
    ]);
  });

  it('keeps cubic curves and raises quadratic ones to cubics with the same shape', () => {
    expect(parsePath('M0 0C1 2 3 4 5 6')).toEqual([{ op: 'M', x: 0, y: 0 }, { op: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 }]);
    const [, q] = parsePath('M0 0Q3 6 6 0') as [unknown, { op: string; x1: number; y1: number; x2: number; y2: number; x: number; y: number }];
    expect(q.op).toBe('C');
    expect(q.x1).toBeCloseTo(2);
    expect(q.y1).toBeCloseTo(4);
    expect(q.x2).toBeCloseTo(4);
    expect(q.y2).toBeCloseTo(4);
    expect([q.x, q.y]).toEqual([6, 0]);
  });

  it('reads decimals, signs and exponents', () => {
    expect(parsePath('M.5-.5L1e2,2.5E-1')).toEqual([{ op: 'M', x: 0.5, y: -0.5 }, { op: 'L', x: 100, y: 0.25 }]);
  });

  it('rejects commands the engine does not draw, rather than guessing', () => {
    expect(() => parsePath('M0 0A5 5 0 0 1 10 10')).toThrow();
    expect(() => parsePath('M0 0L5')).toThrow();
  });
});
