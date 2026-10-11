import { expect, test } from './fixtures';

/**
 * The guides: finding them, reading them on a small screen, printing them, and getting the
 * printable checklists. Every guide page is also covered by the page-by-page checks in
 * site.spec.ts and accessibility.spec.ts, which read the sitemap.
 */

test.describe('finding a guide', () => {
  test('the guides page shelves every guide under one of three headings', async ({ page }) => {
    await page.goto('/guides/');
    const shelves = page.locator('section.shelf');
    await expect(shelves).toHaveCount(3);
    await expect(shelves.locator('h2')).toHaveText(['The world, and how to count it', 'Canada, province by province', 'Making your map and printing it']);
    await expect(page.locator('.guide h3 a')).toHaveCount(11);
    // Each shelf has one picture, and none of them is announced twice to a screen reader.
    for (const shelf of await shelves.all()) await expect(shelf.locator('.shelf__picture')).toHaveAttribute('aria-hidden', 'true');
    await page.locator('.guide h3 a', { hasText: 'UNESCO World Heritage Sites in Canada' }).click();
    await expect(page.locator('h1')).toHaveText('UNESCO World Heritage Sites in Canada: All 22, by Province');
    await expect(page.locator('nav.breadcrumbs li')).toHaveText(['Home', 'Travel inspiration', 'UNESCO World Heritage Sites in Canada: All 22, by Province']);
  });

  test('the home page shows six guides and leads to the rest', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.inspiration__list li')).toHaveCount(6);
    await page.getByRole('link', { name: 'See all 11 guides' }).click();
    await expect(page).toHaveURL(/\/guides\/$/);
  });

  test('a map page lists the guides written for it, and a guide leads back to its map', async ({ page }) => {
    await page.goto('/maps/canada-cities/');
    const guides = page.locator('.map-guides__list a');
    await expect(guides).toHaveText(['Largest Cities in Canada by Population: All 41 Metro Areas']);
    await guides.first().click();
    await expect(page.locator('h1')).toContainText('Largest Cities in Canada');
    await expect(page.locator('.prose table').first().locator('tbody tr')).toHaveCount(41);
    await page.locator('.article__cta').getByRole('link', { name: 'Open the cities map' }).click();
    await expect(page).toHaveURL(/\/maps\/canada-cities\/$/);
  });

  test('every guide ends with links to the other ten', async ({ page }) => {
    await page.goto('/guides/what-counts-as-visiting-a-country/');
    const more = page.locator('.article__more a');
    await expect(more).toHaveCount(10);
    // Guides on the same shelf are offered first.
    await expect(more.first()).toHaveText('How Many Countries Are There? Why Travel Maps Disagree');
  });
});

