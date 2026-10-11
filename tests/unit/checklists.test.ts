import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { WORLD_UNITS } from '../../src/data/definitions/world';
import { CANADA_PLACES } from '../../src/data/definitions/canada-places';
import { CHECKLIST_FONTS, checklistItemCount, checklistKey, checklistSheet, PAPERS, type ChecklistSpec, type PaperId } from '../../src/lib/guides/checklist-pdf';
import { CHECKLISTS, CHECKLISTS_CHECKED, checklistPath, checklistSubject, countriesChecklist, PAPER_IDS, parksChecklist } from '../../src/lib/guides/checklists';
import { Pen, sheetToPdf, sheetToScene } from '../../src/lib/guides/sheet';
import { loadFonts, type FontSet } from '../../src/lib/poster/fonts';

/**
 * The printable checklists: what is on each sheet, that it fits the paper, and that the files in
 * public/downloads/ are the ones the current data produces.
 */

const root = fileURLToPath(new URL('../../', import.meta.url));
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');
const hasQpdf = spawnSync('qpdf', ['--version']).status === 0;
const cases = CHECKLISTS.flatMap((spec) => PAPER_IDS.map((paper) => [`${spec.id} on ${PAPERS[paper].name}`, spec, paper] as [string, ChecklistSpec, PaperId]));

let fonts: FontSet;
beforeAll(async () => {
  fonts = await loadFonts(CHECKLIST_FONTS);
});

const names = (spec: ChecklistSpec) => spec.zones.flatMap((zone) => zone.sections.flatMap((section) => section.items.map((item) => item.name)));

describe('what is on the sheets', () => {
  it('lists the 195 countries, then the 42 territories, each once', () => {
    const spec = countriesChecklist();
    const [countries, territories] = spec.zones.map((zone) => zone.sections.flatMap((section) => section.items.map((item) => item.name)));
    expect(countries.map((name) => name.replace(/ \*$/, '')).sort()).toEqual(WORLD_UNITS.filter((u) => u.status !== 'territory').map((u) => u.name).sort());
    expect(territories.sort()).toEqual(WORLD_UNITS.filter((u) => u.status === 'territory').map((u) => u.name).sort());
    expect(countries).toHaveLength(195);
    expect(territories).toHaveLength(42);
    // The two observer states are the ones marked, and the footnote says what the mark means.
    expect(countries.filter((name) => name.endsWith(' *')).sort()).toEqual(['Palestine *', 'Vatican City *']);
    expect(spec.footnotes.join(' ')).toContain('193 member states of the United Nations and its 2 observer states, marked *');
    expect(spec.tally).toBe('of 195');
    expect(spec.zones[1].tally).toBe('of 42');
    expect(spec.zones[0].sections.map((section) => [section.heading, section.items.length])).toEqual([
      ['Africa', 54],
      ['Asia', 48],
      ['Europe', 44],
      ['North America', 23],
      ['South America', 12],
      ['Oceania', 14],
    ]);
  });

  it('lists the 48 national parks and reserves by province, with the urban park apart', () => {
    const spec = parksChecklist();
    const parks = CANADA_PLACES.places.filter((p) => p.kind === 'park');
    expect(names(spec).sort()).toEqual(parks.map((p) => p.name).sort());
    expect(spec.tally).toBe('of 48');
    const sections = spec.zones[0].sections;
    expect(sections).toHaveLength(14);
    expect(sections.at(-1)!.heading).toBe('National urban park');
    expect(sections.at(-1)!.items.map((item) => item.name)).toEqual(['Rouge']);
    expect(sections.slice(0, -1).reduce((sum, section) => sum + section.items.length, 0)).toBe(48);
    expect(spec.intro).toContain('37 national parks and 11 national park reserves');
    // Every note on the map is on the sheet.
    for (const park of parks.filter((p) => p.note && p.id !== 'rouge')) {
      const item = sections.flatMap((section) => section.items).find((entry) => entry.name === park.name)!;
      expect(item.note, park.name).toBe(park.note);
    }
  });

  it('gives each sheet a fingerprint that changes when a name does', () => {
    const spec = countriesChecklist();
    const changed = structuredClone(spec);
    changed.zones[0].sections[0].items[0].name = 'Algeria!';
    expect(checklistKey(spec)).toMatch(/^[0-9a-f]{16}$/);
    expect(checklistKey(spec)).toBe(checklistKey(countriesChecklist()));
    expect(checklistKey(changed)).not.toBe(checklistKey(spec));
    expect(checklistKey(parksChecklist())).not.toBe(checklistKey(spec));
  });
});

