import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

// Open via seed URL → detail mode directly
await page.goto('http://127.0.0.1:5173/?seed=smoketest1', {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await page.waitForTimeout(2500);
await page.screenshot({ path: 'debug-v3-detail-a.png' });

// Next via arrow
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'debug-v3-detail-b.png' });

await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'debug-v3-detail-c.png' });

// Dislike — detail-mode button (not gallery tab)
await page.locator('button').filter({ hasText: /^👎$/ }).click({ timeout: 5000 }).catch(async () => {
  // Fallback: any visible thumbs-down in header
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const d = btns.find((b) => b.textContent?.trim() === '👎' && b.offsetParent !== null);
    d?.click();
  });
});
await page.waitForTimeout(900);

// Back to gallery
await page.keyboard.press('Escape');
await page.waitForTimeout(3500);
await page.screenshot({ path: 'debug-v3-gallery.png' });

const addBtn = page.getByRole('button', { name: /\+4/ });
if (await addBtn.count()) {
  await addBtn.first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'debug-v3-gallery-more.png' });
}

console.log('errors:', errors.length ? errors.join('\n') : '(none)');
const disDir = 'feedback/dislikes';
const pngs = fs
  .readdirSync(disDir)
  .filter((f) => f.endsWith('.png'))
  .map((f) => ({ f, m: fs.statSync(`${disDir}/${f}`).mtimeMs }))
  .sort((a, b) => b.m - a.m);
if (pngs[0]) console.log('latest png', pngs[0].f, fs.statSync(`${disDir}/${pngs[0].f}`).size);

for (const s of [
  'debug-v3-gallery.png',
  'debug-v3-detail-a.png',
  'debug-v3-detail-b.png',
  'debug-v3-detail-c.png',
]) {
  console.log(fs.existsSync(s) ? `ok ${s}` : `missing ${s}`);
}

if (errors.length) process.exitCode = 1;
await browser.close();
