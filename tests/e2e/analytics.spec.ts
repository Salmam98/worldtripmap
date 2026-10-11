import { clickPlace, count, eventNames, events, expect, openMap, seed, test, tick } from './fixtures';

/**
 * The site reports ten named events, each also dispatched in the page as "wtm:track". With no
 * analytics provider configured (the default build) nothing leaves the browser; these tests check
 * that the events fire at the right moments and carry no personal detail.
 */
test.describe('analytics events', () => {
  test('a whole journey fires each event once, at the right moment', async ({ page }) => {
    await page.goto('/');
    expect(await eventNames(page)).toEqual(['homepage_viewed']);

    const app = await openMap(page, 'canada');
    expect(await eventNames(page)).toEqual([]);
    await clickPlace(page, 'canada', 'CA-ON');
    expect(await events(page)).toEqual([
      { name: 'map_started', props: { map: 'canada' } },
      { name: 'region_selected', props: { map: 'canada', count: 1 } },
    ]);
    await tick(app, 'Quebec');
    expect((await events(page)).at(-1)).toEqual({ name: 'region_selected', props: { map: 'canada', count: 2 } });
    // Removing a mark is not a selection.
    await tick(app, 'Quebec');
    expect((await eventNames(page)).filter((n) => n === 'region_selected')).toHaveLength(2);
    expect((await eventNames(page)).filter((n) => n === 'map_started')).toHaveLength(1);

    await app.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Copy' }).click();
    expect((await events(page)).at(-1)!.name).toBe('share_initiated');
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

    await app.getByTestId('poster-link').click();
    const studio = page.locator('.studio[data-map="canada"]');
    await expect(studio).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    expect(await eventNames(page)).toEqual([]);
    await studio.locator('.template-card', { hasText: 'Nordic Explorer' }).click();
    await studio.getByLabel('Title', { exact: true }).fill('Mine');
    expect(await eventNames(page)).toEqual(['poster_customized']);
    await Promise.all([page.waitForEvent('download'), page.getByTestId('download-png').click()]);
    await Promise.all([page.waitForEvent('download'), page.getByTestId('download-pdf').click()]);
    expect(await events(page)).toEqual([
      { name: 'poster_customized', props: { map: 'canada' } },
      { name: 'png_downloaded', props: { map: 'canada', template: 'nordic-explorer', format: 'post', size: 'standard' } },
      { name: 'pdf_downloaded', props: { map: 'canada', template: 'nordic-explorer', format: 'post' } },
    ]);
  });

  test('completing a map is reported once', async ({ page }) => {
    const all = ['CA-NL', 'CA-PE', 'CA-NS', 'CA-NB', 'CA-QC', 'CA-ON', 'CA-MB', 'CA-SK', 'CA-AB', 'CA-BC', 'CA-YT', 'CA-NT'];
    await seed(page, { 'wtm:v1:map:canada': { visited: all, wishlist: [] } });
    const app = await openMap(page, 'canada');
    await tick(app, 'Nunavut');
    await expect(count(app)).toHaveText('13');
    await tick(app, 'Nunavut');
    await tick(app, 'Nunavut');
    const names = await eventNames(page);
    expect(names.filter((n) => n === 'map_completed')).toHaveLength(2);
    expect(names[0]).toBe('map_started');
  });

  test('challenge links report being opened and completed', async ({ page }) => {
    const app = await openMap(page, 'canada', '#v=DEA&n=Salman&c=1');
    expect(await eventNames(page)).toEqual(['challenge_link_opened']);
    await tick(app, 'Ontario');
    await page.locator('.friend-banner').getByRole('radio', { name: 'Compare' }).check();
    expect(await eventNames(page)).toEqual(['challenge_link_opened', 'map_started', 'region_selected', 'challenge_completed']);
  });

  test('comparing without marking anything is not a completed challenge', async ({ page }) => {
    await openMap(page, 'canada', '#v=DEA&c=1');
    await page.locator('.friend-banner').getByRole('radio', { name: 'Compare' }).check();
    expect(await eventNames(page)).toEqual(['challenge_link_opened']);
  });

  test('events never carry a name, the places marked or the contents of a link', async ({ page }) => {
    await seed(page, { 'wtm:v1:profile': { name: 'Very Private Name' } });
    const app = await openMap(page, 'canada', '#v=DEA&n=Friendname&c=1');
    await tick(app, 'Ontario');
    await tick(app, 'Yukon');
    await app.getByRole('button', { name: 'Challenge a friend' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Copy' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await page.locator('.friend-banner').getByRole('radio', { name: 'Compare' }).check();
    const all = JSON.stringify(await events(page));
    for (const secret of ['Very Private Name', 'Friendname', 'CA-ON', 'CA-YT', 'Ontario', 'Yukon', 'DEA', '#v=']) {
      expect(all, `events mention "${secret}"`).not.toContain(secret);
    }
    const keys = new Set((await events(page)).flatMap((e) => Object.keys(e.props)));
    expect([...keys].sort()).toEqual(['count', 'kind', 'map', 'method']);
  });

  test('with no provider configured, no analytics script is on the page', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => 'plausible' in window || 'gtag' in window || 'dataLayer' in window)).toBe(false);
    expect(await page.locator('script[src*="plausible"], script[src*="googletagmanager"]').count()).toBe(0);
  });
});
