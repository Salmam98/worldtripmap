import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { bytesOf, clickPlace, count, eventNames, expect, openMap, openStudio, pdfInfo, pngInfo, saved, seed, test } from './fixtures';

const SEVEN = { visited: ['CA-ON', 'CA-QC', 'CA-BC', 'CA-AB', 'CA-NS', 'CA-PE', 'CA-YT'], wishlist: ['CA-NL', 'CA-NU'] };
const hasQpdf = spawnSync('qpdf', ['--version']).status === 0;

const preview = (studio: Locator) => studio.locator('.studio__poster');
const markup = (studio: Locator) => preview(studio).evaluate((el) => el.innerHTML);

async function download(page: Page, trigger: Locator) {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  return { name: file.suggestedFilename(), bytes: await bytesOf(file) };
}

test.describe('poster studio', () => {
  test('opens with the places marked on the map, and tidies them out of the address bar', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await clickPlace(page, 'canada', 'CA-ON');
    await clickPlace(page, 'canada', 'CA-BC');
    await expect(count(app)).toHaveText('2');
    const link = app.getByTestId('poster-link');
    await expect(link).toHaveAttribute('href', /\/maps\/canada\/poster\/#v=/);
    await link.click();

    const studio = page.locator('.studio[data-map="canada"]');
    await expect(studio).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    await expect(preview(studio)).toHaveAttribute('aria-label', 'My Canada Journey: a Midnight Atlas poster of Canada: provinces and territories. 2 of 13 provinces and territories explored.');
    await expect(studio.locator('.studio__places')).toContainText('2 of 13 provinces and territories explored.');
    expect(new URL(page.url()).hash).toBe('');
  });

  test('uses a selection handed over in the link when nothing is saved in this browser', async ({ page }) => {
    // "g" is Newfoundland and Labrador alone; this is what a visitor with storage blocked would arrive with.
    const studio = await openStudio(page, 'canada', '#v=g');
    await expect(studio.locator('.studio__places')).toContainText('1 of 13');
  });

  test('redraws the preview for each of the four designs', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': SEVEN });
    const studio = await openStudio(page, 'canada');
    const seen = new Set<string>([await markup(studio)]);
    for (const name of ['Nordic Explorer', 'Modern Cartographer', 'Travel Journal']) {
      await studio.locator('.template-card', { hasText: name }).click();
      await expect(preview(studio)).toHaveAttribute('aria-label', new RegExp(`a ${name} poster`));
      await expect.poll(async () => seen.has(await markup(studio))).toBe(false);
      seen.add(await markup(studio));
    }
    expect(seen.size).toBe(4);
    expect(((await saved(page, 'wtm:v1:poster:canada')) as { template: string }).template).toBe('travel-journal');
    expect(await eventNames(page)).toContain('poster_customized');
  });

  test('applies title, name, dates, caption, colour and lettering as you change them', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': SEVEN });
    const studio = await openStudio(page, 'canada');
    let before = await markup(studio);
    const changed = async (what: string) => {
      await expect.poll(() => markup(studio), { message: `${what} should redraw the poster` }).not.toBe(before);
      before = await markup(studio);
    };

    await studio.getByLabel('Title', { exact: true }).fill('Coast to Coast');
    await expect(preview(studio)).toHaveAttribute('aria-label', /^Coast to Coast: /);
    await changed('the title');
    await studio.getByRole('button', { name: 'Canada Explorer' }).click();
    await expect(studio.getByLabel('Title', { exact: true })).toHaveValue('Canada Explorer');
    await changed('a suggested title');
    await studio.getByLabel('Subtitle (optional)').fill('Seven down, six to go');
    await changed('the subtitle');
    await studio.getByLabel('Name or nickname (optional)').fill('Amina');
    await changed('the name');
    await studio.getByLabel('Dates (optional)').fill('2019–2026');
    await changed('the dates');
    await studio.getByLabel('Caption (optional)').fill('Every road led somewhere good.');
    await changed('the caption');
    await expect(studio.locator('.field__hint', { hasText: 'characters left' })).toContainText('90 characters left');

    await studio.locator('.swatch').nth(2).click();
    await changed('the colour');
    await studio.locator('.segmented__option', { hasText: 'Script' }).click();
    await changed('the lettering');
    await studio.getByLabel('Labels on the map').uncheck();
    await changed('hiding labels');
    await studio.getByLabel('List of provinces and territories').uncheck();
    await changed('hiding the list');
    await studio.getByLabel(/Bucket-list places/).check();
    await changed('showing the bucket list');
    await studio.getByLabel('Small worldtripmap.com mark').uncheck();
    await changed('hiding the site mark');
    await studio.locator('.chip--radio', { hasText: 'Halfway There' }).click();
    await changed('the achievement seal');
    await expect(studio.getByLabel('Name or nickname (optional)')).toHaveValue('Amina');
  });

  test('offers an achievement seal only for achievements that were earned', async ({ page }) => {
    const studio = await openStudio(page, 'canada');
    await expect(studio.getByText('Seals appear here as you earn them.')).toBeVisible();
    await expect(studio.locator('.chip--radio')).toHaveCount(0);
    await expect(studio.locator('.notice--warn')).toContainText('Nothing is marked yet');

    await studio.locator('.studio__list > summary').click();
    await studio.locator('.place', { hasText: 'Ontario' }).locator('.place__main').click();
    await expect(studio.locator('.chip--radio')).toHaveText(['None', 'First Adventure']);
    await expect(studio.locator('.notice--warn')).toHaveCount(0);
  });

  test('keeps every word after a reload, up to each field’s limit', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': SEVEN });
    let studio = await openStudio(page, 'canada');
    const title = 'T'.repeat(60);
    const caption = 'A caption that is comfortably longer than forty characters, to prove nothing trims it early.';
    await studio.getByLabel('Title', { exact: true }).fill(title);
    await studio.getByLabel('Subtitle (optional)').fill('A subtitle that is also longer than forty characters in total');
    await studio.getByLabel('Caption (optional)').fill(caption);
    await expect(studio.getByLabel('Title', { exact: true })).toHaveValue('T'.repeat(48));

    await page.reload();
    studio = page.locator('.studio[data-map="canada"]');
    await expect(studio).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    await expect(studio.getByLabel('Title', { exact: true })).toHaveValue('T'.repeat(48));
    await expect(studio.getByLabel('Subtitle (optional)')).toHaveValue('A subtitle that is also longer than forty characters in total');
    await expect(studio.getByLabel('Caption (optional)')).toHaveValue(caption);
  });

  test('treats typed markup as plain letters, never as page content', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': SEVEN });
    const studio = await openStudio(page, 'canada');
    page.on('dialog', () => {
      throw new Error('A script typed into the poster ran.');
    });
    const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    await studio.getByLabel('Title', { exact: true }).fill(hostile);
    await studio.getByLabel('Name or nickname (optional)').fill('"><svg onload=alert(3)>');
    await studio.getByLabel('Caption (optional)').fill(hostile);
    await expect(preview(studio)).toHaveAttribute('aria-label', /^<img src=x onerror=alert\(1\)>/);
    await page.waitForTimeout(400);
    const html = await markup(studio);
    expect(html).not.toMatch(/<script|<img|onerror|onload/i);
    expect(await preview(studio).locator('svg > *').count()).toBeGreaterThan(20);
    expect(await page.locator('.studio__poster script, .studio__poster img').count()).toBe(0);
  });

  test('draws a name in another alphabet using the device’s own fonts', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': SEVEN });
    const studio = await openStudio(page, 'canada');
    await expect(preview(studio).locator('image')).toHaveCount(0);
    await studio.getByLabel('Title', { exact: true }).fill('আমার কানাডা');
    await expect(preview(studio).locator('image')).toHaveCount(1);
    await expect(preview(studio).locator('image')).toHaveAttribute('href', /^data:image\/png;base64,/);
    const png = await download(page, page.getByTestId('download-png'));
    expect(pngInfo(png.bytes)).toMatchObject({ width: 1080, height: 1350 });
  });

  test('can change the marked places without leaving the studio', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': { visited: ['CA-ON'], wishlist: [] } });
    const studio = await openStudio(page, 'canada');
    await studio.locator('.studio__list > summary').click();
    await studio.locator('.place', { hasText: 'Manitoba' }).locator('.place__main').click();
    await expect(studio.locator('.studio__places')).toContainText('2 of 13');
    await expect(preview(studio)).toHaveAttribute('aria-label', /2 of 13 provinces and territories explored\.$/);
    expect(((await saved(page, 'wtm:v1:map:canada')) as { visited: string[] }).visited.sort()).toEqual(['CA-MB', 'CA-ON']);
  });
});

