import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));
const logs = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') logs.push(msg.text());
});
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/monster-crisp.png', timeout: 15000, animations: 'disabled' });
console.log('screenshot ok', logs.join(' | '));
await browser.close();
