import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: 'debug-mouths-gallery.png', animations: 'disabled' });
console.log('gallery ok');

const canvas = page.locator('canvas');
const box = await canvas.boundingBox();
if (!box) throw new Error('no canvas');
await page.mouse.click(box.x + box.width * 0.18, box.y + box.height * 0.32);
await page.waitForTimeout(1500);

await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.waitForTimeout(400);
await page.screenshot({ path: 'debug-mouths-talk.png', animations: 'disabled' });
console.log('talk ok');

// Detail bar has dislike as second 👎 — click the one in the bar (not the tab)
const buttons = page.locator('#ui-bar button');
const count = await buttons.count();
for (let i = 0; i < count; i++) {
  const t = await buttons.nth(i).textContent();
  if (t === '👎') {
    await buttons.nth(i).click();
    break;
  }
}
await page.waitForTimeout(1000);
await page.screenshot({ path: 'debug-mouths-dislike.png', animations: 'disabled' });

const disDir = 'feedback/dislikes';
const files = fs.existsSync(disDir) ? fs.readdirSync(disDir) : [];
console.log('dislike files', files);

await page.click('text=← Галерея');
await page.waitForTimeout(600);
await page.locator('#ui-bar button').filter({ hasText: '👎' }).first().click();
await page.waitForTimeout(2000);
await page.screenshot({ path: 'debug-mouths-dislikes-tab.png', animations: 'disabled' });
console.log('dislikes tab ok');

await browser.close();
