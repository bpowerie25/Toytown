// Assemble the Toytown Map WordPress plugin: plugin/ plus its bundled libraries and model kit,
// into dist/toytown-map/ and dist/toytown-map.zip (the file to upload or submit).
//   pnpm --filter toytown-gl build && pnpm --filter @toytown/wordpress build
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const out = join(here, 'dist/toytown-map');
const pub = join(out, 'public');
const maplibre = dirname(require.resolve('maplibre-gl/package.json'));
const toytown = dirname(require.resolve('toytown-gl/package.json'));

// Empty dist/toytown-map in place rather than deleting it, so a bind mount of it (the Docker
// test WordPress) keeps seeing the fresh files.
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) rmSync(join(out, f), { recursive: true, force: true });
if (existsSync(join(here, 'dist/toytown-map.zip'))) rmSync(join(here, 'dist/toytown-map.zip'));
cpSync(join(here, 'plugin'), out, { recursive: true });
mkdirSync(join(pub, 'vendor'), { recursive: true });
for (const f of [
  'maplibre-gl.mjs',
  'maplibre-gl-shared.mjs',
  'maplibre-gl-worker.mjs',
  'maplibre-gl.css',
])
  cpSync(join(maplibre, 'dist', f), join(pub, 'vendor', f));
cpSync(join(maplibre, 'LICENSE.txt'), join(pub, 'vendor/maplibre-gl.LICENSE.txt'));
cpSync(join(toytown, 'dist/toytown-gl.umd.js'), join(pub, 'vendor/toytown-gl.umd.js'));
cpSync(join(here, '../../LICENSE'), join(out, 'LICENSE'));
// The model kit, without the preview images (not needed at run time).
cpSync(join(here, '../../assets/models'), join(pub, 'models'), {
  recursive: true,
  filter: (f) => !/(preview\.png|\.DS_Store|pack\.json)$/.test(f),
});

// The plugin version must match its readme's stable tag and the block version.
const php = readFileSync(join(out, 'toytown-map.php'), 'utf8');
const version = /Version:\s*([\d.]+)/.exec(php)[1];
const readme = readFileSync(join(out, 'readme.txt'), 'utf8');
const stable = /Stable tag:\s*([\d.]+)/.exec(readme)[1];
if (version !== stable) throw new Error(`plugin version ${version} != readme stable tag ${stable}`);

execFileSync('zip', ['-qr', 'toytown-map.zip', 'toytown-map'], { cwd: join(here, 'dist') });
console.log(`built dist/toytown-map.zip (Toytown Map ${version})`);
