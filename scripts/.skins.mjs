import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4310/waterford/');
await page.evaluate(() => document.querySelector('.panel')?.remove());
await page.waitForFunction(() => !!window.toy);
await page.evaluate(() =>
  window.map.jumpTo({ center: [-7.1105, 52.2605], zoom: 17.2, bearing: -20, pitch: 60 }),
);
await page.evaluate(() => window.toy.ready);
for (const s of process.argv.slice(2)) {
  await page.evaluate((s) => window.toy.setTheme(s), s);
  await page.evaluate(() => window.toy.ready);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `.cache/views/sk-${s}.png` });
}
console.log('errors', errs);
await browser.close();