test.describe('reading a guide', () => {
  test('answers the question before the first heading', async ({ page }) => {
    await page.goto('/guides/what-counts-as-a-country/');
    const first = page.locator('.prose > p').first();
    await expect(first).toContainText('Greenland is not an independent country.');
    await expect(first.locator('strong')).toBeVisible();
    const firstHeading = await page.locator('.prose h2').first().boundingBox();
    const answer = await first.boundingBox();
    expect(answer!.y).toBeLessThan(firstHeading!.y);
  });

  test('a table too wide for the screen scrolls inside its own box, and only then takes keyboard focus', async ({ page, isMobile }) => {
    await page.goto('/guides/canada-provinces-and-territories/');
    await page.waitForLoadState('networkidle');
    const wrapper = page.locator('.table-scroll').first();
    await wrapper.scrollIntoViewIfNeeded();
    await expect(wrapper).toHaveAttribute('role', 'region');
    const sizes = await wrapper.evaluate((el) => ({ box: el.clientWidth, content: el.scrollWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    expect(sizes.page).toBeLessThanOrEqual(1);
    const scrolls = sizes.content > sizes.box + 2;
    // Five columns of names and numbers do not fit a phone; they do fit a desktop.
    expect(scrolls).toBe(Boolean(isMobile));
    if (scrolls) await expect(wrapper).toHaveAttribute('tabindex', '0');
    else await expect(wrapper).not.toHaveAttribute('tabindex');
  });

  test('a table with long headings wraps them before it scrolls', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'a desktop layout');
    await page.goto('/guides/what-percentage-of-the-world-have-you-visited/');
    const wrapper = page.locator('.table-scroll', { has: page.locator('table', { hasText: 'Ten Caribbean island countries' }) });
    const sizes = await wrapper.evaluate((el) => ({ box: el.clientWidth, content: el.scrollWidth }));
    expect(sizes.content).toBeLessThanOrEqual(sizes.box + 1);
  });

  test('the ranking of cities fits a phone without scrolling sideways', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone layout');
    await page.goto('/guides/largest-cities-in-canada/');
    const wrapper = page.locator('.table-scroll').first();
    const sizes = await wrapper.evaluate((el) => ({ box: el.clientWidth, content: el.scrollWidth }));
    expect(sizes.content).toBeLessThanOrEqual(sizes.box + 1);
    await expect(wrapper.locator('tbody tr').first()).toContainText('6,202,225');
  });

  test('lists its sources with the date they were checked', async ({ page }) => {
    await page.goto('/guides/canada-national-parks-checklist/');
    const sources = page.locator('.article__sources li');
    expect(await sources.count()).toBeGreaterThanOrEqual(5);
    await expect(sources.first()).toContainText('Parks Canada. Checked October 11, 2026.');
    for (const link of await sources.locator('a').all()) expect(await link.getAttribute('href')).toMatch(/^https:\/\//);
  });
});

test.describe('checklists', () => {
  test('the countries checklist has a box for each of the 195 countries and 42 territories', async ({ page }) => {
    await page.goto('/guides/countries-visited-checklist/');
    await expect(page.locator('.prose .checklist li')).toHaveCount(237);
    await expect(page.locator('.prose h3')).toHaveText(['Africa (54)', 'Asia (48)', 'Europe (44)', 'North America (23)', 'South America (12)', 'Oceania (14)']);
    // The box is drawn before each name, and names sit in more than one column where there is room.
    const item = page.locator('.prose .checklist li').first();
    const box = await item.evaluate((el) => {
      const style = getComputedStyle(el, '::before');
      return { width: parseFloat(style.width), border: style.borderTopStyle, columns: getComputedStyle(el.parentElement!).columnCount };
    });
    expect(box.width).toBeGreaterThan(10);
    expect(box.border).toBe('solid');
    const lefts = await page.locator('.prose .checklist').first().locator('li').evaluateAll((items) => new Set(items.map((li) => Math.round(li.getBoundingClientRect().left))).size);
    expect(lefts).toBeGreaterThanOrEqual(2);
  });

  test('offers the printable sheet in two paper sizes, and each link returns a PDF', async ({ page, request }) => {
    await page.goto('/guides/canada-national-parks-checklist/');
    const box = page.locator('.downloads');
    await expect(box.getByRole('heading', { name: 'Print it' })).toBeVisible();
    const links = box.locator('a');
    await expect(links).toHaveText(['National parks checklist, Letter size (PDF)', 'National parks checklist, A4 size (PDF)']);
    for (const link of await links.all()) {
      const response = await request.get((await link.getAttribute('href'))!);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/pdf');
      const body = await response.body();
      expect(body.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
      expect(body.length).toBeGreaterThan(20_000);
      expect(body.length).toBeLessThan(150_000);
    }
    // The picture of the sheet has loaded and is described.
    const picture = box.locator('img');
    await expect(picture).toHaveAttribute('alt', /one page with Canada’s 48 national parks/);
    await picture.scrollIntoViewIfNeeded();
    // With a list of sizes to choose from, the browser reports the width the picture is laid out for.
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBeGreaterThanOrEqual(100);
    expect(await picture.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/canada-national-parks-checklist-(240|480)\.webp$/);
  });

  test('prints as a guide: no menus, no buttons, more columns, and the sources with their addresses', async ({ page }) => {
    await page.goto('/guides/countries-visited-checklist/');
    await page.emulateMedia({ media: 'print' });
    for (const part of ['.site-header', '.site-footer', '.breadcrumbs', '.downloads', '.article__cta', '.article__more']) await expect(page.locator(part).first()).toBeHidden();
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.prose .checklist li').first()).toBeVisible();
    const columns = await page.locator('.prose .checklist ul').first().evaluate((el) => getComputedStyle(el).columnCount);
    expect(columns).toBe('4');
    const after = await page.locator('.article__sources a').first().evaluate((a) => getComputedStyle(a, '::after').content);
    expect(after).toContain('https://www.un.org/en/about-us');
    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('.site-header')).toBeVisible();
  });
});
