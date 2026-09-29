import { defineConfig } from 'tsup';

export default defineConfig({
  // The worker is its own entry so `new URL('./worker.js', import.meta.url)` resolves next to index.js.
  entry: { index: 'src/index.ts', worker: 'src/render/worker.ts' },
  format: ['esm'],
  // tsup's dts step sets `baseUrl`, which TS 6 deprecates.
  dts: { entry: { index: 'src/index.ts' }, compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['maplibre-gl', 'three'],
});
