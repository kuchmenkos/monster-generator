import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const logs = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') logs.push(`[console] ${msg.text()}`);
});
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2800);
await page.screenshot({ path: 'debug-mouths-v2-gallery.png' });

// Open first monster
const canvas = page.locator('canvas');
await canvas.click({ position: { x: 200, y: 220 } });
await page.waitForTimeout(800);
await page.screenshot({ path: 'debug-mouths-v2-detail.png' });

// Trigger talk
await canvas.click({ position: { x: 640, y: 450 } });
await page.waitForTimeout(350);
await page.screenshot({ path: 'debug-mouths-v2-talk.png' });

// Dislike to test PNG capture centering
const dislike = page.getByRole('button', { name: /👎/ });
if (await dislike.count()) {
  await dislike.first().click();
  await page.waitForTimeout(600);
}

console.log('logs:', logs.join('\n') || '(none)');
console.log('shots written');

// Check latest dislike png exists and isn't empty corner
const disDir = 'feedback/dislikes';
const pngs = fs
  .readdirSync(disDir)
  .filter((f) => f.endsWith('.png'))
  .map((f) => ({ f, m: fs.statSync(`${disDir}/${f}`).mtimeMs }))
  .sort((a, b) => b.m - a.m);
if (pngs[0]) {
  console.log('latest dislike png:', pngs[0].f, 'bytes', fs.statSync(`${disDir}/${pngs[0].f}`).size);
}

await browser.close();
