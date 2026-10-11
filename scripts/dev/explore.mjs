import { chromium } from '@playwright/test';
const out = '/home/claude/scratch/dbg/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
async function open(path, opts = {}) {
  const context = await browser.newContext({ viewport: { width: opts.w ?? 1360, height: opts.h ?? 900 }, deviceScaleFactor: opts.mobile ? 2 : 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(path + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push(path + ' PAGEERROR ' + e.message));
  await page.goto('http://localhost:4321' + path, { waitUntil: 'networkidle' });
  await page.waitForSelector('.mapapp[data-ready="true"]');
  return page;
}
// Desktop Canada: click provinces
let page = await open('/maps/canada/');
for (const id of ['CA-ON', 'CA-QC', 'CA-BC', 'CA-NS']) await page.locator(`.map__shape[data-id="${id}"]`).click({ position: undefined });
await page.locator('.segmented__option', { hasText: 'Want to go' }).click();
await page.locator('.map__shape[data-id="CA-YT"]').click();
await page.locator('.map__shape[data-id="CA-NL"]').hover();
await page.screenshot({ path: out + 'e-canada-desktop.png' });
console.log('count text:', await page.locator('.progress__headline').innerText());
console.log('live:', await page.locator('.mapapp > p[role=status]').innerText());
// keyboard
await page.locator('.map__shape[data-id="CA-ON"]').focus();
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowLeft');
await page.screenshot({ path: out + 'e-canada-kbd.png', clip: { x: 60, y: 200, width: 780, height: 700 } });
console.log('focused:', await page.evaluate(() => document.activeElement?.getAttribute('data-id')));
await page.close();
// Mobile Canada
page = await open('/maps/canada/', { w: 390, h: 844, mobile: true });
await page.screenshot({ path: out + 'e-canada-mobile.png' });
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(300);
await page.screenshot({ path: out + 'e-canada-mobile-scrolled.png' });
await page.close();
// World desktop
page = await open('/maps/world/');
for (const id of ['CAN', 'USA', 'FRA', 'JPN', 'BRA', 'AUS', 'IND', 'ZAF']) await page.locator(`.map__shape[data-id="${id}"]`).first().click({ force: true });
await page.screenshot({ path: out + 'e-world-desktop.png' });
console.log('world count:', await page.locator('.progress__headline').innerText());
await page.close();
page = await open('/maps/world/', { w: 390, h: 844, mobile: true });
await page.screenshot({ path: out + 'e-world-mobile.png' });
await page.close();
page = await open('/maps/canada-cities/');
await page.screenshot({ path: out + 'e-cities-desktop.png' });
await page.close();
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no console errors');
await browser.close();
