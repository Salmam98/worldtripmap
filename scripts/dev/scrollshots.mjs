// Dev helper: node scripts/dev/scrollshots.mjs <url-path> <out-prefix> <w> <h> <y1,y2,...> [--mobile]
// Real viewport screenshots at given scroll offsets (sticky elements render as a visitor sees them).
import { chromium } from '@playwright/test';
const [, , path, prefix, w, h, ys, ...flags] = process.argv;
const mobile = flags.includes('--mobile');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const context = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto((process.env.BASE || 'http://localhost:4321') + path, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
for (const y of ys.split(',')) {
  await page.evaluate((v) => window.scrollTo({ top: +v, behavior: "instant" }), y);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${prefix}-y${y}.png` });
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
