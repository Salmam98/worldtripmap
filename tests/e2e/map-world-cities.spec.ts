import { WORLD_UNITS } from '../../src/data/definitions/world';
import { clickPlace, count, expect, openMap, percent, revealRow, row, saved, seed, shape, test, tick } from './fixtures';

const COUNTRIES = WORLD_UNITS.filter((u) => u.status !== 'territory').map((u) => u.id);

test.describe('world map', () => {
  test('counts out of 195 and explains what the percentage is', async ({ page }) => {
    const app = await openMap(page, 'world');
    await expect(app.locator('.progress__of')).toHaveText('of 195 countries explored');
    await expect(app.locator('.progress__note')).toContainText('the 193 United Nations member states plus the Holy See and Palestine');
    await expect(app.locator('.map__svg [role="checkbox"]')).toHaveCount(237);
    await expect(app.locator('details.place-group')).toHaveCount(7);
    await expect(app.locator('details.place-group summary .place-group__count')).toHaveText(['0 of 54', '0 of 48', '0 of 44', '0 of 23', '0 of 12', '0 of 14', '0 of 42']);
  });

  test('marks a large country straight from the map', async ({ page }) => {
    const app = await openMap(page, 'world');
    await clickPlace(page, 'world', 'BRA');
    await expect(shape(app, 'BRA')).toHaveAttribute('aria-checked', 'true');
    await expect(count(app)).toHaveText('1');
    await expect(percent(app)).toHaveText('<1%');
    await expect(app.locator('.progress__facts')).toContainText('1 of 6 inhabited continents');
  });

  test('finds countries by everyday names and marks them from the list', async ({ page }) => {
    const app = await openMap(page, 'world');
    const search = app.getByRole('searchbox', { name: 'Search countries' });
    for (const [query, name, id] of [
      ['holland', 'Netherlands', 'NLD'],
      ['usa', 'United States', 'USA'],
      ['ivory coast', 'Côte d’Ivoire', 'CIV'],
    ] as const) {
      await search.fill(query);
      await expect(app.locator('.place').first().locator('.place__name')).toHaveText(name);
      await app.locator('.place').first().locator('.place__main').click();
      await expect(shape(app, id)).toHaveAttribute('aria-checked', 'true');
    }
    await search.fill('');
    await expect(count(app)).toHaveText('3');
    await expect(percent(app)).toHaveText('2%');
  });

  test('counts territories separately and never adds them to the 195', async ({ page }) => {
    const app = await openMap(page, 'world');
    await tick(app, 'Greenland');
    await tick(app, 'Hong Kong');
    await expect(count(app)).toHaveText('0');
    await expect(percent(app)).toHaveText('0%');
    await expect(app.locator('.progress__facts')).toContainText('+2 territories, counted separately');
    await expect(app.locator('.place-group__note')).toContainText('They are counted separately and are not part of the 195.');
    await expect(row(app, 'Greenland').locator('.place__note')).toHaveText('Denmark');
    await tick(app, 'France');
    await expect(count(app)).toHaveText('1');
    await expect(app.locator('.progress__facts')).toContainText('+2 territories, counted separately');
  });

  test('reaches 100% with the 195 countries alone', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:world': { visited: COUNTRIES.slice(0, 194), wishlist: [] } });
    const app = await openMap(page, 'world');
    await expect(count(app)).toHaveText('194');
    await expect(percent(app)).toHaveText('99%');
    await tick(app, 'Zimbabwe');
    await expect(count(app)).toHaveText('195');
    await expect(percent(app)).toHaveText('100%');
    await expect(app.locator('.progress__done')).toHaveText('Complete');
    await expect(app.locator('.achievement.is-earned')).toHaveCount(5);
  });

  test('gives very small countries a marker that can be clicked', async ({ page, isMobile }) => {
    test.skip(isMobile, 'On a phone the smallest markers appear after zooming in; the list is the dependable way.');
    const app = await openMap(page, 'world');
    for (const id of ['SGP', 'MLT', 'BHR']) {
      await clickPlace(page, 'world', id);
      await expect(shape(app, id), id).toHaveAttribute('aria-checked', 'true');
    }
    await expect(count(app)).toHaveText('3');
  });

  test('zooming in makes a crowded region easy to hit', async ({ page }) => {
    const app = await openMap(page, 'world');
    const zoomIn = app.getByRole('button', { name: 'Zoom in' });
    for (let i = 0; i < 4; i++) await zoomIn.click();
    await page.waitForTimeout(400);
    // The view is now centred on the Gulf of Guinea, where Gabon is too small to hit at full view.
    await clickPlace(page, 'world', 'GAB');
    await expect(shape(app, 'GAB')).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('Canadian cities map', () => {
  test('counts out of 45 and says what the list is', async ({ page }) => {
    const app = await openMap(page, 'canada-cities');
    await expect(app.locator('.progress__of')).toHaveText('of 45 cities explored');
    await expect(app.locator('.progress__percent')).toContainText('of the 45 cities on this map');
    await expect(app.locator('.progress__note')).toContainText('Canada has thousands of other cities, towns and villages that are not on this list.');
    await expect(app.locator('.map__svg [role="checkbox"]')).toHaveCount(45);
  });

  test('marks a city from its dot on the map', async ({ page }) => {
    const app = await openMap(page, 'canada-cities');
    await clickPlace(page, 'canada-cities', 'whitehorse');
    await expect(shape(app, 'whitehorse')).toHaveAttribute('aria-checked', 'true');
    await expect(shape(app, 'whitehorse')).toHaveAttribute('aria-label', 'Whitehorse: Explored');
    await expect(count(app)).toHaveText('1');
    await expect(percent(app)).toHaveText('2%');
  });

  test('finds a metropolitan area by a city inside it', async ({ page }) => {
    const app = await openMap(page, 'canada-cities');
    await app.getByRole('searchbox', { name: 'Search cities' }).fill('mississauga');
    await expect(app.locator('.place .place__name')).toHaveText(['Toronto']);
    await app.locator('.place .place__main').click();
    await expect(shape(app, 'toronto')).toHaveAttribute('aria-checked', 'true');
  });

  test('awards Capital Collector only for Ottawa and all thirteen capitals', async ({ page }) => {
    const capitals = ['ottawa-gatineau', 'toronto', 'quebec-city', 'halifax', 'fredericton', 'winnipeg', 'victoria', 'charlottetown', 'regina', 'edmonton', 'st-johns', 'whitehorse', 'yellowknife'];
    await seed(page, { 'wtm:v1:map:canada-cities': { visited: capitals, wishlist: [] } });
    const app = await openMap(page, 'canada-cities');
    const badge = app.locator('.achievement', { hasText: 'Capital Collector' });
    await expect(badge.locator('.achievement__state')).toHaveText('13/14');
    await tick(app, 'Iqaluit');
    await expect(badge).toHaveClass(/is-earned/);
  });
});

test.describe('maps stay separate', () => {
  test('marking a province does not mark its cities, and marking a city does not mark its province', async ({ page }) => {
    let app = await openMap(page, 'canada');
    await tick(app, 'Alberta');
    await expect(count(app)).toHaveText('1');
    app = await openMap(page, 'canada-cities');
    await expect(count(app)).toHaveText('0');
    await expect((await revealRow(app, 'Calgary')).locator('input[type="checkbox"]')).not.toBeChecked();
    await tick(app, 'Halifax');
    expect(((await saved(page, 'wtm:v1:map:canada')) as { visited: string[] }).visited).toEqual(['CA-AB']);
    app = await openMap(page, 'world');
    await expect(count(app)).toHaveText('0');
  });

  test('a city suggests its province, and nothing is added until you say so', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada-cities': { visited: ['calgary', 'halifax'], wishlist: [] } });
    let app = await openMap(page, 'canada');
    const offer = app.locator('.rollup');
    await expect(offer).toContainText('Your “Canada: major cities” map suggests you have also been to Alberta and Nova Scotia.');
    await expect(offer).toContainText('Maps keep separate progress, so nothing is added unless you say so.');
    await expect(count(app)).toHaveText('0');
    expect(await saved(page, 'wtm:v1:map:canada')).toBeNull();

    await offer.getByRole('button', { name: 'Not now' }).click();
    await expect(offer).toHaveCount(0);
    await page.reload();
    app = page.locator('.mapapp[data-map="canada"]');
    await expect(app).toHaveAttribute('data-ready', 'true');
    await expect(app.locator('.rollup')).toHaveCount(0);
    await expect(count(app)).toHaveText('0');
  });

  test('accepting the suggestion adds exactly those places, and can be undone', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada-cities': { visited: ['calgary', 'halifax'], wishlist: [] } });
    const app = await openMap(page, 'canada');
    await app.locator('.rollup').getByRole('button', { name: 'Add 2 provinces and territories' }).click();
    await expect(count(app)).toHaveText('2');
    await expect(shape(app, 'CA-AB')).toHaveAttribute('aria-checked', 'true');
    await expect(shape(app, 'CA-NS')).toHaveAttribute('aria-checked', 'true');
    await expect(app.locator('.rollup')).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Added Alberta and Nova Scotia.');
    await page.locator('.toast__action').click();
    await expect(count(app)).toHaveText('0');
  });

  test('a province suggests Canada on the world map', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': { visited: ['CA-QC'], wishlist: [] } });
    const app = await openMap(page, 'world');
    await expect(app.locator('.rollup')).toContainText('you have also been to Canada');
    await app.locator('.rollup').getByRole('button', { name: 'Add Canada' }).click();
    await expect(count(app)).toHaveText('1');
    await expect(shape(app, 'CAN')).toHaveAttribute('aria-checked', 'true');
  });
});
