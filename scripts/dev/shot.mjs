// Dev helper: node scripts/dev/shot.mjs <url-path> <out.png> [width] [height] [--full] [--mobile]
import { chromium } from '@playwright/test';
const [, , path = '/', out = '/tmp/shot.png', w = '1280', h = '900', ...flags] = process.argv;
const mobile = flags.includes('--mobile');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const context = await browser.newContext({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile,
  hasTouch: mobile,
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto((process.env.BASE || 'http://localhost:4321') + path, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const script = flags.find((f) => f.startsWith('--eval='));
if (script) { await page.evaluate(script.slice(7)); await page.waitForTimeout(500); }
await page.screenshot({ path: out, fullPage: flags.includes('--full') });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log('saved', out);
await browser.close();
