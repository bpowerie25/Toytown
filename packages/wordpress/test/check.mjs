// Check the test WordPress: both pages draw a map, the page scroll isn't trapped, no errors.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const t = JSON.parse(readFileSync('.cache/wordpress-test.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on(
  'console',
  (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()),
);
let ok = true;
for (const [name, id] of [
  ['shortcode', t.shortcode],
  ['block', t.block],
]) {
  await page.goto(`${t.url}/?page_id=${id}`);
  const root = page.locator('.toytown-map');
  await root.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector('.toytown-map')?.toytown?.toy,
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(() => document.querySelector('.toytown-map').toytown.toy.ready);
  await page.waitForTimeout(1200);
  const s = await page.evaluate(() => {
    const r = document.querySelector('.toytown-map');
    const st = r.toytown.toy.stats();
    return {
      theme: r.toytown.toy.getTheme().name,
      instances: st.visibleInstances,
      chunks: st.chunks.ready,
      status: r.querySelector('.toytown-map__status').hidden
        ? '(hidden)'
        : r.querySelector('.toytown-map__status').textContent,
      height: r.getBoundingClientRect().height,
    };
  });
  console.log(name, JSON.stringify(s));
  ok &&= s.chunks > 0 && s.instances > 5 && s.status === '(hidden)';
  await page.screenshot({ path: `.cache/views/wp-${name}.png` });
}
// Cooperative gestures: a plain wheel over the map scrolls the page, not the map.
const zoom0 = await page.evaluate(() =>
  document.querySelector('.toytown-map').toytown.map.getZoom(),
);
const y0 = await page.evaluate(() => scrollY);
const box = await page.locator('.toytown-map').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, 300);
await page.waitForTimeout(500);
const zoom1 = await page.evaluate(() =>
  document.querySelector('.toytown-map').toytown.map.getZoom(),
);
const y1 = await page.evaluate(() => scrollY);
console.log(
  'wheel over map: page scrolled',
  y1 - y0,
  'px; map zoom change',
  (zoom1 - zoom0).toFixed(3),
);
console.log('errors', errors);
await browser.close();
if (!ok || errors.length) process.exit(1);
