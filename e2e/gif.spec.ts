import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

// Frames for the README GIF (docs/demo.gif); assemble with assets/generator/make_gif.py.
//   pnpm build && GIF=1 PERF=1 npx playwright test gif && .venv/bin/python assets/generator/make_gif.py
test.skip(!process.env.GIF, 'set GIF=1 to capture README GIF frames');
test.setTimeout(600_000);

type W = Window & { map: import('maplibre-gl').Map; toy: { ready: Promise<void> } };

async function frames(
  page: Page,
  prefix: string,
  count: number,
  at: (t: number) => { zoom: number; bearing: number; pitch: number; center: [number, number] },
) {
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
  const ease = (t: number) => t * t * (3 - 2 * t);
  const tower: [number, number] = [-7.1054, 52.26047];
  const quay: [number, number] = [-7.1102, 52.2612];
  for (const [theme, prefix] of [
    ['default', 'a-day'],
    ['night', 'b-night'],
  ] as const) {
    await page.goto(`/waterford/${theme === 'night' ? '?theme=night' : ''}`);
    await page.evaluate(() => document.querySelector('.panel')?.remove());
    await page.waitForFunction(() => !!(window as unknown as W).toy);
    await page.evaluate(() => (window as unknown as W).toy.ready);
    if (theme === 'default') {
      await frames(page, prefix, 40, (t) => {
        const e = ease(t);
        return {
          zoom: 15.8 + 1.5 * e,
          bearing: -30 + 90 * e,
          pitch: 50 + 10 * e,
          center: [quay[0] + (tower[0] - quay[0]) * e, quay[1] + (tower[1] - quay[1]) * e],
        };
      });
    } else {
      await frames(page, prefix, 20, (t) => ({
        zoom: 17.3,
        bearing: 60 + 40 * ease(t),
        pitch: 60,
        center: tower,
      }));
    }
  }
  await ctx.close();
});
