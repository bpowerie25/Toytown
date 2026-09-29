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
        () =>
          !!(window as unknown as { map: import('maplibre-gl').Map }).map.getLayer(
            'toytown-buildings',
          ),
      );
      expect(hasBuildings).toBe(true);
      const baseVisibility = await page.evaluate(() =>
        (window as unknown as { map: import('maplibre-gl').Map }).map.getLayoutProperty(
          'toytown-base-buildings',
          'visibility',
        ),
      );
      expect(baseVisibility).toBe('none'); // hidden while the 3D buildings are shown
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
        await page.screenshot({ path: `docs/buildings/${name}-z${zoom}.png` });
      }
    });
  });
}