describe.each(cases)('%s', (_label, spec, paper) => {
  it('draws a box for every name and keeps the lists above the footer', () => {
    const layout = checklistSheet(spec, paper, fonts);
    expect(layout.boxes).toBe(checklistItemCount(spec));
    expect(layout.bottom).toBeLessThanOrEqual(layout.limit + 0.5);
    // Small enough to fit, never so small that it cannot be read on paper.
    expect(layout.size).toBeGreaterThanOrEqual(spec.id.startsWith('countries') ? 6.8 : 11);
    expect(layout.size).toBeLessThanOrEqual(spec.maxSize);
  });

  it('keeps everything inside the margins of the page', () => {
    const { sheet } = checklistSheet(spec, paper, fonts);
    const { widthPt, heightPt } = PAPERS[paper];
    expect([sheet.width, sheet.height]).toEqual([widthPt, heightPt]);
    for (const op of sheet.ops) {
      if (op.type !== 'text') continue;
      const font = fonts.get(op.font)!;
      const width = (op.glyphs.reduce((sum, placed) => sum + placed.advance, 0) / font.unitsPerEm) * op.size;
      expect(op.x, 'left edge').toBeGreaterThanOrEqual(36 - 0.5);
      expect(op.x + width, 'right edge').toBeLessThanOrEqual(widthPt - 36 + 1.5);
      expect(op.y).toBeGreaterThan(36);
      expect(op.y).toBeLessThanOrEqual(heightPt - 36 + 0.5);
    }
  });

  it('writes a valid one-page PDF of that paper size, with each letter shape stored once', () => {
    const { sheet } = checklistSheet(spec, paper, fonts);
    const options = { title: `${spec.title} (${PAPERS[paper].name})`, author: 'WorldTripMap', subject: checklistSubject(spec), date: new Date(`${CHECKLISTS_CHECKED}T00:00:00Z`) };
    const bytes = sheetToPdf(sheet, fonts, options);
    const s = latin1(bytes);
    expect(s.startsWith('%PDF-1.4\n')).toBe(true);
    expect(s.endsWith('%%EOF\n')).toBe(true);
    expect(s).toContain('/Count 1');
    const media = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(s)!;
    expect(Number(media[1])).toBeCloseTo(PAPERS[paper].widthPt, 2);
    expect(Number(media[2])).toBeCloseTo(PAPERS[paper].heightPt, 2);
    expect(s).not.toContain('/Font');
    expect(s).not.toContain('/Subtype /Image');

    // Every entry in the cross-reference table points at the object it names.
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(s)![1]);
    expect(s.slice(start, start + 4)).toBe('xref');
    const entries = [...s.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    entries.forEach((offset, i) => expect(s.slice(offset, offset + `${i + 1} 0 obj`.length), `object ${i + 1}`).toBe(`${i + 1} 0 obj`));

    // The page places letter shapes far more often than it defines them.
    const forms = (s.match(/\/Subtype \/Form/g) ?? []).length;
    const at = s.indexOf('4 0 obj');
    const length = Number(/\/Length (\d+)/.exec(s.slice(at))![1]);
    const from = s.indexOf('stream\n', at) + 'stream\n'.length;
    const content = inflateSync(Buffer.from(bytes.subarray(from, from + length))).toString('latin1');
    const placed = (content.match(/\/G\d+ Do/g) ?? []).length;
    expect(forms).toBeGreaterThan(60);
    expect(forms).toBeLessThan(400);
    expect(placed).toBeGreaterThan(forms * 4);
    expect(new Set(content.match(/\/G\d+(?= Do)/g)).size).toBe(forms);

    // The same sheet gives the same file, and the file stays small.
    expect(Buffer.from(sheetToPdf(sheet, fonts, options)).equals(Buffer.from(bytes))).toBe(true);
    expect(bytes.length).toBeLessThan(150_000);
  });

  it('is the file in public/downloads, built from today’s data', () => {
    const file = `${root}public${checklistPath(spec, paper)}`;
    expect(existsSync(file), `${file} is missing: run npm run checklists:build`).toBe(true);
    const s = readFileSync(file).toString('latin1');
    expect(s, 'the file is from older data: run npm run checklists:build').toContain(`/Subject (${checklistSubject(spec)})`);
    expect(s).toContain(`/Title ${/^[\x20-\x7e]*$/.test(spec.title) ? `(${spec.title} \\(${PAPERS[paper].name}\\))` : '<FEFF'}`);
    expect(s).toContain('/Author (WorldTripMap)');
    expect(s.endsWith('%%EOF\n')).toBe(true);
    if (hasQpdf) {
      const check = spawnSync('qpdf', ['--check', file], { encoding: 'utf8' });
      expect(check.status, check.stdout + check.stderr).toBe(0);
      expect(check.stdout).toContain('No syntax or stream encoding errors found');
    }
  });
});

