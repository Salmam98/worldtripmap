// Dev helper: finds words glued to inline elements ("the<a>maps page</a>") in the rendered DOM of every page.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://localhost:4321';
const sitemap = readFileSync('dist/sitemap.xml', 'utf8');
const paths = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1]);
paths.push('/404.html');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let total = 0;
for (const path of paths) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const found = await page.evaluate(() => {
    const out = [];
    const inline = document.querySelectorAll('p a, li a, p strong, li strong, p em, li em, p b, p code, li code, dd a, td a, figcaption a, span a, p button');
    for (const el of inline) {
      if (getComputedStyle(el).display !== 'inline') continue;
      const prev = el.previousSibling;
      const next = el.nextSibling;
      const text = (el.textContent || '').trim();
      if (!text) continue;
      if (prev && prev.nodeType === 3 && /[\p{L}\p{N}.,;:!?)’”]$/u.test(prev.textContent || '')) {
        if (!/[(“‘\/-]$/.test(prev.textContent)) out.push(`…${(prev.textContent || '').slice(-18)}⟨${text.slice(0, 24)}⟩`);
      }
      if (next && next.nodeType === 3 && /^[\p{L}\p{N}(“]/u.test(next.textContent || '')) {
        out.push(`⟨${text.slice(-24)}⟩${(next.textContent || '').slice(0, 18)}…`);
      }
    }
    return out;
  });
  if (found.length) {
    total += found.length;
    console.log(path + '\n  ' + found.join('\n  '));
  }
}
console.log(`checked ${paths.length} pages, ${total} glued joins`);
await browser.close();
