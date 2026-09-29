// Phase 7 acceptance: `npm i toytown-gl` plus the README quick start works in a fresh Vite
// project. Runs against the packed tarballs (exactly what npm would publish), so it can pass
// before anything is published. Used locally and in CI.
//
//   pnpm build && node scripts/acceptance.mjs
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const work = join(root, '.cache/acceptance');
const sh = (cmd, cwd = work) =>
  execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'pack'), { recursive: true });

// 1. Pack both packages the way they'd be published.
for (const pkg of ['packages/core', 'packages/models'])
  sh(`pnpm pack --pack-destination ${join(work, 'pack')}`, join(root, pkg));
const tarballs = readdirSync(join(work, 'pack')).map((f) => join(work, 'pack', f));
console.log('packed', tarballs.map((t) => t.split('/').pop()).join(', '));

// 2. A fresh Vite project.
sh('npm create vite@8 app -- --template vanilla-ts --no-interactive');
const app = join(work, 'app');
sh(`npm install --no-audit --no-fund ${tarballs.join(' ')} maplibre-gl@5`, app);
sh('npm install --no-audit --no-fund', app);

// 3. The README quick start, verbatim: the first ```ts block under "## Use" in the package README.
const readme = readFileSync(join(root, 'packages/core/README.md'), 'utf8');
const use = readme.slice(readme.indexOf('## Use'));
const code = use.slice(use.indexOf('```ts') + 5, use.indexOf('```', use.indexOf('```ts') + 5));
// The test harness exposes the map and toy to Playwright; everything above it is the README.
writeFileSync(
  join(app, 'src/main.ts'),
  `${code}\n(window as any).map = map;\n(window as any).toy = toy;\n`,
);
writeFileSync(
  join(app, 'index.html'),
  `<!doctype html><html><head><meta charset="UTF-8" /></head><body style="margin:0"><div id="map" style="height:100vh"></div><script type="module" src="/src/main.ts"></script></body></html>`,
);
// The README's setup steps: the model kit into public/models, a data file at /data/town.geojson.
cpSync(join(app, 'node_modules/@toytown/models/models'), join(app, 'public/models'), {
  recursive: true,
});
mkdirSync(join(app, 'public/data'), { recursive: true });
cpSync(
  join(root, 'examples/tramore/public/data/tramore.geojson'),
  join(app, 'public/data/town.geojson'),
);

// 4. Type-check and build, as a user would.
sh('npm run build', app);

// 5. Serve the build and check the town draws.
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.geojson': 'application/json',
};
const server = createServer((req, res) => {
  let path = join(app, 'dist', decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = readFileSync(path);
    res
      .writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(4399);
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_BROWSERS_PATH
    ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
    : { channel: 'chrome' },
);
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/could not be loaded|Failed to load resource/.test(m.text()))
    errors.push(m.text());
});
// Every failed request counts, except the favicon the browser asks for by itself.
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('/favicon.ico'))
    errors.push(`${r.status()} ${r.url()}`);
});
await page.goto('http://localhost:4399/');
await page.waitForFunction(() => !!window.toy, undefined, { timeout: 30_000 });
// The README centres on Waterford; move to Tramore, which this test's data covers.
await page.evaluate(() => window.map.jumpTo({ center: [-7.15, 52.162], zoom: 16.2 }));
await page.evaluate(() => window.toy.ready);
const stats = await page.evaluate(() => window.toy.stats());
await page.screenshot({ path: join(work, 'acceptance.png') });
await browser.close();
server.close();

const ok = errors.length === 0 && stats.chunks.ready > 0 && stats.visibleInstances > 20;
console.log(
  JSON.stringify(
    { ok, chunksReady: stats.chunks.ready, instances: stats.visibleInstances, errors },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
console.log('ACCEPTANCE OK: npm i toytown-gl + README quick start works in a fresh Vite project');