test.describe('downloads', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': SEVEN, 'wtm:v1:poster:canada': { name: 'Amina', dates: '2019–2026', badge: 'halfway-there' } });
  });

  test('PNG: a real image file at the size shown, for the 4:5 post', async ({ page }) => {
    const studio = await openStudio(page, 'canada');
    const png = await download(page, page.getByTestId('download-png'));
    expect(png.name).toBe('worldtripmap-canada-midnight-atlas-1080x1350.png');
    expect(pngInfo(png.bytes)).toEqual({ width: 1080, height: 1350, pixelsPerMetre: null });
    expect(png.bytes.length).toBeGreaterThan(40_000);
    await expect(studio.locator('.studio__result')).toContainText('worldtripmap-canada-midnight-atlas-1080x1350.png');
    await expect(studio.locator('.studio__result')).toContainText('1,080 × 1,350 px');
    await expect(page.locator('.toast')).toContainText('Saved worldtripmap-canada-midnight-atlas-1080x1350.png');
    expect(await eventNames(page)).toContain('png_downloaded');
  });

  test('PNG: the larger size is twice the pixels', async ({ page }) => {
    const studio = await openStudio(page, 'canada');
    await studio.locator('.check', { hasText: '2,160 × 2,700 px' }).click();
    const png = await download(page, page.getByTestId('download-png'));
    expect(png.name).toBe('worldtripmap-canada-midnight-atlas-2160x2700.png');
    expect(pngInfo(png.bytes)).toMatchObject({ width: 2160, height: 2700 });
  });

  test('PNG: story and pin shapes have their own sizes and no PDF', async ({ page }) => {
    const studio = await openStudio(page, 'canada');
    await studio.locator('.format', { hasText: 'Story' }).click();
    await expect(studio.getByTestId('download-pdf')).toHaveCount(0);
    await expect(studio.locator('.studio__nopdf')).toBeVisible();
    const story = await download(page, page.getByTestId('download-png'));
    expect(pngInfo(story.bytes)).toMatchObject({ width: 1080, height: 1920 });

    await studio.locator('.format', { hasText: 'Pin' }).click();
    const pin = await download(page, page.getByTestId('download-png'));
    expect(pin.name).toBe('worldtripmap-canada-midnight-atlas-1000x1500.png');
    expect(pngInfo(pin.bytes)).toMatchObject({ width: 1000, height: 1500 });
  });

  test('PNG: print shapes carry their print resolution', async ({ page }) => {
    const studio = await openStudio(page, 'canada');
    await studio.locator('.format', { hasText: 'Poster, upright' }).click();
    const png = await download(page, page.getByTestId('download-png'));
    // 300 dots per inch is 11,811 per metre.
    expect(pngInfo(png.bytes)).toEqual({ width: 2700, height: 3600, pixelsPerMetre: 11811 });
  });

  test('PDF: a valid vector file at 8 × 10 in, with the title and name recorded', async ({ page }, testInfo) => {
    await openStudio(page, 'canada');
    const pdf = await download(page, page.getByTestId('download-pdf'));
    expect(pdf.name).toBe('worldtripmap-canada-midnight-atlas-8x10in.pdf');
    const info = pdfInfo(pdf.bytes);
    expect(info.width).toBeCloseTo(576, 1);
    expect(info.height).toBeCloseTo(720, 1);
    expect(info.text).toContain('/Title (My Canada Journey)');
    expect(info.text).toContain('/Author (Amina)');
    expect(info.text).not.toContain('/Font');
    expect(info.text).not.toContain('/Subtype /Image');
    expect(await eventNames(page)).toContain('pdf_downloaded');
    if (hasQpdf) {
      const file = testInfo.outputPath('poster.pdf');
      writeFileSync(file, pdf.bytes);
      const check = spawnSync('qpdf', ['--check', file], { encoding: 'utf8' });
      expect(check.status, check.stdout + check.stderr).toBe(0);
    }
  });

  test('PDF: 18 × 24 in poster, with 3 mm bleed when asked for', async ({ page }) => {
    const studio = await openStudio(page, 'canada');
    await studio.locator('.format', { hasText: 'Poster, upright' }).click();
    await expect(page.getByTestId('download-pdf')).toHaveText(/Download PDF, 18 × 24 in/);
    const plain = pdfInfo((await download(page, page.getByTestId('download-pdf'))).bytes);
    expect(plain.width).toBeCloseTo(1296, 1);
    expect(plain.height).toBeCloseTo(1728, 1);
    expect(plain.trim).toEqual([0, 0, 1296, 1728]);

    await studio.getByLabel(/Add 3 mm bleed to the PDF/).check();
    const bled = await download(page, page.getByTestId('download-pdf'));
    expect(bled.name).toBe('worldtripmap-canada-midnight-atlas-18x24in.pdf');
    const info = pdfInfo(bled.bytes);
    const bleed = (3 * 72) / 25.4;
    expect(info.width).toBeCloseTo(1296 + 2 * bleed, 1);
    expect(info.height).toBeCloseTo(1728 + 2 * bleed, 1);
    expect(info.trim![0]).toBeCloseTo(bleed, 2);
    expect(info.trim![2] - info.trim![0]).toBeCloseTo(1296, 1);
    await expect(studio.locator('.studio__result')).toContainText('18 × 24 in, vector PDF with 3 mm bleed');
  });

  test('PDF: A3 in both directions', async ({ page }) => {
    const studio = await openStudio(page, 'canada');
    const mm = 72 / 25.4;
    await studio.locator('.format', { hasText: 'A3, upright' }).click();
    const upright = pdfInfo((await download(page, page.getByTestId('download-pdf'))).bytes);
    expect(upright.width).toBeCloseTo(297 * mm, 1);
    expect(upright.height).toBeCloseTo(420 * mm, 1);
    await studio.locator('.format', { hasText: 'A3, wide' }).click();
    const wide = await download(page, page.getByTestId('download-pdf'));
    expect(wide.name).toBe('worldtripmap-canada-midnight-atlas-a3.pdf');
    expect(pdfInfo(wide.bytes).width).toBeCloseTo(420 * mm, 1);
  });

  test('Share image saves the picture when the browser cannot share files', async ({ page }) => {
    const studio = await openStudio(page, 'canada');
    const png = await download(page, studio.getByTestId('share-image'));
    expect(pngInfo(png.bytes)).toMatchObject({ width: 1080, height: 1350 });
    await expect(page.locator('.toast')).toContainText('This browser cannot share files directly, so the image was saved instead.');
    expect(await eventNames(page)).toContain('share_initiated');
  });
});

