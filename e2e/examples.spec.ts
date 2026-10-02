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

test.describe('demo', () => {
  type D = Window & {
    map: import('maplibre-gl').Map;
    toy: {
      ready: Promise<void>;
      pick(p: {
        x: number;
        y: number;
      }): { id: string; category: string; osm: string | null } | null;
      setCategoryModel(category: string, url: string): Promise<void>;
      addPack(url: string): Promise<void>;
      stats(): { instances: Record<string, { state: string; visible: number }> };
    };
  };
  const ready = (page: Page) => page.evaluate(() => (window as unknown as D).toy.ready);

  test('clicking a building opens a popup with its category and an OSM link', async ({ page }) => {
    await page.goto('/waterford/');
    await page.waitForFunction(() => !!(window as unknown as D).toy);
    await ready(page);
    // Find a clickable spot near the centre of the view: not a point of interest (those open
    // their own popup) and not under one of their pins.
    const pois = await page.evaluate(async () => {
      const fc = (await (await fetch('./data/pois.geojson')).json()) as {
        features: { properties: { osm?: string } }[];
      };
      return fc.features.map((f) => f.properties.osm).filter(Boolean) as string[];
    });
    const spot = await page.evaluate((pois) => {
      const { map, toy } = window as unknown as D;
      const c = map.getCanvas();
      for (let dy = 0; dy < 200; dy += 10) {
        for (let dx = -200; dx <= 200; dx += 10) {
          const p = { x: c.clientWidth / 2 + dx, y: c.clientHeight / 2 + dy };
          const hit = toy.pick(p);
          if (hit?.osm && !pois.includes(hit.id) && document.elementFromPoint(p.x, p.y) === c)
            return { ...p, hit };
        }
      }
      return null;
    }, pois);
    expect(spot).not.toBeNull();
    expect(spot!.hit.osm).toMatch(/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
    await page.mouse.click(spot!.x, spot!.y);
    const popup = page.locator('.maplibregl-popup-content');
    await expect(popup).toContainText('View on OpenStreetMap');
    await expect(popup.locator('a')).toHaveAttribute('href', spot!.hit.osm!);
  });

  test('points of interest: the tour list flies to a place and opens its story', async ({
    page,
  }) => {
    await page.goto('/waterford/');
    await page.waitForFunction(() => !!(window as unknown as D).toy);
    await expect(page.locator('.poi-pin')).toHaveCount(15);
    await page.locator('.poi-list button', { hasText: "Reginald's Tower" }).click();
    const popup = page.locator('.poi-popup');
    await expect(popup.locator('strong')).toHaveText("Reginald's Tower", { timeout: 15_000 });
    await expect(popup).toContainText('Open to visitors.');
    const c = await page.evaluate(() => (window as unknown as D).map.getCenter().toArray());
    // The place sits below the middle of the view, under its popup.
    expect(c[1]).toBeGreaterThan(52.26047);
    // Next goes on to the second place.
    await popup.getByRole('button', { name: 'Next place' }).click();
    await expect(page.locator('.poi-popup strong')).toHaveText('Greyfriars (the French Church)', {
      timeout: 15_000,
    });
  });

  test("points of interest: clicking a place's building opens its story", async ({ page }) => {
    await page.goto('/waterford/');
    await page.waitForFunction(() => !!(window as unknown as D).toy);
    await page.locator('.poi-list button', { hasText: 'Christ Church Cathedral' }).click();
    await expect(page.locator('.poi-popup strong')).toHaveText('Christ Church Cathedral', {
      timeout: 15_000,
    });
    await ready(page);
    await page.locator('.maplibregl-popup-close-button').click();
    // Search outward from the place's pin, which sits on the building: picking raycasts, and
    // with software WebGL a full-screen scan is too slow.
    const spot = await page.evaluate(() => {
      const { map, toy } = window as unknown as D;
      const c = map.getCanvas();
      const pin = document
        .querySelector('.poi-pin[aria-label$="Christ Church Cathedral"]')!
        .getBoundingClientRect();
      const cx = pin.x + pin.width / 2;
      const cy = pin.y + pin.height / 2;
      for (let r = 20; r <= 200; r += 10)
        for (let a = 0; a < 360; a += 30) {
          const x = cx + r * Math.cos((a * Math.PI) / 180);
          const y = cy + r * Math.sin((a * Math.PI) / 180);
          if (document.elementFromPoint(x, y) === c && toy.pick({ x, y })?.id === 'way/42744158')
            return { x, y };
        }
      return null;
    });
    expect(spot).not.toBeNull();
    await page.mouse.click(spot!.x, spot!.y);
    await expect(page.locator('.poi-popup strong')).toHaveText('Christ Church Cathedral');
  });

  test('landmark buttons fly to verified landmarks', async ({ page }) => {
    await page.goto('/tramore/');
    await page.waitForFunction(() => !!(window as unknown as D).toy);
    await page.getByRole('button', { name: 'The Metal Man' }).click();
    await page.waitForFunction(() => {
      const m = (window as unknown as D).map;
      return !m.isMoving() && Math.abs(m.getCenter().lat - 52.13759) < 1e-4;
    });
    await ready(page);
    const c = await page.evaluate(() => (window as unknown as D).map.getCenter().toArray());
    expect(c[0]).toBeCloseTo(-7.17186, 4);
  });

  test('night theme', async ({ page }) => {
    await page.goto('/waterford/?theme=night');
    await page.waitForFunction(() => !!(window as unknown as D).toy);
    await ready(page);
    await page.waitForTimeout(1_000);
    const bg = await page.evaluate(() =>
      (window as unknown as D).map.getPaintProperty('background', 'background-color'),
    );
    expect(bg).toBe('#1B2238');
    await expect(page).toHaveScreenshot('waterford-night.png');
  });

  test('skin picker switches live, through every built-in skin', async ({ page }) => {
    test.setTimeout(360_000); // about 20 skins, a re-plan and a screenshot each
    // Falling snow is animated; with reduced motion it's off, so screenshots are stable.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/tramore/');
    await page.waitForFunction(() => !!(window as unknown as D).toy);
    await ready(page);
    const skins = await page
      .getByLabel('Skin')
      .locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(skins.length).toBeGreaterThanOrEqual(15);
    for (const skin of skins.filter((s) => s !== 'default' && s !== 'night')) {
      await page.getByLabel('Skin').selectOption(skin);
      await ready(page);
      await page.waitForTimeout(800);
      const state = await page.evaluate(() => {
        const w = window as unknown as D & {
          toy: { getTheme(): { name: string; style: { land: string } } };
        };
        return {
          name: w.toy.getTheme().name,
          land: w.toy.getTheme().style.land,
          bg: w.map.getPaintProperty('background', 'background-color'),
        };
      });
      expect(state.name).toBe(skin);
      expect(state.bg).toBe(state.land);
      await expect(page).toHaveURL(new RegExp(`theme=${skin}`));
      await expect(page).toHaveScreenshot(`tramore-${skin}.png`);
    }
    expect(errors).toEqual([]);
  });

  test('setCategoryModel and addPack re-plan the town', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/waterford/');
    await page.waitForFunction(() => !!(window as unknown as D).toy);
    await ready(page);
    await page.evaluate(async () => {
      const { toy } = window as unknown as D;
      await toy.setCategoryModel('house', './models/generic/barn.glb');
      await toy.addPack('./models/ireland/manifest.json');
      await toy.ready;
    });
    const stats = await page.evaluate(() => (window as unknown as D).toy.stats().instances);
    // Houses now use the override (variants are dropped), and loaded without errors.
    expect(stats.house?.state).toBe('ready');
    expect(stats.house_2).toBeUndefined();
    expect(errors).toEqual([]);
  });
});

test('UMD build works from plain script tags', async ({ page }) => {
  type U = Window & {
    ToyTownGL: { VERSION: string };
    toy: { ready: Promise<void>; stats(): { chunks: { ready: number }; visibleInstances: number } };
  };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/umd/');
  await page.waitForFunction(() => !!(window as unknown as U).toy);
  await page.evaluate(() => (window as unknown as U).toy.ready);
  const r = await page.evaluate(() => ({
    version: (window as unknown as U).ToyTownGL.VERSION,
    stats: (window as unknown as U).toy.stats(),
  }));
  expect(r.version).toMatch(/^\d+\.\d+\.\d+/);
  expect(r.stats.chunks.ready).toBeGreaterThan(0);
  expect(r.stats.visibleInstances).toBeGreaterThan(20);
  expect(errors.filter((e) => !/could not be loaded/.test(e))).toEqual([]);
});
