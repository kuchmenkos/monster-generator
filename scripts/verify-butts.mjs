import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);

const addBtn = page.getByRole('button', { name: '+1 монстр' });
for (let i = 0; i < 6; i++) {
  await addBtn.click();
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: 'debug-butts-gallery.png' });

const testSeeds = ['butt0', 'butt1', 'butt2', 'butt3', 'butt4', 'butt5', 'butt6', 'butt7', 'butt8', 'butt9'];

async function dragCanvas(dx, dy) {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.52;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 14 });
  await page.mouse.up();
}

for (const seed of testSeeds) {
  await page.goto(`http://127.0.0.1:5173/?seed=${seed}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `debug-butts-${seed}-front.png` });

  await dragCanvas(-180, 0);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `debug-butts-${seed}-back.png` });

  await dragCanvas(90, -120);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `debug-butts-${seed}-left.png` });

  await dragCanvas(-90, 140);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `debug-butts-${seed}-topish.png` });
}

console.log('errors:', errors.length ? errors.join('\n') : '(none)');
if (errors.length) process.exitCode = 1;
await browser.close();
