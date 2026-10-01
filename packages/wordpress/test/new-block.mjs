// A new user's flow in the editor: insert the block, search for a place (one real Nominatim
// query), pick it, and see the preview of that place.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const t = JSON.parse(readFileSync('.cache/wordpress-test.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${t.url}/wp-login.php`, { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', t.user);
await page.fill('#user_pass', t.password);
await page.click('#wp-submit');
await page.waitForURL(/wp-admin/);
await page.goto(`${t.url}/wp-admin/post-new.php?post_type=page`, { waitUntil: 'domcontentloaded' });
await page
  .locator('.components-modal__screen-overlay button[aria-label="Close"]')
  .click({ timeout: 8000 })
  .catch(() => {});
await page.waitForFunction(() => window.wp?.data?.select('core/block-editor'));
await page.evaluate(() =>
  window.wp.data
    .dispatch('core/block-editor')
    .insertBlocks(window.wp.blocks.createBlock('toytown/map')),
);
const canvas = page.frameLocator('iframe[name="editor-canvas"]');
const search = canvas.locator('.components-placeholder input[type="text"]');
await search.fill('Tramore, Waterford');
await canvas.locator('.components-placeholder button', { hasText: 'Search' }).click();
const first = canvas.locator('.toytown-map-search__results button').first();
await first.waitFor({ timeout: 20_000 });
console.log('first result:', (await first.textContent()).slice(0, 70));
await first.click();
const theme = async () => {
  for (const f of page.frames().filter((f) => f.url().includes('preview.html'))) {
    const s = await f
      .evaluate(() => {
        const r = document.querySelector('.toytown-map');
        return (
          r?.toytown?.toy &&
          r.toytown.map
            .getCenter()
            .toArray()
            .map((x) => x.toFixed(3))
            .join(',')
        );
      })
      .catch(() => undefined);
    if (s) return s;
  }
};
for (let i = 0; i < 60 && !(await theme()); i++) await page.waitForTimeout(500);
console.log('preview centred at', await theme());
// Frame the town in the preview (as a user would by dragging), then save that view.
const pf = page.frames().find((f) => f.url().includes('preview.html'));
await pf.evaluate(() =>
  document
    .querySelector('.toytown-map')
    .toytown.map.jumpTo({ center: [-7.1515, 52.1622], zoom: 17, pitch: 60, bearing: -30 }),
);
const use = page.locator('.block-editor-block-inspector button', { hasText: 'Use this view' });
await use.waitFor({ timeout: 10_000 });
await use.click();
const attrs = await page.evaluate(() => {
  const b = window.wp.data
    .select('core/block-editor')
    .getBlocks()
    .find((x) => x.name === 'toytown/map');
  const { lat, lng, zoom, pitch, bearing, place } = b.attributes;
  return { lat, lng, zoom, pitch, bearing, place };
});
console.log('saved view', JSON.stringify(attrs));
for (let i = 0; i < 60 && (await theme()) !== '-7.152,52.162'; i++) await page.waitForTimeout(500);
console.log('preview now centred at', await theme());
await page.waitForTimeout(6000);
await page.screenshot({ path: '.cache/views/wp-new-block.png' });
console.log('errors', errors);
await browser.close();
