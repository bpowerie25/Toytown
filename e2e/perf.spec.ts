import { writeFileSync, mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

// Frame-rate measurements, not assertions. Run on real hardware with the GPU:
//   pnpm build && PERF=1 npx playwright test perf
test.skip(!process.env.PERF, 'set PERF=1 to measure performance');
test.setTimeout(240_000);

type W = Window & {
  map: import('maplibre-gl').Map;
  toy: { ready: Promise<void>; stats(): Record<string, unknown> };
};

const PROFILES = [
  { name: 'laptop', viewport: { width: 1440, height: 900 }, dpr: 2, cpuThrottle: 1 },
  { name: 'phone-cpu4x', viewport: { width: 390, height: 844 }, dpr: 3, cpuThrottle: 4 },
];

async function measure(page: Page, seconds: number) {
  return page.evaluate(async (secs) => {
    const map = (window as unknown as W).map;
    const frames: number[] = [];
    const t0 = performance.now();
    let last = t0;
    await new Promise<void>((done) => {
      const step = (now: number) => {
        frames.push(now - last);
        last = now;
        map.setBearing(map.getBearing() + 0.6); // continuous camera motion forces a redraw every frame
        if (now - t0 < secs * 1000) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    frames.shift();
    const sorted = [...frames].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
    return {
      frames: frames.length,
      fps: frames.length / secs,
      p50ms: q(0.5),
      p95ms: q(0.95),
      maxms: sorted.at(-1)!,
    };
  }, seconds);
}

for (const profile of PROFILES) {
  test(`perf ${profile.name}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: profile.dpr,
    });
    const page = await context.newPage();
    if (profile.cpuThrottle > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottle });
    }
    const t0 = Date.now();
    await page.goto('/waterford/');
    await page.waitForFunction(() => !!(window as unknown as W).toy);
    await page.evaluate(() => (window as unknown as W).toy.ready);
    const loadMs = Date.now() - t0;
    await page.evaluate(() =>
      (window as unknown as W).map.jumpTo({
        center: [-7.1105, 52.2605],
        zoom: 16,
        pitch: 60,
        bearing: 0,
      }),
    );
    await page.evaluate(() => (window as unknown as W).toy.ready);
    await page.waitForTimeout(3000); // let lazy loads for the new view finish
    const gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    await measure(page, 2); // warm-up
    const result = await measure(page, 8);
    const stats = await page.evaluate(() => (window as unknown as W).toy.stats());
    const heapMB = await page.evaluate(() =>
      Math.round(
        ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize ?? 0) / 1e6,
      ),
    );
    const out = { profile: profile.name, gpu, loadMs, heapMB, ...result, stats };
    mkdirSync('.cache/perf', { recursive: true });
    writeFileSync(
      `.cache/perf/${process.env.PERF_LABEL ?? 'run'}-${profile.name}.json`,
      JSON.stringify(out, null, 2),
    );
    console.log(
      'PERF',
      JSON.stringify({ ...out, stats: undefined, calls: (stats as { calls?: number }).calls }),
    );
    await context.close();
  });
}
