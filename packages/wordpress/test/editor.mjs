// Check the block in the editor: the live preview renders, and a new block shows the place search.
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
await page.goto(`${t.url}/wp-admin/post.php?post=${t.block}&action=edit`, {
  waitUntil: 'domcontentloaded',
});
// Close the first-visit welcome guide if it shows.
const guide = page.locator('.components-modal__screen-overlay button[aria-label="Close"]');
await guide.click({ timeout: 8000 }).catch(() => {});
const canvas = page.frameLocator('iframe[name="editor-canvas"]');
const preview = canvas.frameLocator('iframe.toytown-map-preview');
await preview.locator('.toytown-map__canvas canvas').first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(5000);
const frame = page.frames().find((f) => f.url().includes('preview.html'));
const state = await frame.evaluate(async () => {
  const r = document.querySelector('.toytown-map');
  await r.toytown.toy.ready;
  return {
    theme: r.toytown.toy.getTheme().name,
    instances: r.toytown.toy.stats().visibleInstances,
  };
});
console.log('editor preview', JSON.stringify(state));
await page.screenshot({ path: '.cache/views/wp-editor.png' });
// Settings sidebar shows the skin picker with all 20 skins.
await canvas.locator('.wp-block-toytown-map').click();
const skin = page.locator('select').filter({ hasText: 'Sitcom' });
await skin.waitFor({ timeout: 10_000 });
const options = await skin.locator('option').count();
// Pick another skin: the preview reloads in it.
await skin.selectOption('neon');
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('iframe')].some((f) =>
      f.contentDocument?.querySelector('iframe.toytown-map-preview')?.src.includes('neon'),
    ),
  undefined,
  { timeout: 10_000 },
);
// The preview reloads in the new skin (its own frame; check from Playwright's side).
const previewTheme = async () => {
  for (const f of page.frames().filter((f) => f.url().includes('preview.html'))) {
    const name = await f
      .evaluate(() => document.querySelector('.toytown-map')?.toytown?.toy?.getTheme().name)
      .catch(() => undefined);
    if (name) return name;
  }
};
for (let i = 0; i < 60 && (await previewTheme()) !== 'neon'; i++) await page.waitForTimeout(500);
if ((await previewTheme()) !== 'neon') throw new Error('preview did not switch to neon');
console.log('skin options in sidebar', options, '; preview re-rendered in', await previewTheme());
await page.waitForTimeout(4000);
await page.screenshot({ path: '.cache/views/wp-editor-neon.png' });
console.log('errors', errors);
await browser.close();
