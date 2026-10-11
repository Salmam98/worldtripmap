import { bytesOf, count, eventNames, events, expect, openMap, pngInfo, seed, shape, test, tick } from './fixtures';

const THREE = { visited: ['CA-ON', 'CA-QC', 'CA-BC'], wishlist: ['CA-NU'] };

test.describe('sharing a map', () => {
  test('the share link holds the places and the name, and nothing is sent anywhere', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await seed(page, { 'wtm:v1:map:canada': THREE });
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    const app = await openMap(page, 'canada');
    const before = requests.length;

    await app.getByRole('button', { name: 'Share', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Share your map' });
    await expect(dialog).toContainText('Anyone with this link can see the places you have marked. They cannot change your map.');
    const link = dialog.getByLabel('Link');
    await expect(link).toHaveValue(`${baseURL}/maps/canada/#v=DE`);
    await dialog.getByLabel('Your name or nickname (optional)').fill('Salman');
    await expect(link).toHaveValue(`${baseURL}/maps/canada/#v=DE&n=Salman`);
    await expect(dialog).toContainText('The link itself holds your places and this name. Nothing is uploaded or stored by us.');

    await dialog.getByRole('button', { name: 'Copy' }).click();
    await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/maps/canada/#v=DE&n=Salman`);
    await expect(page.locator('.toast')).toContainText('Link copied.');
    expect((await events(page)).filter((e) => e.name === 'share_initiated')[0].props).toEqual({ map: 'canada', kind: 'share', method: 'copy-link' });

    // Building and copying a link made no network request at all.
    expect(requests.slice(before)).toEqual([]);
    // The bucket list is private: it is not part of a share link.
    expect(await link.inputValue()).not.toContain('w=');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
  });

  test('warns before sharing an empty map', async ({ page }) => {
    const app = await openMap(page, 'canada');
    await app.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Share your map' }).locator('.notice--warn')).toHaveText('You have not marked any places yet, so the link will show an empty map.');
  });

  test('makes a picture of the map on the device, in post and story shapes', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': THREE });
    const app = await openMap(page, 'canada');
    await app.getByRole('button', { name: 'Share', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Share your map' });
    for (const [button, width, height] of [
      ['Post, 4:5', 1080, 1350],
      ['Story, 9:16', 1080, 1920],
    ] as const) {
      const [file] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: button }).click()]);
      expect(pngInfo(await bytesOf(file))).toMatchObject({ width, height });
    }
    await expect(dialog.getByRole('link', { name: 'Design it first' })).toHaveAttribute('href', /\/maps\/canada\/poster\/#v=DE&w=AAg$/);
  });

  test('someone who opens the link sees that map, read-only, with the name shown as plain text', async ({ page }) => {
    const app = await openMap(page, 'canada', '#v=DEA&n=Salman');
    const banner = page.locator('.friend-banner');
    await expect(banner).toContainText('You are looking at Salman’s map: 3 of 13 provinces and territories explored.');
    await expect(app.locator('.progress__count')).toHaveText('3');
    await expect(app.locator('.progress__of')).toHaveText('of 13 provinces and territories explored by Salman');
    await expect(app.locator('.progress__note')).toHaveText('Quebec, Ontario and British Columbia.');
    const ontario = app.locator('.map__svg [data-id="CA-ON"]').first();
    await expect(ontario).toHaveAttribute('role', 'img');
    await expect(ontario).toHaveAttribute('aria-label', 'Ontario: Explored by Salman');
    await expect(app.locator('.map__svg [role="checkbox"]')).toHaveCount(0);
    await expect(app.locator('.save-state')).toContainText('View only. Choose “My map” to mark your own places.');
    await expect(app.locator('.legend')).toContainText('Explored by Salman');
    // Nothing of theirs is written into this browser's own map.
    expect(await page.evaluate(() => localStorage.getItem('wtm:v1:map:canada'))).toBeNull();
    expect(await eventNames(page)).not.toContain('challenge_link_opened');
  });

  test('a visitor can leave a shared map and start their own', async ({ page }) => {
    const app = await openMap(page, 'canada', '#v=DEA&n=Salman');
    await app.getByRole('button', { name: 'Make my own map' }).click();
    await expect(count(app)).toHaveText('0');
    await tick(app, 'Manitoba');
    await expect(count(app)).toHaveText('1');
    await page.getByRole('button', { name: 'Close shared map' }).click();
    await expect(page.locator('.friend-banner')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
    await expect(count(app)).toHaveText('1');
  });

  test('a name in the link can never inject markup', async ({ page }) => {
    page.on('dialog', () => {
      throw new Error('Markup in a share link ran as script.');
    });
    const name = '<img src=x onerror=alert(1)>';
    await openMap(page, 'canada', `#v=DEA&n=${encodeURIComponent(name)}`);
    const banner = page.locator('.friend-banner');
    await expect(banner).toContainText(`${name}’s map`);
    expect(await banner.locator('img').count()).toBe(0);
    expect(await page.locator('.mapapp img').count()).toBe(0);
  });

  test('a long or strange name is shortened and flattened', async ({ page }) => {
    const long = `${'N'.repeat(90)}‮\n<b>`;
    await openMap(page, 'canada', `#v=DEA&n=${encodeURIComponent(long)}`);
    const text = await page.locator('.friend-banner__text strong').first().innerText();
    expect(text).toBe(`${'N'.repeat(40)}’s`);
  });

  for (const junk of ['#v=', '#v=%3Cscript%3Ealert(1)%3C/script%3E', '#faq', '#v=!!!!', `#v=${'A'.repeat(200)}`, '#n=only-a-name']) {
    test(`ignores a link it cannot read: ${junk.slice(0, 24)}`, async ({ page }) => {
      const app = await openMap(page, 'canada', junk);
      await expect(page.locator('.friend-banner')).toHaveCount(0);
      await expect(count(app)).toHaveText('0');
      await expect(app.getByRole('radio', { name: 'Explored' })).toBeVisible();
    });
  }
});

