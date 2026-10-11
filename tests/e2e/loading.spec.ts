import type { Page } from '@playwright/test';
import { expect, layoutShift, seed, test } from './fixtures';

/**
 * Each tool page is built with a stand-in for its interactive part: the tool as it first appears,
 * drawn when the site is built, which the live tool replaces once its scripts have loaded. These
 * tests hold the two together, so the page never jumps while it loads (Core Web Vitals: CLS).
 */

const TOOLS = [
  { path: '/maps/canada/', live: '.mapapp[data-map="canada"]' },
  { path: '/maps/world/', live: '.mapapp[data-map="world"]' },
  { path: '/maps/canada-cities/', live: '.mapapp[data-map="canada-cities"]' },
  { path: '/maps/canada/poster/', live: '.studio[data-map="canada"]' },
  { path: '/maps/world/poster/', live: '.studio[data-map="world"]' },
  { path: '/maps/canada-cities/poster/', live: '.studio[data-map="canada-cities"]' },
];

/** Holds the tool's scripts back for a moment, as a slow connection would, so the stand-in is certainly on screen first. */
async function slowScripts(page: Page, ms = 350): Promise<void> {
  await page.route('**/_astro/*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

async function open(page: Page, tool: (typeof TOOLS)[number], hash = ''): Promise<void> {
  await page.goto(tool.path + hash);
  await expect(page.locator(tool.live)).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
}

/** Where the main blocks of the page sit, to the nearest pixel. */
async function boxes(page: Page, root: string): Promise<Record<string, number[] | null>> {
  // Text is measured in its real typefaces both times.
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((selector) => {
    const scope = document.querySelector(selector);
    const box = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [r.left, r.top + window.scrollY, r.width, r.height].map(Math.round);
    };
    const inside = (part: string) => box(scope?.querySelector(part));
    return {
      tool: box(scope),
      toolbar: inside('.mapapp__toolbar'),
      sheet: inside('.mapapp__sheet'),
      map: inside('.map'),
      zoom: inside('.map__zoom'),
      legend: inside('.legend'),
      panel: inside('.mapapp__panel'),
      progress: inside('.progress'),
      list: inside('.place-list'),
      achievements: inside('.achievements'),
      wall: inside('.studio__wall'),
      poster: inside('.studio__poster'),
      controls: inside('.studio__panel'),
      download: inside('.studio__export'),
      // What comes after the tool is what a visitor would see jump.
      next: box(document.querySelector('main > section:nth-of-type(2)')),
    };
  }, root);
}

for (const tool of TOOLS) {
  test.describe(`${tool.path} while it loads`, () => {
    test('nothing on the page moves when the tool takes over from its stand-in', async ({ page }) => {
      await slowScripts(page);
      await open(page, tool);
      const { total, moved } = await layoutShift(page);
      expect(total, `layout shift ${total.toFixed(4)}; moved: ${moved.join(', ')}`).toBeLessThan(0.01);
      await expect(page.locator('[data-placeholder]')).toHaveCount(0);
    });

    test('nothing moves for a returning visitor either', async ({ page }) => {
      await seed(page, {
        'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-QC', 'CA-BC', 'CA-NS', 'CA-YT'], wishlist: ['CA-NU'] },
        'wtm:v1:map:world': { visited: ['CAN', 'USA', 'FRA', 'JPN', 'BGD', 'GRL'], wishlist: ['NZL'] },
        'wtm:v1:map:canada-cities': { visited: ['toronto', 'montreal', 'vancouver', 'halifax'], wishlist: [] },
        'wtm:v1:profile': { name: 'Salman' },
      });
      await slowScripts(page);
      await open(page, tool);
      const { total, moved } = await layoutShift(page);
      expect(total, `layout shift ${total.toFixed(4)}; moved: ${moved.join(', ')}`).toBeLessThan(0.01);
    });
  });
}

test.describe('a shared map while it loads', () => {
  for (const [name, hash] of [
    ['a shared link', '#v=DEA&n=Salman'],
    ['a challenge link', '#v=DEA&n=Salman&c=1'],
  ]) {
    test(`${name} opens in the layout it keeps`, async ({ page }) => {
      await slowScripts(page);
      await open(page, TOOLS[0], hash);
      await expect(page.locator('.friend-banner')).toBeVisible();
      const { total, moved } = await layoutShift(page);
      expect(total, `layout shift ${total.toFixed(4)}; moved: ${moved.join(', ')}`).toBeLessThan(0.01);
    });
  }
});

test.describe('the stand-in and the tool it stands in for', () => {
  // The first half of each test stops the scripts on purpose, which the browser reports as errors.
  test.use({ allowed: /Failed to load resource|dynamically imported module|\[astro-island\]|ERR_FAILED/i });

  for (const tool of TOOLS) {
    test(`${tool.path}: every block is in the same place before and after`, async ({ page }) => {
      await page.route('**/_astro/*.js', (route) => route.abort());
      await page.goto(tool.path);
      await expect(page.locator('[data-placeholder] [data-loading]')).toBeVisible();
      const before = await boxes(page, '[data-placeholder] > *');

      await page.unroute('**/_astro/*.js');
      await open(page, tool);
      const after = await boxes(page, tool.live);

      // The comparison only means something if the blocks were found in the stand-in.
      const expected = tool.live.startsWith('.studio') ? ['tool', 'wall', 'poster', 'controls', 'download', 'next'] : ['tool', 'toolbar', 'sheet', 'map', 'zoom', 'legend', 'panel', 'progress', 'list', 'achievements', 'next'];
      for (const part of expected) expect(before[part], `${part} in the stand-in`).not.toBeNull();
      expect(after).toEqual(before);
    });
  }
});
