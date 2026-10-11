import { readFileSync } from 'node:fs';
import { count, expect, openMap, openStudio, seed, test, tick } from './fixtures';

const sitemap = readFileSync(new URL('../../dist/sitemap.xml', import.meta.url), 'utf8');
const PATHS = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1]);

test.describe('every page', () => {
  for (const path of PATHS) {
    test(`${path} loads cleanly and fits the screen`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('main')).not.toContainText(/undefined|NaN|\[object Object\]/);
      // Let any interactive part finish loading, then look for sideways scrolling.
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'horizontal overflow in pixels').toBeLessThanOrEqual(1);
      // Fonts are served by the site itself and both families really loaded.
      const fonts = await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, ''));
      });
      expect(fonts).toContain('Manrope');
      expect(fonts).toContain('DM Serif Display');
    });
  }

  test('the sitemap lists the pages a visitor can reach', () => {
    expect(PATHS).toContain('/');
    expect(PATHS).toContain('/maps/canada/');
    expect(PATHS.length).toBeGreaterThanOrEqual(20);
  });
});

test.describe('getting around', () => {
  test('the header links to the main sections and shows where you are', async ({ page, isMobile }) => {
    await page.goto('/maps/canada/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
    await expect(nav.getByRole('link')).toHaveText(['Explore maps', 'Travel inspiration', 'How it works', 'About', 'Create my map']);
    await expect(nav.getByRole('link', { name: 'Explore maps' })).toHaveAttribute('aria-current', 'true');
    await nav.getByRole('link', { name: 'Travel inspiration' }).click();
    await expect(page).toHaveURL(/\/guides\/$/);
    if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Travel inspiration' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'WorldTripMap home' }).first().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('on a phone the menu opens, closes with Escape and returns focus', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The menu button only exists on small screens.');
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Menu' });
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(nav.getByRole('link', { name: 'About' })).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.getByRole('link', { name: 'About' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  test('the first Tab offers a way to skip to the content', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Tab is a keyboard interaction.');
    await page.goto('/methodology/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('breadcrumbs lead back up the site', async ({ page }) => {
    await page.goto('/maps/canada/poster/');
    const trail = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(trail.locator('li')).toHaveText(['Home', 'Maps', 'Canada', 'Poster']);
    await expect(trail.locator('li').last().locator('a')).toHaveCount(0);
    await trail.getByRole('link', { name: 'Canada' }).click();
    await expect(page).toHaveURL(/\/maps\/canada\/$/);
  });

  test('the footer links to every policy and tool', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    for (const name of ['World: countries', 'Canada: provinces and territories', 'Canada: major cities', 'Travel map posters', 'How it works', 'Data and methods', 'About', 'Contact', 'Privacy', 'Terms']) {
      await expect(footer.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(footer).toContainText('public domain. How we count.');
  });
});

test.describe('pages that are not there', () => {
  test.use({ allowed: /404/ });

  test('an unknown address gets a real 404 with ways back', async ({ page }) => {
    const response = await page.goto('/maps/atlantis/');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page is not on the map');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.getByRole('link', { name: 'Choose a map' }).click();
    await expect(page).toHaveURL(/\/maps\/$/);
  });

  for (const [from, to] of [
    ['/canada/', '/maps/canada/'],
    ['/world/', '/maps/world/'],
    ['/poster/', '/travel-map-poster/'],
  ]) {
    test(`${from} forwards to ${to}`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to}$`));
      await expect(page.locator('h1')).toBeVisible();
    });
  }
});

test.describe('home page', () => {
  test('says what the site is and offers the two ways in', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Your Travels. Your World. Your Map.');
    await expect(page.locator('.hero__lede')).toHaveText('Turn the places you’ve explored into a beautiful personalized travel map. Track your journey, celebrate your adventures, and share your story.');
    await expect(page.locator('.hero').getByRole('link', { name: 'Create My Travel Map' })).toHaveAttribute('href', '/maps/');
    await expect(page.locator('.hero').getByRole('link', { name: 'Explore the Map' })).toHaveAttribute('href', '#try');
    await expect(page.locator('.hero img')).toHaveAttribute('alt', /Sample data\.$/);
    await expect(page.locator('.hero__caption')).toHaveText('An example poster, made here with sample data');
  });

  test('lets a visitor choose between World, Regions and Cities, and marks what is not ready', async ({ page }) => {
    await page.goto('/');
    const chooser = page.locator('#choose');
    await expect(chooser.getByRole('heading', { level: 3 })).toHaveText(['World', 'Regions', 'Cities']);
    await expect(chooser.getByRole('link', { name: 'World', exact: true })).toHaveAttribute('href', '/maps/world/');
    await expect(chooser.getByRole('link', { name: 'Canada', exact: true })).toHaveAttribute('href', '/maps/canada/');
    await expect(chooser.getByRole('link', { name: 'Canadian cities' })).toHaveAttribute('href', '/maps/canada-cities/');
    for (const planned of ['United States', 'Bangladesh', 'World cities', 'City neighbourhoods']) {
      const item = chooser.locator('li', { hasText: planned });
      await expect(item.locator('.tag--soon')).toHaveText('Coming soon');
      await expect(item.getByRole('link')).toHaveCount(0);
    }
  });

  test('the map on the home page is the real one, and shares its progress with the full page', async ({ page }) => {
    await page.goto('/');
    await page.locator('.hero').getByRole('link', { name: 'Explore the Map' }).click();
    const app = page.locator('.mapapp[data-map="canada"]');
    await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    await tick(app, 'Ontario');
    await tick(app, 'Quebec');
    await expect(count(app)).toHaveText('2');
    await app.getByRole('link', { name: 'Open the full map' }).click();
    await expect(page).toHaveURL(/\/maps\/canada\/$/);
    const full = page.locator('.mapapp[data-map="canada"]');
    await expect(full).toHaveAttribute('data-ready', 'true');
    await expect(count(full)).toHaveText('2');
  });

  test('explains itself in four steps and answers common questions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.how__steps h3')).toHaveText(['Choose your map', 'Select the places you’ve visited', 'Personalize your design', 'Download and share']);
    const faq = page.locator('.faq__item');
    expect(await faq.count()).toBeGreaterThanOrEqual(6);
    const first = faq.first();
    await expect(first.locator('.faq__answer')).toBeHidden();
    await first.locator('summary').click();
    await expect(first.locator('.faq__answer')).toBeVisible();
    await first.locator('summary').press('Enter');
    await expect(first.locator('.faq__answer')).toBeHidden();
  });

  test('labels every example poster as sample data', async ({ page }) => {
    await page.goto('/');
    const gallery = page.locator('#gallery');
    const posters = gallery.locator('figure');
    expect(await posters.count()).toBeGreaterThanOrEqual(6);
    for (const figure of await posters.all()) await expect(figure.locator('.tag--sample')).toHaveText('Sample data');
  });
});

test.describe('privacy in practice', () => {
  test('a whole visit makes no request to any other site', async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL!) && !url.startsWith('data:') && !url.startsWith('blob:')) foreign.push(url);
    });
    await page.goto('/');
    await page.goto('/guides/how-many-countries-are-there/');
    const app = await openMap(page, 'canada');
    await tick(app, 'Ontario');
    await app.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await app.getByTestId('poster-link').click();
    await expect(page.locator('.studio')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-pdf').click()]);
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    expect(foreign).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe('');
  });

  test('"Delete everything saved on this device" really deletes it, after asking', async ({ page }) => {
    await seed(page, {
      'wtm:v1:map:canada': { visited: ['CA-ON'], wishlist: [] },
      'wtm:v1:places:canada': { visited: ['niagara-falls'] },
      'wtm:v1:poster:canada': { title: 'Mine' },
      'wtm:v1:profile': { name: 'Amina' },
      'someone-elses-key': 'untouched',
    });
    await page.goto('/privacy/');
    const keys = () => page.evaluate(() => Object.keys(localStorage).sort());
    expect(await keys()).toEqual(['someone-elses-key', 'wtm:v1:map:canada', 'wtm:v1:places:canada', 'wtm:v1:poster:canada', 'wtm:v1:profile']);

    await page.getByRole('button', { name: 'Delete everything saved on this device' }).click();
    await expect(page.locator('#erase-confirm')).toContainText('It cannot be undone.');
    await page.getByRole('button', { name: 'Keep my maps' }).click();
    expect(await keys()).toHaveLength(5);

    await page.getByRole('button', { name: 'Delete everything saved on this device' }).click();
    await page.getByRole('button', { name: 'Delete it all' }).click();
    await expect(page.locator('#erase-status')).toHaveText('Deleted. Nothing from your maps or posters is saved on this device now.');
    expect(await keys()).toEqual(['someone-elses-key']);
  });

  test('the privacy page says there is no analytics when none is configured', async ({ page }) => {
    await page.goto('/privacy/');
    await expect(page.locator('main')).toContainText('This site does not use analytics, advertising trackers or cookies.');
    await expect(page.locator('#consent')).toHaveCount(0);
  });
});

test.describe('when the browser will not store anything', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const refuse = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      Object.defineProperty(window, 'localStorage', { get: refuse });
      Object.defineProperty(window, 'sessionStorage', { get: refuse });
    });
  });

  test('the map still works, and says plainly that it cannot be saved', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Ontario');
    await tick(app, 'Quebec');
    await expect(count(app)).toHaveText('2');
    await expect(app.locator('.save-state')).toHaveText('Your browser is blocking storage, so this map will be gone when you close the page.');
    await expect(app.locator('.save-state')).not.toContainText('Saved on this device');
  });

  test('the marked places still reach the poster studio, through the link', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Ontario');
    await tick(app, 'Quebec');
    await app.getByTestId('poster-link').click();
    const studio = page.locator('.studio[data-map="canada"]');
    await expect(studio).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    await expect(studio.locator('.studio__places')).toContainText('2 of 13');
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-png').click()]);
    expect(file.suggestedFilename()).toMatch(/1080x1350\.png$/);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('pages still read well, and the map says what it needs', async ({ page }) => {
    await page.goto('/maps/canada/');
    await expect(page.locator('h1')).toHaveText('Visited provinces map of Canada');
    const standIn = page.locator('[data-placeholder]');
    await expect(standIn.locator('.map')).toBeVisible();
    await expect(standIn.locator('.map__status')).toHaveText('The interactive map needs JavaScript. Turn it on in your browser to mark places.', { useInnerText: true });
    // Controls that could not work are not shown at all.
    for (const part of ['.mapapp__toolbar', '.map__bar', '.mapapp__panel']) await expect(standIn.locator(part)).toBeHidden();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'The 13 provinces and territories' })).toBeVisible();
    // The menu is plain links, with no button that would do nothing.
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'About' })).toBeVisible();
    await page.goto('/guides/canada-provinces-and-territories/');
    await expect(page.locator('article table')).toBeVisible();
    await page.goto('/maps/canada/poster/');
    await expect(standIn.locator('.studio__status')).toHaveText('The poster studio needs JavaScript. Turn it on in your browser to design and download a poster.', { useInnerText: true });
    await expect(standIn.locator('.studio__panel')).toBeHidden();
    await expect(page.getByRole('button', { name: /Download/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Before you print' })).toBeVisible();
  });

  test('the questions and answers open without scripts', async ({ page }) => {
    await page.goto('/travel-map-poster/');
    const first = page.locator('.faq__item').first();
    await first.locator('summary').click();
    await expect(first.locator('.faq__answer')).toBeVisible();
  });
});

test.describe('poster landing page', () => {
  test('sends each map to its own studio and shows what is on offer', async ({ page }) => {
    await page.goto('/travel-map-poster/');
    await expect(page.getByRole('link', { name: 'World poster' })).toHaveAttribute('href', '/maps/world/poster/');
    await expect(page.getByRole('link', { name: 'Canada poster', exact: true })).toHaveAttribute('href', '/maps/canada/poster/');
    await expect(page.getByRole('link', { name: 'Canadian cities poster' })).toHaveAttribute('href', '/maps/canada-cities/poster/');
    await expect(page.locator('.designs h3')).toHaveText(['Midnight Atlas', 'Nordic Explorer', 'Modern Cartographer', 'Travel Journal']);
    await expect(page.locator('.sizes__table tbody tr')).toHaveCount(7);
    await expect(page.locator('.sizes__table')).toContainText('1,080 × 1,350 and 2,160 × 2,700');
    await expect(page.locator('.sizes__table')).toContainText('18 × 24 in');
  });

  test('the sizes on the page are the sizes the studio offers', async ({ page }) => {
    const studio = await openStudio(page, 'canada');
    await expect(studio.locator('.format strong')).toHaveText(['Post', 'Story', 'Pin', 'Poster, upright', 'Poster, wide', 'A3, upright', 'A3, wide']);
  });
});

test.describe('when the interactive part cannot load', () => {
  test.use({ allowed: /Failed to load resource|dynamically imported module|\[astro-island\]|ERR_FAILED/i });

  test('the map page says so and offers a reload, instead of waiting forever', async ({ page }) => {
    await page.clock.install();
    // The page's own scripts never arrive, as on a broken connection.
    await page.route('**/_astro/*.js', (route) => route.abort());
    await page.goto('/maps/canada/');
    const standIn = page.locator('[data-placeholder]');
    const status = standIn.locator('.map__status');
    await expect(status).toHaveText('Loading the map…', { useInnerText: true });
    // While it waits, the page already has the tool's shape, and none of it can be used by mistake.
    await expect(standIn.locator('.mapapp__panel')).toBeVisible();
    await expect(standIn.locator('.mapapp__panel')).toHaveAttribute('inert', '');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await page.clock.runFor(13_000);
    await expect(status).toHaveText('The map did not load. Check your connection, then reload the page.', { useInnerText: true });
    await expect(status.getByRole('button', { name: 'reload the page' })).toBeVisible();
    await expect(standIn.locator('.mapapp__panel')).toBeHidden();
    // The rest of the page is still there to read.
    await expect(page.getByRole('heading', { name: 'How this map counts' })).toBeVisible();
  });

  test('the poster studio says so too', async ({ page }) => {
    await page.clock.install();
    await page.route('**/_astro/*.js', (route) => route.abort());
    await page.goto('/maps/canada/poster/');
    const standIn = page.locator('[data-placeholder]');
    await expect(standIn.locator('.studio__status')).toHaveText('Drawing your poster…', { useInnerText: true });
    await expect(standIn.locator('.studio__panel')).toHaveAttribute('inert', '');
    await page.clock.runFor(13_000);
    await expect(standIn.locator('.studio__status')).toHaveText('The poster studio did not load. Check your connection, then reload the page.', { useInnerText: true });
    await expect(standIn.locator('.studio__panel')).toBeHidden();
  });

  test('a map that is still loading normally is never called a failure', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.clock.runFor(20_000);
    // The home page map waits until it is scrolled near; its placeholder is not an error.
    await expect(page.locator('[data-loading="failed"]')).toHaveCount(0);
  });
});