test.describe('challenge a friend', () => {
  test('the challenge link says so, and carries the count', async ({ page, baseURL }) => {
    await seed(page, { 'wtm:v1:map:canada': THREE, 'wtm:v1:profile': { name: 'Salman' } });
    const app = await openMap(page, 'canada');
    await app.getByRole('button', { name: 'Challenge a friend' }).click();
    const dialog = page.getByRole('dialog', { name: 'Challenge a friend' });
    await expect(dialog).toContainText('They mark their own map, then you both see who has explored more and where you overlap.');
    await expect(dialog.getByLabel('Your name or nickname (optional)')).toHaveValue('Salman');
    await expect(dialog.getByLabel('Link')).toHaveValue(`${baseURL}/maps/canada/#v=DE&n=Salman&c=1`);
  });

  test('a friend marks their own map, then compares the two', async ({ page }) => {
    const app = await openMap(page, 'canada', '#v=DEA&n=Salman&c=1');
    const banner = page.locator('.friend-banner');
    await expect(banner).toContainText('Salman has explored 3 of 13 provinces and territories. Mark where you have been, then compare.');
    expect(await eventNames(page)).toContain('challenge_link_opened');
    // The friend starts on their own, empty, editable map.
    await expect(count(app)).toHaveText('0');
    await expect(shape(app, 'CA-ON')).toHaveAttribute('aria-checked', 'false');

    for (const name of ['Ontario', 'Nova Scotia', 'Yukon', 'Alberta']) await tick(app, name);
    await expect(count(app)).toHaveText('4');
    await banner.getByRole('radio', { name: 'Compare' }).check();

    const compare = app.locator('.compare');
    await expect(compare.getByRole('heading', { name: 'You and Salman' })).toBeVisible();
    await expect(compare.locator('.compare__verdict')).toHaveText('You are ahead by 1.');
    await expect(compare.locator('.compare__scores dd')).toHaveText(['4', '3', '1']);
    await expect(compare.locator('.compare__lists dd')).toHaveText(['Ontario', 'Nova Scotia, Alberta and Yukon', 'Quebec and British Columbia']);
    await expect(app.locator('.legend')).toHaveText(/Both of you.*Only you.*Only Salman.*Neither/s);
    await expect(app.locator('.map__svg [data-id="CA-ON"]').first()).toHaveClass(/is-both/);
    await expect(app.locator('.map__svg [data-id="CA-NS"]').first()).toHaveClass(/is-you/);
    await expect(app.locator('.map__svg [data-id="CA-QC"]').first()).toHaveClass(/is-friend/);
    await expect(app.locator('.map__svg [data-id="CA-QC"]').first()).toHaveAttribute('aria-label', 'Quebec: Only Salman');
    expect((await eventNames(page)).filter((n) => n === 'challenge_completed')).toHaveLength(1);

    // Looking again does not count as completing the challenge twice.
    await banner.getByRole('radio', { name: 'My map' }).check();
    await banner.getByRole('radio', { name: 'Compare' }).check();
    expect((await eventNames(page)).filter((n) => n === 'challenge_completed')).toHaveLength(1);

    // Sending the map back offers the friend's own challenge link.
    await app.getByRole('button', { name: 'Send your map back' }).click();
    await expect(page.getByRole('dialog', { name: 'Challenge a friend' }).getByLabel('Link')).toHaveValue(/#v=JK&c=1$/);
  });

  test('a tie and a friend without a name are worded sensibly', async ({ page }) => {
    await seed(page, { 'wtm:v1:map:canada': { visited: ['CA-NL', 'CA-PE', 'CA-NS'], wishlist: [] } });
    const app = await openMap(page, 'canada', '#v=DEA&c=1');
    await expect(page.locator('.friend-banner')).toContainText('Your friend has explored 3 of 13');
    await page.locator('.friend-banner').getByRole('radio', { name: 'Compare' }).check();
    await expect(app.locator('.compare__verdict')).toHaveText('It is a tie: 3 each.');
    await expect(app.locator('.compare__lists dd').first()).toHaveText('None yet');
  });

  test('works on the world map, counting only the 195', async ({ page, context }) => {
    await seed(page, { 'wtm:v1:map:world': { visited: ['CAN', 'GRL'], wishlist: [] } });
    const app = await openMap(page, 'world');
    await app.getByRole('button', { name: 'Challenge a friend' }).click();
    const link = await page.getByRole('dialog', { name: 'Challenge a friend' }).getByLabel('Link').inputValue();
    expect(link).toMatch(/\/maps\/world\/#v=[A-Za-z0-9_-]+&c=1$/);

    const friend = await context.newPage();
    await friend.goto(link);
    await expect(friend.locator('.mapapp[data-map="world"]')).toHaveAttribute('data-ready', 'true');
    // Greenland is in the link, and is shown, but is not one of the 195.
    await expect(friend.locator('.friend-banner')).toContainText('Your friend has explored 1 of 195 countries.');
    await friend.close();
  });
});
