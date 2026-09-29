import { expect, test, type Page } from '@playwright/test';

const EXAMPLES = [
  { name: 'waterford', title: 'Waterford City' },
  { name: 'tramore', title: 'Tramore' },
];

/** Wait until MapLibre has loaded the style, all visible tiles and glyphs, and stopped moving. */
async function waitForMap(page: Page) {
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
      expect(errors).toEqual([]);

      await expect(page).toHaveScreenshot(`${name}.png`);
    });

    // Screenshots for docs/, not assertions: DOCS_SCREENSHOTS=1 pnpm test:e2e
    test('docs screenshots', async ({ page }) => {
      test.skip(!process.env.DOCS_SCREENSHOTS, 'set DOCS_SCREENSHOTS=1 to regenerate docs/ images');
      await page.goto(`/${name}/`);
      await waitForMap(page);
      for (const zoom of [13, 15, 17]) {
        await page.evaluate(
          (z) => (window as unknown as { map: import('maplibre-gl').Map }).map.jumpTo({ zoom: z }),
          zoom,
        );
        await waitForMap(page);
        await page.screenshot({ path: `docs/style/${name}-z${zoom}.png` });
      }
    });
  });
}