test.describe('posters of the other maps', () => {
  test('world: wide print as PNG and PDF', async ({ page }) => {
    test.slow();
    await seed(page, { 'wtm:v1:map:world': { visited: ['CAN', 'USA', 'MEX', 'BRA', 'FRA', 'JPN', 'AUS', 'KEN', 'IND', 'GRL'], wishlist: ['NZL'] } });
    const studio = await openStudio(page, 'world');
    await expect(preview(studio)).toHaveAttribute('aria-label', 'Places I’ve Explored: a Midnight Atlas poster of World: countries. 9 of 195 countries explored.');
    await studio.locator('.format', { hasText: 'Poster, wide' }).click();
    const png = await download(page, page.getByTestId('download-png'));
    expect(pngInfo(png.bytes)).toMatchObject({ width: 3600, height: 2700 });
    const pdf = await download(page, page.getByTestId('download-pdf'));
    expect(pdf.name).toBe('worldtripmap-world-midnight-atlas-24x18in.pdf');
    expect(pdfInfo(pdf.bytes).width).toBeCloseTo(1728, 1);
  });

  test('cities: every design draws, and the poster downloads', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada-cities': { visited: ['toronto', 'montreal', 'vancouver', 'halifax', 'calgary'], wishlist: ['whitehorse'] } });
    const studio = await openStudio(page, 'canada-cities');
    await expect(preview(studio)).toHaveAttribute('aria-label', /5 of 45 cities explored\.$/);
    await expect(studio.getByLabel('Names beside explored cities')).toBeChecked();
    for (const name of ['Nordic Explorer', 'Modern Cartographer', 'Travel Journal']) {
      await studio.locator('.template-card', { hasText: name }).click();
      await expect(preview(studio)).toHaveAttribute('aria-label', new RegExp(`a ${name} poster`));
    }
    const png = await download(page, page.getByTestId('download-png'));
    expect(png.name).toBe('worldtripmap-canada-cities-travel-journal-1080x1350.png');
  });
});
