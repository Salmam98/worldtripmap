import { clickPlace, count, eventNames, expect, openMap, percent, revealRow, row, saved, seed, shape, test, tick } from './fixtures';

const ALL = ['CA-NL', 'CA-PE', 'CA-NS', 'CA-NB', 'CA-QC', 'CA-ON', 'CA-MB', 'CA-SK', 'CA-AB', 'CA-BC', 'CA-YT', 'CA-NT', 'CA-NU'];

test.describe('Canada map', () => {
  test('starts empty, with an honest counter and an explanation of the percentage', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await expect(count(app)).toHaveText('0');
    await expect(app.locator('.progress__of')).toHaveText('of 13 provinces and territories explored');
    await expect(percent(app)).toHaveText('0%');
    await expect(app.locator('.progress__note')).toContainText('It is not a share of Canada’s land area');
    await expect(app.locator('.map__svg [role="checkbox"]')).toHaveCount(13);
    await expect(app.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(app.getByRole('button', { name: 'Start over' })).toBeDisabled();
  });

  test('marks a province from the map, and unmarks it with a second click', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await clickPlace(page, 'canada', 'CA-ON');
    await expect(count(app)).toHaveText('1');
    await expect(percent(app)).toHaveText('8%');
    await expect(shape(app, 'CA-ON')).toHaveAttribute('aria-checked', 'true');
    await expect(shape(app, 'CA-ON')).toHaveAttribute('aria-label', 'Ontario: Explored');
    await expect(shape(app, 'CA-ON')).toHaveClass(/is-visited/);
    await expect(row(app, 'Ontario').locator('input[type="checkbox"]')).toBeChecked();
    await expect(app.locator('p[role="status"].visually-hidden').last()).toHaveText('Ontario: marked as explored. 1 of 13 provinces and territories explored.');
    await expect(app.locator('.save-state')).toHaveText('Saved on this device');

    await clickPlace(page, 'canada', 'CA-ON');
    await expect(count(app)).toHaveText('0');
    await expect(shape(app, 'CA-ON')).toHaveAttribute('aria-checked', 'false');
  });

  test('every one of the 13 can be marked on the map itself, each exactly once', async ({ page }) => {
    const app = await openMap(page, 'canada');
    for (const [i, id] of ALL.entries()) {
      await clickPlace(page, 'canada', id);
      await expect(count(app), `after ${id}`).toHaveText(String(i + 1));
      await expect(shape(app, id)).toHaveAttribute('aria-checked', 'true');
    }
    expect(((await saved(page, 'wtm:v1:map:canada')) as { visited: string[] }).visited.sort()).toEqual([...ALL].sort());
  });

  test('ticking the list marks the map, and the two never disagree', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Manitoba');
    await expect(shape(app, 'CA-MB')).toHaveAttribute('aria-checked', 'true');
    await expect(count(app)).toHaveText('1');
    // Marking the same place again from the map removes it: it was never counted twice.
    await clickPlace(page, 'canada', 'CA-MB');
    await expect(count(app)).toHaveText('0');
    await expect(row(app, 'Manitoba').locator('input[type="checkbox"]')).not.toBeChecked();
  });

  test('Prince Edward Island, the smallest, can be marked by tapping it or by searching', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await clickPlace(page, 'canada', 'CA-PE');
    await expect(shape(app, 'CA-PE')).toHaveAttribute('aria-checked', 'true');
    await clickPlace(page, 'canada', 'CA-PE');
    await expect(count(app)).toHaveText('0');

    const search = app.getByRole('searchbox', { name: 'Search provinces and territories' });
    await search.fill('pei');
    await expect(app.locator('.place')).toHaveCount(1);
    await app.locator('.place .place__main').click();
    await expect(shape(app, 'CA-PE')).toHaveAttribute('aria-checked', 'true');
    await search.fill('zzzz');
    await expect(app.locator('.place-list__empty')).toContainText('Nothing matches “zzzz”');
    await app.getByRole('button', { name: 'Show all provinces and territories' }).click();
    await expect(search).toHaveValue('');
  });

  test('"Mark all" fills a region without double counting what was already marked', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Nova Scotia');
    await app.getByRole('button', { name: 'Mark all 4 in Atlantic Provinces as explored' }).click();
    await expect(count(app)).toHaveText('4');
    await expect(app.locator('.progress__groups li').first()).toContainText('4/4');
    await app.getByRole('button', { name: 'Clear all 4 in Atlantic Provinces' }).click();
    await expect(count(app)).toHaveText('0');
  });

  test('undo steps back one change at a time, and Ctrl+Z does the same', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Quebec');
    await tick(app, 'Ontario');
    await tick(app, 'Alberta');
    await expect(count(app)).toHaveText('3');
    await app.getByRole('button', { name: 'Undo' }).click();
    await expect(count(app)).toHaveText('2');
    await expect(row(app, 'Alberta').locator('input[type="checkbox"]')).not.toBeChecked();
    await page.locator('body').press('Control+z');
    await expect(count(app)).toHaveText('1');
    await page.locator('body').press('Control+z');
    await expect(count(app)).toHaveText('0');
    await expect(app.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  test('Start over asks first, clears on confirmation, and can still be undone', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Quebec');
    await tick(app, 'Ontario');
    await app.getByRole('button', { name: 'Start over' }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear this map?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('This removes 2 explored places from this device.');
    await dialog.getByRole('button', { name: 'Keep my map' }).click();
    await expect(dialog).toBeHidden();
    await expect(count(app)).toHaveText('2');

    await app.getByRole('button', { name: 'Start over' }).click();
    await dialog.getByRole('button', { name: 'Clear map' }).click();
    await expect(count(app)).toHaveText('0');
    expect(((await saved(page, 'wtm:v1:map:canada')) as { visited: string[] }).visited).toEqual([]);
    await page.getByRole('button', { name: 'Undo' }).last().click();
    await expect(count(app)).toHaveText('2');
  });

  test('the confirmation dialog closes with Escape and returns focus', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await tick(app, 'Yukon');
    const start = app.getByRole('button', { name: 'Start over' });
    await start.click();
    await expect(page.getByRole('dialog', { name: 'Clear this map?' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Clear this map?' })).toBeHidden();
    await expect(start).toBeFocused();
    await expect(count(app)).toHaveText('1');
  });

  test('keeps the map after a reload', async ({ page }) => {
    let app = await openMap(page, 'canada');
    await clickPlace(page, 'canada', 'CA-BC');
    await tick(app, 'Nunavut');
    await expect(app.locator('.save-state')).toHaveText('Saved on this device');
    await page.reload();
    app = page.locator('.mapapp[data-map="canada"]');
    await expect(app).toHaveAttribute('data-ready', 'true');
    await expect(count(app)).toHaveText('2');
    await expect(shape(app, 'CA-BC')).toHaveAttribute('aria-checked', 'true');
    await expect(shape(app, 'CA-NU')).toHaveAttribute('aria-checked', 'true');
  });

  test('bucket-list places are drawn differently and never counted as explored', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await app.getByRole('radio', { name: 'Want to go' }).check();
    await clickPlace(page, 'canada', 'CA-YT');
    await expect(count(app)).toHaveText('0');
    await expect(shape(app, 'CA-YT')).toHaveClass(/is-wishlist/);
    await expect(shape(app, 'CA-YT')).toHaveAttribute('aria-checked', 'false');
    await expect(shape(app, 'CA-YT')).toHaveAttribute('aria-label', 'Yukon: On your bucket list');
    await expect(app.locator('.progress__facts')).toContainText('1 on your bucket list');

    // The bookmark button in the list does the same job.
    const nunavut = await revealRow(app, 'Nunavut');
    await nunavut.getByRole('button', { name: 'Add Nunavut to your bucket list' }).click();
    await expect(app.locator('.progress__facts')).toContainText('2 on your bucket list');

    // Marking a bucket-list place as explored moves it: it is never in both.
    await app.getByRole('radio', { name: 'Explored' }).check();
    await clickPlace(page, 'canada', 'CA-YT');
    await expect(count(app)).toHaveText('1');
    await expect(app.locator('.progress__facts')).toContainText('1 on your bucket list');
    const stored = (await saved(page, 'wtm:v1:map:canada')) as { visited: string[]; wishlist: string[] };
    expect(stored).toMatchObject({ visited: ['CA-YT'], wishlist: ['CA-NU'] });
  });

  test('shows place coverage and land area as two clearly different numbers', async ({ page }) => {
    const app = await openMap(page, 'canada');
    for (const name of ['Yukon', 'Northwest Territories', 'Nunavut']) await tick(app, name);
    await expect(count(app)).toHaveText('3');
    await expect(percent(app)).toHaveText('23%');
    await expect(app.locator('.progress__percent')).toContainText('of provinces and territories');
    const area = app.locator('.progress__area');
    await expect(area).toContainText('By size:');
    await expect(area.locator('strong.num')).toHaveText('39%');
    await expect(area).toContainText('3,922,000 of 9,985,000 km²');
    await expect(area).toContainText('That is the size of those places, not how much of them you have seen.');
  });

  test('awards achievements by their stated rules', async ({ page }) => {
    const app = await openMap(page, 'canada');
    const badge = (name: string) => app.locator('.achievement', { has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) });
    await expect(app.locator('.achievement')).toHaveCount(7);
    await expect(app.locator('.achievement.is-earned')).toHaveCount(0);
    await expect(badge('First Adventure').locator('.achievement__state')).toHaveText('0/1');

    await tick(app, 'British Columbia');
    await expect(badge('First Adventure').locator('.achievement__state')).toHaveText('Earned');
    await expect(badge('Coast to Coast to Coast').locator('.achievement__state')).toHaveText('1/3');
    await tick(app, 'Nova Scotia');
    await tick(app, 'Yukon');
    await expect(badge('Coast to Coast to Coast')).toHaveClass(/is-earned/);
    await expect(badge('Regional Explorer').locator('.achievement__state')).toHaveText('3/5');
    await tick(app, 'Ontario');
    await tick(app, 'Alberta');
    await expect(badge('Regional Explorer')).toHaveClass(/is-earned/);
    await expect(badge('Halfway There').locator('.achievement__state')).toHaveText('5/7');
    await expect(badge('Complete Explorer').locator('.achievement__state')).toHaveText('5/13');
  });

  test('celebrates all 13 as complete, at exactly 100%', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': { visited: ALL.slice(0, 12), wishlist: [] } });
    const app = await openMap(page, 'canada');
    await expect(count(app)).toHaveText('12');
    await expect(percent(app)).toHaveText('92%');
    await expect(app.locator('.progress__done')).toHaveCount(0);

    await tick(app, 'Nunavut');
    await expect(count(app)).toHaveText('13');
    await expect(percent(app)).toHaveText('100%');
    await expect(app.locator('.progress__done')).toHaveText('Complete');
    await expect(app.locator('.achievement.is-earned')).toHaveCount(7);
    await expect(page.locator('.toast')).toContainText('That is all 13 provinces and territories. Complete Explorer earned.');
    await expect(app.locator('.progress__area strong.num')).toHaveText('100%');
    expect(await eventNames(page)).toContain('map_completed');
  });

  test('zooms in and out with the buttons and shows the whole map again', async ({ page }) => {
    const app = await openMap(page, 'canada');
    const svg = app.locator('.map__svg');
    const zoomIn = app.getByRole('button', { name: 'Zoom in' });
    const zoomOut = app.getByRole('button', { name: 'Zoom out' });
    const whole = app.getByRole('button', { name: 'Show the whole map' });
    await expect(zoomOut).toBeDisabled();
    await expect(whole).toBeDisabled();
    const before = await svg.getAttribute('viewBox');
    await zoomIn.click();
    await expect(zoomOut).toBeEnabled();
    await expect.poll(() => svg.getAttribute('viewBox')).not.toBe(before);
    // A place can still be marked while zoomed in.
    await clickPlace(page, 'canada', 'CA-MB');
    await expect(shape(app, 'CA-MB')).toHaveAttribute('aria-checked', 'true');
    await whole.click();
    await expect.poll(() => svg.getAttribute('viewBox')).toBe(before);
    await expect(zoomOut).toBeDisabled();
  });

  test('ignores saved data that is damaged instead of breaking', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('wtm:v1:map:canada', '{"visited": 7, "wishlist": "x"'));
    const app = await openMap(page, 'canada');
    await expect(count(app)).toHaveText('0');
    await tick(app, 'Ontario');
    await expect(count(app)).toHaveText('1');
  });
});

