// Dev helper: node scripts/dev/tour.mjs <url-path> <out-prefix> [width] [height] [--mobile] [--slice=1700]
// Scrolls through the page so lazy content loads, takes one full-page screenshot, then cuts it into readable slices.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
const [, , path = '/', prefix = '/tmp/tour', w = '1440', h = '900', ...flags] = process.argv;
const mobile = flags.includes('--mobile');
const sliceArg = flags.find((f) => f.startsWith('--slice='));
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
const total = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < total; y += +h * 0.8) {
  await page.evaluate((v) => window.scrollTo({ top: v, behavior: "instant" }), y);
  await page.waitForTimeout(220);
}
await page.waitForLoadState('networkidle');
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(500);
const full = prefix + '-full.png';
await page.screenshot({ path: full, fullPage: true });
const meta = await sharp(full, { limitInputPixels: false }).metadata();
const sliceH = (sliceArg ? +sliceArg.slice(8) : mobile ? 1900 : 1700) * (mobile ? 2 : 1);
let i = 0;
for (let top = 0; top < meta.height; top += sliceH) {
  i += 1;
  const height = Math.min(sliceH, meta.height - top);
  if (height < 40) break;
  await sharp(full, { limitInputPixels: false })
    .extract({ left: 0, top, width: meta.width, height })
    .toFile(`${prefix}-${String(i).padStart(2, '0')}.png`);
}
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(`${path}: ${meta.width}x${meta.height} -> ${i} slices; horizontal overflow ${overflow}px`);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
