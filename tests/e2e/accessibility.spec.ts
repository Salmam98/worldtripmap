import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, openMap, openStudio, seed, test, tick } from './fixtures';

const sitemap = readFileSync(new URL('../../dist/sitemap.xml', import.meta.url), 'utf8');
const PATHS = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1]);

/** Runs the axe rule set for WCAG 2.2 level A and AA, plus its best-practice rules. */
async function audit(page: Page, context?: string) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']);
  if (context) builder = builder.include(context);
  const { violations } = await builder.analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n    ')}`);
  expect(summary, 'accessibility violations').toEqual([]);
}

test.describe('automated accessibility checks', () => {
  for (const path of PATHS) {
    test(`${path} has no detectable WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      // Wait for whichever interactive part the page has. The home page loads its map when it is scrolled near.
      if (await page.locator('astro-island').count()) {
        if (path === '/') await page.locator('#try').scrollIntoViewIfNeeded();
        await expect(page.locator('.mapapp, .studio').first()).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
      }
      await audit(page);
    });
  }

  test('the 404 page', async ({ page }) => {
    await page.goto('/404.html');
    await audit(page);
  });

  test('a map with places marked, a bucket list and achievements earned', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-QC', 'CA-BC', 'CA-AB', 'CA-NS', 'CA-PE', 'CA-YT'], wishlist: ['CA-NL', 'CA-NU'] } });
    await openMap(page, 'canada');
    await audit(page);
  });

  test('the world map with every continent open', async ({ page }) => {
    const app = await openMap(page, 'world');
    for (const group of await app.locator('details.place-group summary').all()) await group.click();
    await audit(page);
  });

  test('the confirmation dialog', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Ontario');
    await app.getByRole('button', { name: 'Start over' }).click();
    await expect(page.getByRole('dialog', { name: 'Clear this map?' })).toBeVisible();
    await audit(page);
  });

  test('the share dialog', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Ontario');
    await app.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Share your map' })).toBeVisible();
    await audit(page);
  });

  test('a shared map and the comparison view', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-NS'], wishlist: [] } });
    await openMap(page, 'canada', '#v=DEA&n=Salman&c=1');
    await audit(page);
    await page.locator('.friend-banner').getByRole('radio', { name: 'Compare' }).check();
    await audit(page);
    await page.locator('.friend-banner').getByRole('radio', { name: /Salman/ }).check();
    await audit(page);
  });

  test('the poster studio with every panel filled in and a file made', async ({ page }) => {
    await seed(page, {
      'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-QC', 'CA-BC', 'CA-AB', 'CA-NS', 'CA-PE', 'CA-YT'], wishlist: ['CA-NU'] },
      'wtm:v1:poster:canada': { template: 'travel-journal', name: 'Amina', dates: '2019–2026', caption: 'Every road led somewhere good.', badge: 'halfway-there' },
    });
    const studio = await openStudio(page, 'canada');
    await studio.locator('.studio__list > summary').click();
    await studio.locator('.format', { hasText: 'Poster, upright' }).click();
    await Promise.all([page.waitForEvent('download'), page.getByTestId('download-pdf').click()]);
    await expect(studio.locator('.studio__result')).toBeVisible();
    await audit(page);
  });

  test('search with no results', async ({ page }) => {
    const app = await openMap(page, 'world');
    await app.getByRole('searchbox', { name: 'Search countries' }).fill('zzzz');
    await expect(app.locator('.place-list__empty')).toBeVisible();
    await audit(page);
  });
});

test.describe('names and roles', () => {
  test('the map is a labelled group of checkboxes that say what they are', async ({ page }) => {
    const app = await openMap(page, 'canada');
    const map = app.getByRole('group', { name: /^Map of Canada showing Canada’s 13 provinces and territories\./ });
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute('aria-describedby', /.+/);
    const help = await map.getAttribute('aria-describedby');
    await expect(page.locator(`[id="${help}"]`)).toContainText('Use the arrow keys to move between places and press Space to mark one.');
    await expect(map.getByRole('checkbox')).toHaveCount(13);
    await expect(map.getByRole('checkbox', { name: 'Nunavut: Not marked' })).toHaveAttribute('aria-checked', 'false');
    // Exactly one place is in the tab order at a time.
    await expect(map.locator('[tabindex="0"]')).toHaveCount(1);
  });

  test('progress is exposed as a progress bar with a readable value', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': { visited: ['CA-ON', 'CA-QC', 'CA-BC', 'CA-AB'], wishlist: [] } });
    const app = await openMap(page, 'canada');
    const bar = app.getByRole('progressbar', { name: 'Provinces and territories explored' });
    await expect(bar).toHaveAttribute('aria-valuenow', '4');
    await expect(bar).toHaveAttribute('aria-valuemax', '13');
    await expect(bar).toHaveAttribute('aria-valuetext', '4 of 13, 31%');
  });

  test('changes are announced politely', async ({ page }) => {
    const app = await openMap(page, 'canada');
    const live = app.locator('p[role="status"][aria-live="polite"]');
    await expect(live).toHaveCount(1);
    await tick(app, 'Yukon');
    await app.getByRole('button', { name: 'Undo' }).click();
    await expect(live).toHaveText('Last change undone.');
  });

  test('the poster preview describes itself', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': { visited: ['CA-ON'], wishlist: [] } });
    const studio = await openStudio(page, 'canada');
    await expect(studio.getByRole('img', { name: /^My Canada Journey: a Midnight Atlas poster of Canada/ })).toBeVisible();
  });

  test('every form field in the studio has a label', async ({ page }) => {
    const studio = await openStudio(page, 'canada');
    const unnamed = await studio.locator('input, textarea, select, button').evaluateAll((els) =>
      els
        .filter((el) => {
          const input = el as HTMLInputElement;
          const label = input.labels?.[0]?.textContent?.trim() || el.getAttribute('aria-label') || el.textContent?.trim();
          return !label;
        })
        .map((el) => el.outerHTML.slice(0, 100)),
    );
    expect(unnamed).toEqual([]);
  });
});

test.describe('focus and motion', () => {
  test('focus is always visible on interactive elements', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard focus is a desktop interaction.');
    await page.goto('/');
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return { name: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30), outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2 };
      });
      if (info) {
        seen.push(info.name);
        expect(info.outline, `visible focus outline on "${info.name}"`).toBe(true);
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(10);
  });

  test('touch targets on the map page are big enough for a finger', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Touch target size is checked at phone size.');
    const app = await openMap(page, 'canada');
    const small = await app.locator('button:visible, a.btn:visible, .place__main:visible, .place__wish:visible, .segmented__option:visible, summary:visible').evaluateAll((els) =>
      els
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < 24 || box.height < 24))
        .map(({ el, box }) => `${el.outerHTML.slice(0, 70)} ${Math.round(box.width)}×${Math.round(box.height)}`),
    );
    // WCAG 2.2 asks for at least 24 by 24 CSS pixels.
    expect(small).toEqual([]);
  });

  test('with reduced motion requested, nothing animates or glides', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((el) => {
          const s = getComputedStyle(el);
          return (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01) || parseFloat(s.transitionDuration) > 0.01;
        })
        .map((el) => el.className.toString() || el.tagName)
        .slice(0, 5),
    );
    expect(moving).toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  });

  test('text can be enlarged to 200% without losing content or scrolling sideways', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Zoom reflow is checked at desktop width, which becomes a 683-pixel layout at 200%.');
    await page.setViewportSize({ width: 683, height: 450 });
    for (const path of ['/', '/maps/canada/', '/maps/canada/poster/', '/guides/print-a-travel-map-poster/']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at 200%`).toBeLessThanOrEqual(1);
    }
  });

  test('at 320 pixels wide, the narrowest phones, nothing scrolls sideways', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Checked once, in the phone profile.');
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of ['/', '/maps/', '/maps/canada/', '/maps/world/', '/maps/canada/poster/', '/travel-map-poster/', '/guides/canada-provinces-and-territories/', '/privacy/']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at 320 px`).toBeLessThanOrEqual(1);
    }
  });
});
