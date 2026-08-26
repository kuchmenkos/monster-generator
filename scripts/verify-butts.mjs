import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'debug-butts-gallery.png' });

const testSeeds = ['butt0', 'butt1', 'butt2', 'butt3', 'butt4', 'butt5', 'butt6', 'butt7', 'butt8', 'butt9'];

for (const seed of testSeeds) {
  await page.goto(`http://127.0.0.1:5173/?seed=${seed}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `debug-butts-${seed}-front.png` });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.52;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 180, cy, { steps: 12 });
    await page.mouse.up();
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `debug-butts-${seed}-back.png` });
}

console.log('errors:', errors.length ? errors.join('\n') : '(none)');
if (errors.length) process.exitCode = 1;
await browser.close();
