import { test, type Page } from '@playwright/test';

// Phase 2.5 visual spike screenshots for docs/spike/. Not a regression test:
//   SPIKE_SCREENSHOTS=1 pnpm test:e2e spike
test.skip(!process.env.SPIKE_SCREENSHOTS, 'set SPIKE_SCREENSHOTS=1 to render the spike');

type W = Window & {
  map: import('maplibre-gl').Map;
  spike: { ready: boolean; placements: unknown[] };
};

async function settle(page: Page) {
  await page.waitForFunction(
    () => {
      const w = window as unknown as W;
      return w.spike?.ready && w.map.areTilesLoaded() && !w.map.isMoving();
    },
    undefined,
    { timeout: 60_000, polling: 250 },
  );
  await page.waitForTimeout(1_500);
}

test('spike screenshots', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  for (const zoom of [15, 16, 17]) {
    await page.goto(`/spike/?zoom=${zoom}&pitch=55`);
    await settle(page);
    await page.screenshot({ path: `docs/spike/waterford-z${zoom}.png` });
  }
  const detail = process.env.SPIKE_DETAIL ?? 'zoom=18.5&pitch=60&bearing=-30';
  await page.goto(`/spike/?${detail}`);
  await settle(page);
  await page.screenshot({ path: 'docs/spike/waterford-detail.png' });

  // Calibration: four shops facing N, E, S, W (left to right), camera looking north.
  await page.goto('/spike/?calibrate=1&zoom=19.3&pitch=50&bearing=0');
  await settle(page);
  await page.screenshot({ path: 'docs/spike/calibrate-front.png' });
  // Ambient light only at intensity π: faces should show their exact palette colours.
  await page.goto('/spike/?calibrate=1&zoom=19.3&pitch=50&bearing=0&lighting=ambient');
  await settle(page);
  await page.screenshot({ path: 'docs/spike/calibrate-colour.png' });

  const placements = await page.evaluate(() => (window as unknown as W).spike.placements);
  console.log(JSON.stringify(placements));
  if (errors.length) throw new Error(errors.join('\n'));
});
