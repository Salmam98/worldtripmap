import { chromium } from '@playwright/test';
import fs from 'node:fs';
const out = '/home/claude/scratch/dbg/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
async function open(path, opts = {}) {
  const context = await browser.newContext({ viewport: { width: opts.w ?? 1360, height: opts.h ?? 900 }, deviceScaleFactor: opts.mobile ? 2 : 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, acceptDownloads: true });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(path + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push(path + ' PAGEERROR ' + e.message));
  await page.goto('http://localhost:4321' + path, { waitUntil: 'networkidle' });
  return page;
}
// seed a selection through the handoff hash: v= bits for canada (NL PE NS NB QC ON MB SK AB BC YT NT NU)
let page = await open('/maps/canada/poster/#v=fsg');
await page.waitForSelector('.studio[data-ready="true"]', { timeout: 20000 });
await page.screenshot({ path: out + 'st-desktop.png' });
console.log('places:', await page.locator('.studio__places').innerText());
// change template + text
await page.locator('.template-card', { hasText: 'Nordic Explorer' }).click();
await page.locator('input.input').first().fill('Coast to Coast');
await page.waitForTimeout(600);
await page.screenshot({ path: out + 'st-desktop-nordic.png' });
// bengali name fallback
await page.locator('.template-card', { hasText: 'Midnight Atlas' }).click();
await page.getByLabel('Name or nickname (optional)').fill('সালমান');
await page.getByLabel('Subtitle (optional)').fill('東京から Montréal へ');
await page.waitForTimeout(700);
await page.screenshot({ path: out + 'st-desktop-fallback.png' });
// PNG download
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-png').click()]);
const pngPath = out + 'dl-' + dl.suggestedFilename();
await dl.saveAs(pngPath);
console.log('png', dl.suggestedFilename(), fs.statSync(pngPath).size);
// PDF download
const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('download-pdf').click()]);
const pdfPath = out + 'dl-' + dl2.suggestedFilename();
await dl2.saveAs(pdfPath);
console.log('pdf', dl2.suggestedFilename(), fs.statSync(pdfPath).size);
await page.screenshot({ path: out + 'st-desktop-after.png', fullPage: true });
await page.close();
page = await open('/maps/world/poster/', { w: 390, h: 844, mobile: true });
await page.waitForSelector('.studio[data-ready="true"]', { timeout: 20000 });
await page.screenshot({ path: out + 'st-mobile.png' });
await page.close();
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no console errors');
await browser.close();
