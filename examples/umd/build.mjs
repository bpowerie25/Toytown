// Assemble a no-bundler page: the UMD build, MapLibre's ES module build, the Tramore data and the
// model kit, copied into dist/ as they'd be served from a CDN or static host.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dist = join(here, 'dist');
const maplibre = dirname(require.resolve('maplibre-gl/package.json'));
const toytown = dirname(require.resolve('toytown-gl/package.json'));
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'lib'), { recursive: true });
cpSync(join(here, 'index.html'), join(dist, 'index.html'));
// MapLibre 6 ships ES modules only: the entry, its shared chunk and the worker it loads.
for (const f of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs'])
  cpSync(join(maplibre, 'dist', f), join(dist, 'lib', f));
cpSync(join(maplibre, 'dist/maplibre-gl.css'), join(dist, 'lib/maplibre-gl.css'));
cpSync(join(toytown, 'dist/toytown-gl.umd.js'), join(dist, 'lib/toytown-gl.umd.js'));
cpSync(join(here, '../tramore/public/data'), join(dist, 'data'), { recursive: true });
cpSync(join(here, '../../assets/models'), join(dist, 'models'), {
  recursive: true,
  filter: (f) => !/\.(png|DS_Store)$/.test(f),
});
console.log('built examples/umd/dist');
