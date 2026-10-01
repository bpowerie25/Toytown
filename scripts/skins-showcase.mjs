// The "one town, many looks" images: every built-in skin from the same view, as a grid and a GIF.
//   node e2e/serve.mjs & node scripts/skins-showcase.mjs  → .cache/showcase/<skin>.png
// then: .venv/bin/python scripts/skins-showcase.py  → docs/skins/grid.jpg, docs/skins/skins.gif
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const VIEW = { center: [-7.1515, 52.1622], zoom: 17.7, bearing: -30, pitch: 60 };
mkdirSync('.cache/showcase', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
await page.emulateMedia({ reducedMotion: 'reduce' }); // no falling snow in stills
await page.goto('http://localhost:4310/tramore/');
await page.evaluate(() => document.querySelector('.panel')?.remove());
await page.waitForFunction(() => !!window.toy);
await page.evaluate((v) => window.map.jumpTo(v), VIEW);
await page.evaluate(() => window.toy.ready);
const names = [
  'default',
  'night',
  'sitcom',
  'pastel',
  'toybox',
  'voxel',
  'chunky',
  'retro',
  'neon',
  'vintage',
  'sketch',
  'handdrawn',
  'comic',
  'blueprint',
  'golden',
  'autumn',
  'winter',
  'christmas',
  'halloween',
  'shamrock',
];
for (const s of names) {
  await page.evaluate((s) => window.toy.setTheme(s), s);
  await page.evaluate(() => window.toy.ready);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `.cache/showcase/${s}.png` });
  console.log('captured', s);
}
await browser.close();
