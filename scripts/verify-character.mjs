import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: 'debug-character-gallery.png', animations: 'disabled' });
console.log('gallery ok');

// Click first monster via canvas center-ish of first cell
const canvas = page.locator('canvas');
const box = await canvas.boundingBox();
if (!box) throw new Error('no canvas');
// Approximate first cell (centered gallery)
await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.35);
await page.waitForTimeout(2000);
await page.screenshot({ path: 'debug-character-detail.png', animations: 'disabled' });
console.log('detail ok');

// Like
await page.click('text=♡');
await page.waitForTimeout(400);
await page.screenshot({ path: 'debug-character-liked.png', animations: 'disabled' });
console.log('liked ok');

// Back + favorites tab
await page.click('text=← Галерея');
await page.waitForTimeout(800);
await page.click('text=/Улюблені/');
await page.waitForTimeout(2000);
await page.screenshot({ path: 'debug-character-favorites.png', animations: 'disabled' });
console.log('favorites ok');

await browser.close();
