// Dev helper: screenshots of a tool page's stand-in in its three states (loading, scripts off, failed).
//   node scripts/dev/states.mjs <url-path> <out-dir> [width] [height] [--mobile]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [, , path = '/maps/canada/', out = '/tmp/states', w = '1366', h = '900', ...flags] = process.argv;
const mobile = flags.includes('--mobile');
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:4321';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const name = path.replace(/\W+/g, '-').replace(/^-|-$/g, '') + (mobile ? '-phone' : '-desktop');
for (const state of ['loading', 'failed', 'nojs']) {
  const context = await browser.newContext({
    viewport: { width: +w, height: +h },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    javaScriptEnabled: state !== 'nojs',
  });
  const page = await context.newPage();
  if (state !== 'nojs') {
    await page.clock.install();
    await page.route('**/_astro/*.js', (route) => route.abort());
  }
  await page.goto(base + path, { waitUntil: 'load' });
  if (state === 'failed') await page.clock.runFor(13_000);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-${state}.png` });
  console.log('saved', `${out}/${name}-${state}.png`);
  await context.close();
}
await browser.close();