test.describe('Canada map with the keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'Keyboard navigation is a desktop interaction.');

  test('reaches the map with Tab, moves with the arrow keys and marks with Space', async ({ page }) => {
    const app = await openMap(page, 'canada');
    const focusedId = () => page.evaluate(() => document.activeElement?.getAttribute('data-id') ?? null);

    // The map is one tab stop, straight after the two mode buttons and the toolbar.
    await app.getByRole('radio', { name: 'Explored' }).focus();
    for (let i = 0; i < 6 && !(await focusedId()); i++) await page.keyboard.press('Tab');
    const first = await focusedId();
    expect(first).toMatch(/^CA-/);
    await expect(app.locator('.map__ring').first()).toBeVisible();

    await page.keyboard.press('Space');
    await expect(shape(app, first!)).toHaveAttribute('aria-checked', 'true');
    await expect(count(app)).toHaveText('1');
    await page.keyboard.press('Enter');
    await expect(count(app)).toHaveText('0');

    // Arrow keys visit other places; every one of the 13 can be reached.
    const seen = new Set<string>([first!]);
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
      await page.keyboard.press(key);
      seen.add((await focusedId())!);
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
    for (const id of seen) expect(id).toMatch(/^CA-[A-Z]{2}$/);

    // Tab leaves the map in one step, to the zoom buttons.
    await page.keyboard.press('Tab');
    await expect(app.getByRole('button', { name: 'Zoom in' })).toBeFocused();
  });

  test('every province and territory can be reached by arrow keys alone', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await shape(app, 'CA-ON').focus();
    const reached = new Set<string>(['CA-ON']);
    const frontier = ['CA-ON'];
    // Explore outward from Ontario in all four directions until nothing new turns up.
    while (frontier.length) {
      const from = frontier.shift()!;
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        await shape(app, from).focus();
        await page.keyboard.press(key);
        const now = await page.evaluate(() => document.activeElement?.getAttribute('data-id') ?? '');
        if (now && !reached.has(now)) {
          reached.add(now);
          frontier.push(now);
        }
      }
    }
    expect([...reached].sort()).toEqual([...ALL].sort());
  });

  test('plus, minus and zero zoom the map from the keyboard', async ({ page }) => {
    const app = await openMap(page, 'canada');
    const svg = app.locator('.map__svg');
    const whole = await svg.getAttribute('viewBox');
    await shape(app, 'CA-MB').focus();
    await page.keyboard.press('+');
    await expect.poll(() => svg.getAttribute('viewBox')).not.toBe(whole);
    await page.keyboard.press('0');
    await expect.poll(() => svg.getAttribute('viewBox')).toBe(whole);
  });
});
