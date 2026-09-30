// Capture fixed comparison views of the demos (for before/after design reviews).
//   node scripts/views.mjs <label>   → .cache/views/<label>-<view>.png
// Needs the demo server: node e2e/serve.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const label = process.argv[2] ?? 'now';
const VIEWS = [
  { name: 'waterford-quay', url: '/waterford/', center: [-7.1098, 52.261], zoom: 18, bearing: 30 },
  {
    name: 'waterford-centre',
    url: '/waterford/',
    center: [-7.1105, 52.2605],
    zoom: 17,
    bearing: -20,
  },
  {
    name: 'tramore-street',
    url: '/tramore/',
    center: [-7.1515, 52.1622],
    zoom: 17.8,
    bearing: -30,
  },
  {
    name: 'castlemagner',
    url: '/castlemagner/',
    center: [-8.8265, 52.1655],
    zoom: 17.6,
    bearing: 20,
  },
  {
    name: 'tramore-racecourse',
    url: '/tramore/',
    center: [-7.1487, 52.1727],
    zoom: 16.2,
    bearing: 10,
  },
  {
    name: 'waterford-peoples-park',
    url: '/waterford/',
    center: [-7.1048, 52.2563],
    zoom: 16.8,
    bearing: 0,
  },
  {
    name: 'waterford-walsh-park',
    url: '/waterford/',
    center: [-7.1289, 52.2548],
    zoom: 17.6,
    bearing: 25,
  },
];
// Pass view names after the label to capture only those.
const only = process.argv.slice(3);
mkdirSync('.cache/views', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const v of VIEWS.filter((v) => !only.length || only.includes(v.name))) {
  await page.goto(`http://localhost:4310${v.url}`);
  await page.evaluate(() => document.querySelector('.panel')?.remove());
  await page.waitForFunction(() => !!window.toy);
  await page.evaluate(
    (view) =>
      window.map.jumpTo({ center: view.center, zoom: view.zoom, bearing: view.bearing, pitch: 60 }),
    v,
  );
  await page.evaluate(() => window.toy.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `.cache/views/${label}-${v.name}.png` });
}
await browser.close();
console.log('captured', VIEWS.map((v) => `${label}-${v.name}`).join(', '));
