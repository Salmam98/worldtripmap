/**
 * Writes the printable checklists the guides link to:
 *
 *   public/downloads/countries-visited-checklist-{letter,a4}.pdf
 *   public/downloads/canada-national-parks-checklist-{letter,a4}.pdf
 *   public/downloads/*-{240,480}.webp     a picture of each Letter sheet, for the guide page
 *
 * Run with: npm run checklists:build. The output is committed, so a normal site build does not
 * need it. Run it again whenever a country, territory or park on the map changes: a unit test
 * fails until the files match the data.
 *
 * Pass a folder as the first argument to also get a PNG of each sheet there, for a quick look.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { CHECKLIST_FONTS, checklistItemCount, checklistSheet, PAPERS } from '../../src/lib/guides/checklist-pdf';
import { CHECKLISTS, CHECKLISTS_CHECKED, checklistPath, checklistSubject, PAPER_IDS } from '../../src/lib/guides/checklists';
import { sheetToPdf, sheetToScene } from '../../src/lib/guides/sheet';
import { loadFonts } from '../../src/lib/poster/fonts';
import { sceneToSvg } from '../../src/lib/poster/render-svg';

const pictures = process.argv[2];
const fonts = await loadFonts(CHECKLIST_FONTS);
await mkdir('public/downloads', { recursive: true });
if (pictures) await mkdir(pictures, { recursive: true });

for (const spec of CHECKLISTS) {
  for (const paper of PAPER_IDS) {
    const layout = checklistSheet(spec, paper, fonts);
    const items = checklistItemCount(spec);
    if (layout.boxes !== items) throw new Error(`${spec.id} (${paper}): ${layout.boxes} boxes drawn for ${items} items.`);
    if (layout.bottom > layout.limit + 0.5) throw new Error(`${spec.id} (${paper}): the list runs into the footer.`);
    const bytes = sheetToPdf(layout.sheet, fonts, {
      title: `${spec.title} (${PAPERS[paper].name})`,
      author: 'WorldTripMap',
      subject: checklistSubject(spec),
      // A fixed date, so building twice gives the same file.
      date: new Date(`${CHECKLISTS_CHECKED}T00:00:00Z`),
    });
    const scene = sheetToScene(layout.sheet, fonts, layout.description);
    const file = `public${checklistPath(spec, paper)}`;
    await writeFile(file, bytes);
    console.log(`${file}  ${items} items at ${layout.size} pt, ${Math.round(bytes.length / 1024)} KB`);
    // A small picture of the Letter sheet, shown beside the links to the PDF.
    if (paper === 'letter') {
      for (const width of [240, 480]) {
        const svg = sceneToSvg(scene, { pixelWidth: width * 2 });
        await sharp(Buffer.from(svg)).resize({ width }).webp({ quality: 76, effort: 6 }).toFile(`public/downloads/${spec.id}-${width}.webp`);
      }
    }
    if (pictures) {
      const svg = sceneToSvg(scene, { pixelWidth: 1600 });
      await sharp(Buffer.from(svg)).png().toFile(join(pictures, `${spec.id}-${paper}.png`));
    }
  }
}
