import { expect, test, type Page } from '@playwright/test';

const EXAMPLES = [
  { name: 'waterford', title: 'Waterford City' },
  { name: 'tramore', title: 'Tramore' },
];

/** Wait until MapLibre has loaded the style, all visible tiles and glyphs, and stopped moving. */
async function waitForMap(page: Page) {
  // Buildings are meshed in workers; wait for all chunks before judging "idle".
  await page.evaluate(() => (window as unknown as { toy: { ready: Promise<void> } }).toy.ready);
  await page.waitForFunction(
    () => {
      const map = (window as unknown as { map?: import('maplibre-gl').Map }).map;
      return !!map && map.isStyleLoaded() && map.areTilesLoaded() && !map.isMoving();
    },
    undefined,
    { timeout: 60_000, polling: 250 },
  );
  // Let symbol fade-in finish.
  await page.waitForTimeout(1_000);
}

for (const { name, title } of EXAMPLES) {
  test.describe(title, () => {
    test('renders the toy-town style', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

      await page.goto(`/${name}/`);
      await waitForMap(page);

      await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText(
        '© OpenStreetMap contributors',
      );
      const layers = await page.evaluate(() =>
        (window as unknown as { map: import('maplibre-gl').Map }).map
          .getStyle()
          .layers.map((l) => l.id),
      );
      expect(layers).toContain('toytown-base-buildings');
      // Custom layers aren't part of getStyle(), so look the 3D layer up directly.
      const hasBuildings = await page.evaluate(
        () => !!(window as unknown as { map: import('maplibre-gl').Map }).map.getLayer('toytown'),
      );
      expect(hasBuildings).toBe(true);
      const baseVisibility = await page.evaluate(() =>
        (window as unknown as { map: import('maplibre-gl').Map }).map.getLayoutProperty(
          'toytown-base-buildings',
          'visibility',
        ),
      );
      expect(baseVisibility).toBe('none'); // hidden while the 3D buildings are shown
      // Hero models, props and trees in the initial view are loaded and instanced.
      const stats = await page.evaluate(
        () =>
          (
            window as unknown as {
              toy: { stats(): { instances: Record<string, { state: string }> } };
            }
          ).toy.stats().instances,
      );
      const ready = Object.values(stats).filter((g) => g.state === 'ready').length;
      expect(ready).toBeGreaterThan(5);
      expect(Object.values(stats).filter((g) => g.state === 'failed')).toEqual([]);
      expect(errors).toEqual([]);

      await expect(page).toHaveScreenshot(`${name}.png`);
    });

    // Screenshots for docs/, not assertions: DOCS_SCREENSHOTS=1 pnpm test:e2e
    test('docs screenshots', async ({ page }) => {
      test.skip(!process.env.DOCS_SCREENSHOTS, 'set DOCS_SCREENSHOTS=1 to regenerate docs/ images');
      await page.goto(`/${name}/`);
      await waitForMap(page);
      for (const [zoom, bearing] of [
        [15, 0],
        [16, 0],
        [17, -20],
        [18.3, 30],
      ] as const) {
        await page.evaluate(
          ([z, b]) =>
            (window as unknown as { map: import('maplibre-gl').Map }).map.jumpTo({
              zoom: z,
              bearing: b,
              pitch: 58,
            }),
          [zoom, bearing] as const,
        );
        await waitForMap(page);
        await page.screenshot({ path: `docs/toon/${name}-z${zoom}.png` });
      }
    });
  });
}

test('globe projection: 3D is off until globe has blended into mercator', async ({ page }) => {
  type G = Window & {
    map: import('maplibre-gl').Map;
    toy: { ready: Promise<void>; stats(): { drawing: boolean } };
  };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/waterford/');
  await page.evaluate(() => (window as unknown as G).toy.ready);
  const at = async (zoom: number) => {
    await page.evaluate((z) => (window as unknown as G).map.jumpTo({ zoom: z, pitch: 0 }), zoom);
    await page.waitForFunction(() => !(window as unknown as G).map.isMoving());
    await page.waitForTimeout(500);
    return page.evaluate(() => ({
      drawing: (window as unknown as G).toy.stats().drawing,
      base: (window as unknown as G).map.getLayoutProperty('toytown-base-buildings', 'visibility'),
    }));
  };
  await page.evaluate(() => (window as unknown as G).map.setProjection({ type: 'globe' }));
  expect(await at(4)).toEqual({ drawing: false, base: 'visible' });
  expect(await at(17)).toEqual({ drawing: true, base: 'none' });
  expect(errors).toEqual([]);
});

test('levels of detail by zoom', async ({ page }) => {
  type L = Window & {
    map: import('maplibre-gl').Map;
    toy: {
      ready: Promise<void>;
      stats(): {
        level: number;
        chunks: { visible: number; ready: number };
        visibleInstances: number;
        calls: number;
      };
    };
  };
  await page.goto('/waterford/?debug');
  await page.waitForFunction(() => !!(window as unknown as L).toy);
  const at = async (zoom: number) => {
    await page.evaluate((z) => (window as unknown as L).map.jumpTo({ zoom: z, pitch: 55 }), zoom);
    await page.evaluate(() => (window as unknown as L).toy.ready);
    await page.waitForTimeout(300);
    return page.evaluate(() => ({
      stats: (window as unknown as L).toy.stats(),
      base: (window as unknown as L).map.getLayoutProperty('toytown-base-buildings', 'visibility'),
      overlay: document.querySelector('.toytown-debug')?.textContent ?? '',
    }));
  };
  const z13 = await at(13.5);
  expect([z13.stats.level, z13.base]).toEqual([0, 'visible']);
  const z14 = await at(14.5);
  expect([z14.stats.level, z14.base, z14.stats.visibleInstances]).toEqual([1, 'none', 0]);
  expect(z14.stats.chunks.ready).toBeGreaterThanOrEqual(z14.stats.chunks.visible);
  const z15 = await at(15.5);
  expect([z15.stats.level, z15.stats.visibleInstances]).toEqual([2, 0]);
  const z16 = await at(16.5);
  expect(z16.stats.level).toBe(3);
  expect(z16.stats.visibleInstances).toBeGreaterThan(50);
  expect(z16.overlay).toContain('lod full + models');
});
