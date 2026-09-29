import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const define = { __VERSION__: JSON.stringify(version) };

export default defineConfig([
  // ESM for bundlers (three and maplibre-gl stay external), with types.
  {
    entry: { index: 'src/index.ts', worker: 'src/render/worker.ts' },
    format: ['esm'],
    // tsup's dts step sets `baseUrl`, which TS 6 deprecates.
    dts: { entry: { index: 'src/index.ts' }, compilerOptions: { ignoreDeprecations: '6.0' } },
    sourcemap: true,
    clean: true,
    target: 'es2022',
    external: ['maplibre-gl', 'three'],
    define,
  },
  // The worker as one classic script, for the UMD build to inline.
  {
    entry: { 'worker.iife': 'src/render/worker.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    noExternal: [/.*/],
    minify: true,
    target: 'es2020',
    platform: 'browser',
    define,
  },
]);
