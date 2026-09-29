import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

// Frames for the README demo GIF (docs/demo.gif, ~25 s: Waterford and Tramore, day and night).
//   pnpm build && GIF=1 PERF=1 npx playwright test gif && .venv/bin/python assets/generator/make_gif.py
test.skip(!process.env.GIF, 'set GIF=1 to capture README GIF frames');
test.setTimeout(900_000);

type W = Window & { map: import('maplibre-gl').Map; toy: { ready: Promise<void> } };
type View = { zoom: number; bearing: number; pitch: number; center: [number, number] };

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const between =
  (a: View, b: View) =>
  (t: number): View => {
    const e = ease(t);
    return {
      zoom: lerp(a.zoom, b.zoom, e),
      bearing: lerp(a.bearing, b.bearing, e),
      pitch: lerp(a.pitch, b.pitch, e),
      center: [lerp(a.center[0], b.center[0], e), lerp(a.center[1], b.center[1], e)],
    };
  };

const SEGMENTS: { prefix: string; url: string; frames: number; at: (t: number) => View }[] = [
  {
    prefix: 'a-waterford-day',
    url: '/waterford/',
    frames: 48,
    at: between(
      { zoom: 15.8, bearing: -30, pitch: 50, center: [-7.1102, 52.2612] },
      { zoom: 17.3, bearing: 60, pitch: 60, center: [-7.1054, 52.26047] }, // Reginald's Tower
    ),
  },
  {
    prefix: 'b-tramore-day',
    url: '/tramore/',
    frames: 44,
    at: between(
      { zoom: 16.0, bearing: -20, pitch: 55, center: [-7.1535, 52.1625] },
      { zoom: 16.9, bearing: 40, pitch: 60, center: [-7.1455, 52.16] }, // town down to the promenade
    ),
  },
  {
    prefix: 'c-tramore-night',
    url: '/tramore/?theme=night',
    frames: 34,
    at: between(
      { zoom: 16.9, bearing: 40, pitch: 60, center: [-7.1455, 52.16] },
      { zoom: 16.6, bearing: 95, pitch: 58, center: [-7.15, 52.1618] },
    ),
  },
  {
    prefix: 'd-waterford-night',
    url: '/waterford/?theme=night',
    frames: 34,
    at: between(
      { zoom: 17.3, bearing: 60, pitch: 60, center: [-7.1054, 52.26047] },
      { zoom: 16.4, bearing: 130, pitch: 55, center: [-7.1085, 52.2612] },
    ),
  },
];

async function capture(page: Page, prefix: string, count: number, at: (t: number) => View) {
  for (let i = 0; i < count; i++) {
    await page.evaluate((v) => (window as unknown as W).map.jumpTo(v), at(i / (count - 1)));
    await page.evaluate(() => (window as unknown as W).toy.ready);
    await page.screenshot({ path: `.cache/gif/${prefix}-${String(i).padStart(3, '0')}.png` });
  }
}

test('gif frames', async ({ browser }) => {
  mkdirSync('.cache/gif', { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 800, height: 500 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  for (const s of SEGMENTS) {
    await page.goto(s.url);
    await page.evaluate(() => document.querySelector('.panel')?.remove());
    await page.waitForFunction(() => !!(window as unknown as W).toy);
    await capture(page, s.prefix, s.frames, s.at);
  }
  await ctx.close();
});
