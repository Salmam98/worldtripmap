import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { clickPlace, count, expect, layoutShift, openMap, openStudio, pointOf, revealRow, saved, seed, shape, test, tick } from './fixtures';

/**
 * The second level of the Canada map: the places inside each province and territory. Ticking them
 * is how a visitor says how much of a province they have seen, and where the percentages for each
 * province and for Canada come from.
 */

const placesLine = (app: Locator, id: string) => app.getByTestId(`places-${id}`);
const total = (app: Locator) => app.getByTestId('places-total');

async function openPlaces(page: Page, app: Locator, name: string, id: string): Promise<Locator> {
  await revealRow(app, name);
  await placesLine(app, id).click();
  const dialog = page.getByRole('dialog', { name: `Places in ${name}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

const spot = (dialog: Locator, name: string) => dialog.locator('.spot', { has: dialog.page().locator('.spot__name', { hasText: new RegExp(`^${name}$`) }) });

test.describe('places inside a province', () => {
  test('every province says how many places it has, and opens them as a list of four kinds', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await expect(app.locator('.place__detail')).toHaveCount(13);
    await expect(placesLine(app, 'CA-ON')).toHaveText('0 of 31 places');
    await expect(placesLine(app, 'CA-PE')).toHaveText('0 of 6 places');
    await expect(total(app)).toContainText('0% of Canada by places: 0 of 178 ticked');
    // With nothing ticked the card says how to start, and lists no province.
    await expect(total(app)).toContainText('Open a province or territory in the list and tick the cities, parks and landmarks you have been to.');
    await expect(app.getByTestId('places-breakdown')).toHaveCount(0);

    const dialog = await openPlaces(page, app, 'Ontario', 'CA-ON');
    await expect(dialog.getByTestId('spots-count')).toHaveText('0 of 31');
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(['Cities', 'Well-known places', 'National parks', 'World Heritage Sites']);
    await expect(dialog.getByRole('checkbox')).toHaveCount(31);
    await expect(spot(dialog, 'Niagara Falls')).toBeVisible();
    await expect(spot(dialog, 'Rouge')).toContainText('National urban park');
    await expect(dialog).toContainText('They are not a share of land area');
  });

  test('someone who has only been to Toronto gets 3% of Ontario, and Ontario is marked as explored', async ({ page }) => {
    const app = await openMap(page, 'canada');
    const dialog = await openPlaces(page, app, 'Ontario', 'CA-ON');
    await spot(dialog, 'Toronto').click();
    await expect(dialog.getByTestId('spots-count')).toHaveText('1 of 31');
    await expect(dialog.locator('.spots__summary')).toContainText('3% of our list for Ontario');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();

    await expect(placesLine(app, 'CA-ON')).toHaveText('1 of 31 places · 3%');
    await expect(total(app)).toContainText('<1% of Canada by places: 1 of 178 ticked');
    await expect(app.getByTestId('places-breakdown').locator('li')).toHaveText(['Ontario 1 of 31 places 3%']);
    // Having been to Toronto means having been to Ontario.
    await expect(count(app)).toHaveText('1');
    await expect(shape(app, 'CA-ON')).toHaveAttribute('aria-checked', 'true');
    await expect(shape(app, 'CA-ON')).toHaveAttribute('aria-label', 'Ontario: Explored, 1 of 31 places');
    expect(((await saved(page, 'wtm:v1:map:canada')) as { visited: string[] }).visited).toEqual(['CA-ON']);

    await page.reload();
    const again = page.locator('.mapapp[data-map="canada"]');
    await expect(again).toHaveAttribute('data-ready', 'true');
    await expect(placesLine(again, 'CA-ON')).toHaveText('1 of 31 places · 3%');
  });

  test('marking a province never ticks its places', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Ontario');
    await tick(app, 'Quebec');
    await expect(count(app)).toHaveText('2');
    await expect(placesLine(app, 'CA-ON')).toHaveText('0 of 31 places');
    await expect(total(app)).toContainText('0 of 178 ticked');
    expect(await saved(page, 'wtm:v1:places:canada')).toBeNull();
    expect(await saved(page, 'wtm:v1:map:canada-cities')).toBeNull();
  });

  test('each province gets its own percentage, and they add up to one for Canada', async ({ page }) => {
    await seed(page, {
      'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-AB', 'CA-PE'], wishlist: [] },
      'wtm:v1:map:canada-cities': { visited: ['toronto', 'ottawa-gatineau', 'calgary', 'charlottetown'], wishlist: [] },
      'wtm:v1:places:canada': { visited: ['niagara-falls', 'cn-tower', 'banff', 'lake-louise', 'green-gables', 'confederation-bridge', 'basin-head', 'prince-edward-island-national-park', 'pituamkek'] },
    });
    const app = await openMap(page, 'canada');
    await expect(placesLine(app, 'CA-ON')).toHaveText('4 of 31 places · 13%');
    await expect(placesLine(app, 'CA-AB')).toHaveText('3 of 17 places · 18%');
    await expect(placesLine(app, 'CA-PE')).toHaveText('6 of 6 places · 100%');
    await expect(placesLine(app, 'CA-QC')).toHaveText('0 of 20 places');
    await expect(total(app)).toContainText('7% of Canada by places: 13 of 178 ticked');
    await expect(total(app).getByRole('progressbar')).toHaveAttribute('aria-valuetext', '13 of 178, 7%');
    // The result, province by province, in the order of the list. Quebec has nothing ticked, so it is not in it.
    const rows = app.getByTestId('places-breakdown').locator('li');
    await expect(rows.locator('.progress__inside-name')).toHaveText(['Prince Edward Island', 'Ontario', 'Alberta']);
    await expect(rows.locator('.progress__inside-percent')).toHaveText(['100%', '13%', '18%']);
    await expect(rows).toHaveText(['Prince Edward Island 6 of 6 places 100%', 'Ontario 4 of 31 places 13%', 'Alberta 3 of 17 places 18%']);
  });

  test('a city is one mark: ticked on the cities map it is ticked here, and unticked here it is unmarked there', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada-cities': { visited: ['halifax', 'toronto'], wishlist: ['calgary'] } });
    const app = await openMap(page, 'canada');
    await expect(placesLine(app, 'CA-NS')).toHaveText('1 of 12 places · 8%');
    const dialog = await openPlaces(page, app, 'Nova Scotia', 'CA-NS');
    await expect(spot(dialog, 'Halifax').getByRole('checkbox')).toBeChecked();
    await spot(dialog, 'Halifax').click();
    await spot(dialog, 'Peggy’s Cove').click();
    await expect(dialog.getByTestId('spots-count')).toHaveText('1 of 12');
    const cities = (await saved(page, 'wtm:v1:map:canada-cities')) as { visited: string[]; wishlist: string[] };
    expect(cities.visited).toEqual(['toronto']);
    expect(cities.wishlist).toEqual(['calgary']);
    expect(((await saved(page, 'wtm:v1:places:canada')) as { visited: string[] }).visited).toEqual(['peggys-cove']);
  });

  test('marking a province on the map offers its places straight away, without covering the map', async ({ page }) => {
    const app = await openMap(page, 'canada');
    const prompt = app.getByTestId('places-prompt');
    await expect(prompt).toHaveText('Mark a province or territory, then choose the places you have been to inside it.');
    const before = (await prompt.boundingBox())!;
    await clickPlace(page, 'canada', 'CA-QC');
    await expect(count(app)).toHaveText('1');
    await expect(prompt).toContainText('Quebec · 0 of 20 places');
    // The line was already there, so marking a province moves nothing, and no message sits over the map.
    expect((await prompt.boundingBox())!.height).toBe(before.height);
    await expect(page.locator('.toast')).toHaveCount(0);
    await prompt.getByRole('button', { name: 'Choose places in Quebec' }).click();
    const dialog = page.getByRole('dialog', { name: 'Places in Quebec' });
    await expect(dialog).toBeVisible();
    await spot(dialog, 'Old Québec').click();
    await expect(dialog.getByTestId('spots-count')).toHaveText('1 of 20');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(prompt).toContainText('Quebec · 1 of 20 places · 5%');

    // Unmarking the province takes the offer away again.
    await clickPlace(page, 'canada', 'CA-QC');
    await expect(prompt).toHaveText('Mark a province or territory, then choose the places you have been to inside it.');
  });

  test('a place can be found by another name, and an empty search says so', async ({ page }) => {
    const app = await openMap(page, 'canada');
    const dialog = await openPlaces(page, app, 'Ontario', 'CA-ON');
    const search = dialog.getByRole('searchbox', { name: 'Search places in Ontario' });
    await search.fill('tobermory');
    await expect(dialog.getByRole('checkbox')).toHaveCount(1);
    await expect(spot(dialog, 'Bruce Peninsula')).toBeVisible();
    await search.fill('niagara');
    await expect(dialog.locator('.spot__name')).toHaveText(['St. Catharines–Niagara', 'Niagara Falls', 'Niagara-on-the-Lake']);
    await search.fill('zzzz');
    await expect(dialog).toContainText('Nothing matches “zzzz”.');
    await dialog.getByRole('button', { name: 'Show all places' }).click();
    await expect(dialog.getByRole('checkbox')).toHaveCount(31);
  });

  test('the list of places closes with Escape and gives focus back', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Escape is a keyboard interaction.');
    const app = await openMap(page, 'canada');
    await revealRow(app, 'Manitoba');
    await placesLine(app, 'CA-MB').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Places in Manitoba' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(placesLine(app, 'CA-MB')).toBeFocused();
  });

  test('Start over unticks the places as well, and Undo brings everything back', async ({ page }) => {
    await seed(page, {
      'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-AB'], wishlist: [] },
      'wtm:v1:map:canada-cities': { visited: ['toronto'], wishlist: [] },
      'wtm:v1:places:canada': { visited: ['banff', 'cn-tower'] },
    });
    const app = await openMap(page, 'canada');
    await expect(total(app)).toContainText('3 of 178 ticked');
    await app.getByRole('button', { name: 'Start over' }).click();
    const confirm = page.getByRole('dialog', { name: 'Clear this map?' });
    await expect(confirm).toContainText('This removes 2 explored places from this device. It also unticks the 3 places you chose inside them. You can undo it straight afterwards.');
    await confirm.getByRole('button', { name: 'Clear map' }).click();
    await expect(count(app)).toHaveText('0');
    await expect(total(app)).toContainText('0 of 178 ticked');
    await expect(placesLine(app, 'CA-ON')).toHaveText('0 of 31 places');
    expect(await saved(page, 'wtm:v1:places:canada')).toBeNull();
    expect(((await saved(page, 'wtm:v1:map:canada-cities')) as { visited: string[] }).visited).toEqual([]);

    await page.locator('.toast__action').click();
    await expect(count(app)).toHaveText('2');
    await expect(total(app)).toContainText('3 of 178 ticked');
    await expect(placesLine(app, 'CA-ON')).toHaveText('2 of 31 places · 6%');
    expect(((await saved(page, 'wtm:v1:map:canada-cities')) as { visited: string[] }).visited).toEqual(['toronto']);
  });

  test('places ticked in a province that is not marked are offered, never added on their own', async ({ page }) => {
    await seed(page, { 'wtm:v1:places:canada': { visited: ['banff'] } });
    const app = await openMap(page, 'canada');
    await expect(count(app)).toHaveText('0');
    const offer = app.locator('.rollup');
    await expect(offer).toContainText('The places you have ticked are in Alberta, which is not marked as explored. Nothing is added unless you say so.');
    await offer.getByRole('button', { name: 'Add Alberta' }).click();
    await expect(count(app)).toHaveText('1');
    await expect(offer).toHaveCount(0);
  });

  test('the small map on the home page stays simple', async ({ page }) => {
    await page.goto('/');
    await page.locator('#try').scrollIntoViewIfNeeded();
    const app = page.locator('.mapapp[data-map="canada"]');
    await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    await expect(app.locator('.place__detail')).toHaveCount(0);
    await expect(app.getByTestId('places-total')).toHaveCount(0);
  });

  test('the world and cities maps have no second level', async ({ page }) => {
    for (const slug of ['world', 'canada-cities'] as const) {
      const app = await openMap(page, slug);
      await expect(app.locator('.place__detail')).toHaveCount(0);
      await expect(app.getByTestId('places-total')).toHaveCount(0);
    }
  });
});

test.describe('places: access and layout', () => {
  test('the list of places has no detectable WCAG 2.2 AA violations', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': { visited: ['CA-BC'], wishlist: [] }, 'wtm:v1:places:canada': { visited: ['whistler', 'yoho'] } });
    const app = await openMap(page, 'canada');
    await openPlaces(page, app, 'British Columbia', 'CA-BC');
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.help} ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });

  test('ticking a place is announced, with the new count for that province', async ({ page }) => {
    const app = await openMap(page, 'canada');
    const dialog = await openPlaces(page, app, 'Yukon', 'CA-YT');
    await spot(dialog, 'Whitehorse').click();
    await expect(app.locator('p[role="status"][aria-live="polite"]')).toHaveText('Whitehorse: ticked. 1 of 9 places in Yukon.');
  });

  test('nothing moves while the map loads for someone with places ticked', async ({ page }) => {
    await seed(page, {
      'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-QC', 'CA-BC'], wishlist: [] },
      'wtm:v1:map:canada-cities': { visited: ['toronto', 'montreal', 'vancouver'], wishlist: [] },
      'wtm:v1:places:canada': { visited: ['niagara-falls', 'old-quebec', 'whistler'] },
    });
    await page.route('**/_astro/*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.continue();
    });
    await openMap(page, 'canada');
    const { total: shift, moved } = await layoutShift(page);
    expect(shift, `layout shift ${shift.toFixed(4)}; moved: ${moved.join(', ')}`).toBeLessThan(0.01);
  });

  test('on the narrowest phones a long province name and its places still fit', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Checked once, in the phone profile.');
    await page.setViewportSize({ width: 320, height: 640 });
    await seed(page, { 'wtm:v1:places:canada': { visited: ['signal-hill', 'cape-spear', 'gros-morne'] } });
    const app = await openMap(page, 'canada');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const dialog = await openPlaces(page, app, 'Newfoundland and Labrador', 'CA-NL');
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    // Nothing inside the list is wider than the list.
    expect(await dialog.locator('.dialog__body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
});

test.describe('provinces coloured by their percentage', () => {
  // Ontario 1 of 31, Alberta 3 of 17, Prince Edward Island 6 of 6, Quebec marked with nothing ticked.
  const spread = {
    'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-AB', 'CA-PE', 'CA-QC'], wishlist: ['CA-YT'] },
    'wtm:v1:map:canada-cities': { visited: ['toronto', 'calgary', 'charlottetown'], wishlist: [] },
    'wtm:v1:places:canada': { visited: ['banff', 'jasper', 'green-gables', 'confederation-bridge', 'basin-head', 'prince-edward-island-national-park', 'pituamkek'] },
  };

  /** How a province is painted right now: its fill and the colour of its short name, as the browser resolves them. */
  async function paint(app: Locator, id: string): Promise<{ fill: number[]; label: number[]; tone: string | null }> {
    return shape(app, id).evaluate((el) => {
      const rgb = (value: string) => (value.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const label = (el as SVGElement).ownerSVGElement!.querySelector(`.map__label[data-for="${el.getAttribute('data-id')}"]`)!;
      return { fill: rgb(getComputedStyle(el).fill), label: rgb(getComputedStyle(label).fill), tone: el.getAttribute('data-tone') };
    });
  }
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrastOf = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  const scale = (app: Locator) => app.getByTestId('legend-scale');
  const FOREST = [49, 92, 76];

  test('a marked province is darker the more of its places are ticked, and the key shows the scale', async ({ page }) => {
    await seed(page, spread);
    const app = await openMap(page, 'canada');
    const [quebec, ontario, alberta, island, manitoba] = await Promise.all(['CA-QC', 'CA-ON', 'CA-AB', 'CA-PE', 'CA-MB'].map((id) => paint(app, id)));

    // Everything ticked is the full forest green; nothing ticked is the lightest tone, still darker than unmarked land.
    expect(island.fill).toEqual(FOREST);
    expect(island.tone).toBe('#315c4c');
    expect(manitoba.tone).toBeNull();
    const order = [manitoba, quebec, ontario, alberta, island].map((p) => luminance(p.fill));
    expect([...order].sort((a, b) => b - a), 'lightest to darkest: unmarked, 0%, 3%, 18%, 100%').toEqual(order);
    expect(new Set(order.map((v) => v.toFixed(4))).size).toBe(5);
    expect(contrastOf(quebec.fill, manitoba.fill)).toBeGreaterThanOrEqual(1.5);

    // The short name on each province reads on its own tone: dark on the pale ones, light on the deep ones.
    for (const province of [quebec, ontario, alberta, island]) expect(contrastOf(province.fill, province.label)).toBeGreaterThanOrEqual(4.5);
    expect(luminance(quebec.label)).toBeLessThan(0.1);
    expect(luminance(island.label)).toBeGreaterThan(0.8);

    // The results list carries the same tone beside each province, so numbers and colours can be matched.
    const chip = (name: string) =>
      app
        .getByTestId('places-breakdown')
        .locator('li', { hasText: name })
        .locator('.progress__inside-tone')
        .evaluate((el) => (getComputedStyle(el).backgroundColor.match(/\d+/g) ?? []).slice(0, 3).map(Number));
    expect(await chip('Alberta')).toEqual(alberta.fill);
    expect(await chip('Ontario')).toEqual(ontario.fill);
    expect(await chip('Prince Edward Island')).toEqual(FOREST);

    await expect(scale(app)).toHaveText('Explored: darker means more places ticked');
    await expect(scale(app).locator('.legend__ramp i')).toHaveCount(5);
    await expect(app.locator('.legend li')).toHaveText(['Explored: darker means more places ticked', 'Want to go', 'Not marked']);
    // A bucket-list province keeps its hatching.
    expect((await shape(app, 'CA-YT').getAttribute('style')) ?? '').toMatch(/fill:\s*url\(/);
    expect(await shape(app, 'CA-YT').getAttribute('data-tone')).toBeNull();
  });

  test('until a place is ticked every marked province keeps the one colour, and the first tick turns the scale on', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Ontario');
    await tick(app, 'Quebec');
    await expect.poll(async () => (await paint(app, 'CA-ON')).fill).toEqual(FOREST);
    await expect.poll(async () => (await paint(app, 'CA-QC')).fill).toEqual(FOREST);
    await expect(scale(app)).toHaveCount(0);
    await expect(app.locator('.legend li')).toHaveText(['Explored', 'Want to go', 'Not marked']);

    const dialog = await openPlaces(page, app, 'Ontario', 'CA-ON');
    await spot(dialog, 'Toronto').click();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(scale(app)).toBeVisible();
    // Ontario has one place ticked and Quebec none, so Ontario is now the darker of the two, and neither is the full green.
    await expect.poll(async () => luminance((await paint(app, 'CA-ON')).fill) < luminance((await paint(app, 'CA-QC')).fill)).toBe(true);
    await expect.poll(async () => luminance((await paint(app, 'CA-ON')).fill) > luminance(FOREST)).toBe(true);

    const again = await openPlaces(page, app, 'Ontario', 'CA-ON');
    await spot(again, 'Toronto').click();
    await again.getByRole('button', { name: 'Done' }).click();
    await expect(scale(app)).toHaveCount(0);
    await expect.poll(async () => (await paint(app, 'CA-QC')).fill).toEqual(FOREST);
  });

  test('a friend’s shared map is never shaded with my places', async ({ page }) => {
    await seed(page, spread);
    const app = await openMap(page, 'canada', '#v=DEA&n=Salman');
    await expect(page.locator('.friend-banner')).toBeVisible();
    await expect(app.locator('.map__svg [data-tone]')).toHaveCount(0);
    await expect(scale(app)).toHaveCount(0);
    await page.locator('.friend-banner').getByRole('radio', { name: 'My map' }).check();
    await expect(scale(app)).toBeVisible();
    await expect(app.locator('.map__svg [data-tone]')).toHaveCount(4);
    await page.locator('.friend-banner').getByRole('radio', { name: 'Compare' }).check();
    await expect(app.locator('.map__svg [data-tone]')).toHaveCount(0);
  });

  test('the pointer still darkens a shaded province', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Hovering needs a mouse.');
    await seed(page, spread);
    const app = await openMap(page, 'canada');
    const before = (await paint(app, 'CA-ON')).fill;
    const { x, y } = await pointOf(page, 'canada', 'CA-ON');
    await page.mouse.move(x, y);
    await expect.poll(async () => luminance((await paint(app, 'CA-ON')).fill) < luminance(before)).toBe(true);
  });

  test('the shaded map and its key have no detectable WCAG 2.2 AA violations', async ({ page }) => {
    await seed(page, spread);
    await openMap(page, 'canada');
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.help} ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });

  test('the key fits beside the map on the narrowest phones', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Checked once, in the phone profile.');
    await page.setViewportSize({ width: 320, height: 640 });
    await seed(page, spread);
    const app = await openMap(page, 'canada');
    await expect(scale(app)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const box = (await app.locator('.legend').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  });
});

test.describe('place percentages on the poster', () => {
  const marks = {
    'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-AB'], wishlist: [] },
    'wtm:v1:map:canada-cities': { visited: ['toronto'], wishlist: [] },
    'wtm:v1:places:canada': { visited: ['niagara-falls', 'banff'] },
  };
  const preview = (studio: Locator) => studio.locator('.studio__poster');

  test('the poster carries the Canada percentage, and it can be switched off', async ({ page }) => {
    await seed(page, marks);
    const studio = await openStudio(page, 'canada');
    await expect(preview(studio)).toHaveAttribute('aria-label', /2 of 13 provinces and territories explored\. 3 of 178 places, 2% of Canada\.$/);
    await expect(studio.locator('.studio__inside')).toContainText('3 of 178 places ticked inside them.');

    const option = studio.getByRole('checkbox', { name: /Percentages from places \(2% of Canada\)/ });
    await expect(option).toBeChecked();
    const withPercentages = await preview(studio).innerHTML();
    await option.uncheck();
    await expect(preview(studio)).toHaveAttribute('aria-label', /2 of 13 provinces and territories explored\.$/);
    expect(await preview(studio).innerHTML()).not.toBe(withPercentages);

    await page.reload();
    const again = page.locator('.studio[data-map="canada"]');
    await expect(again).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    await expect(again.getByRole('checkbox', { name: /Percentages from places/ })).not.toBeChecked();
  });

  test('with no places ticked the poster is as it was, and the studio says how to get percentages', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-AB'], wishlist: [] } });
    const studio = await openStudio(page, 'canada');
    await expect(preview(studio)).toHaveAttribute('aria-label', /2 of 13 provinces and territories explored\.$/);
    await expect(studio.locator('.check', { hasText: 'Percentages from places' })).toContainText('Appear once you tick places inside a province or territory on the map.');
    // Colouring by percentage has nothing to go on yet, and says so.
    await expect(studio.getByRole('checkbox', { name: /Colour by percentage/ })).toBeDisabled();
    await expect(studio.locator('.check', { hasText: 'Colour by percentage' })).toContainText('Needs places ticked on the map.');
  });

  test('the poster colours each province by its percentage, and one switch makes them all one colour again', async ({ page }) => {
    await seed(page, marks);
    const studio = await openStudio(page, 'canada');
    /** The different fill colours in the drawing. */
    const colours = () => preview(studio).evaluate((el) => new Set([...el.querySelectorAll('[fill]')].map((n) => n.getAttribute('fill')!.toLowerCase())).size);
    const option = studio.getByRole('checkbox', { name: /Colour by percentage/ });
    await expect(option).toBeEnabled();
    await expect(option).toBeChecked();
    await expect(studio.locator('.check', { hasText: 'Colour by percentage' })).toContainText('A stronger colour for a province or territory with a higher percentage');

    const shaded = await preview(studio).innerHTML();
    const withTones = await colours();
    await option.uncheck();
    await expect.poll(async () => (await preview(studio).innerHTML()) !== shaded).toBe(true);
    // Ontario and Alberta had a tone each; switched off they share the accent colour.
    expect(await colours()).toBeLessThan(withTones);
    // The percentages themselves stay.
    await expect(preview(studio)).toHaveAttribute('aria-label', /3 of 178 places, 2% of Canada\.$/);

    await page.reload();
    const again = page.locator('.studio[data-map="canada"]');
    await expect(again).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    await expect(again.getByRole('checkbox', { name: /Colour by percentage/ })).not.toBeChecked();

    // With the percentages off there is nothing to colour by.
    await again.getByRole('checkbox', { name: /Percentages from places/ }).uncheck();
    await expect(again.getByRole('checkbox', { name: /Colour by percentage/ })).toBeDisabled();
    await expect(again.locator('.check', { hasText: 'Colour by percentage' })).toContainText('Needs the percentages switched on.');
  });

  test('the other poster studios do not offer percentages from places', async ({ page }) => {
    for (const slug of ['world', 'canada-cities'] as const) {
      const studio = await openStudio(page, slug);
      await expect(studio.getByRole('checkbox', { name: /Percentages from places/ })).toHaveCount(0);
      await expect(studio.getByRole('checkbox', { name: /Colour by percentage/ })).toHaveCount(0);
    }
  });
});