describe('the pictures of the sheets', () => {
  it('exist in both sizes for each checklist', () => {
    for (const spec of CHECKLISTS) for (const width of [240, 480]) expect(existsSync(`${root}public/downloads/${spec.id}-${width}.webp`), `${spec.id}-${width}.webp`).toBe(true);
  });

  it('are drawn from the same sheet as the PDF, on white paper', () => {
    const layout = checklistSheet(parksChecklist(), 'letter', fonts);
    const scene = sheetToScene(layout.sheet, fonts, layout.description);
    expect([scene.width, scene.height]).toEqual([612, 792]);
    expect(scene.background).toBe('#ffffff');
    expect(scene.nodes[0]).toMatchObject({ type: 'path', fill: '#ffffff' });
    expect(scene.nodes.length).toBe(layout.sheet.ops.length + 1);
    expect(scene.description).toContain('49 places');
  });
});

describe('the pen', () => {
  it('measures a line exactly as it draws it', () => {
    const pen = new Pen(fonts);
    const style = { font: 'manrope-500', size: 10, fill: '#000000' } as const;
    const width = pen.measure('Saint Vincent and the Grenadines', style);
    expect(pen.text('Saint Vincent and the Grenadines', 0, 20, style)).toBeCloseTo(width, 6);
    expect(width).toBeGreaterThan(120);
    // Right-aligned text ends where it was asked to.
    pen.text('of 195', 300, 20, { ...style, anchor: 'end' });
    const op = pen.ops.at(-1)!;
    if (op.type !== 'text') throw new Error('expected text');
    expect(op.x + pen.measure('of 195', style)).toBeCloseTo(300, 6);
  });

  it('breaks at spaces, and leaves out a character the font cannot draw without failing', () => {
    const pen = new Pen(fonts);
    const style = { font: 'manrope-500', size: 10, fill: '#000000' } as const;
    expect(pen.wrap('Saint Vincent and the Grenadines', style, 90, 2)).toEqual(['Saint Vincent and', 'the Grenadines']);
    expect(pen.wrap('Heard and McDonald Islands and more words here', style, 60, 2)).toHaveLength(2);
    expect(pen.measure('Uapishkᵁ', style)).toBeCloseTo(pen.measure('Uapishk', style), 6);
    expect(pen.fit('A long heading', style, 20, 6).size).toBe(6);
  });
});
