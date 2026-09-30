import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const core = JSON.parse(readFileSync(new URL('../core/package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  // Bundle the core's three.js-free source (classification, manifests, footprint geometry) in
  // place of the `toytown-gl` package, so `npx @toytown/cli` installs neither three.js nor MapLibre.
  noExternal: ['toytown-gl'],
  esbuildOptions(options) {
    options.alias = { 'toytown-gl': new URL('../core/src/data.ts', import.meta.url).pathname };
  },
  define: { __VERSION__: JSON.stringify(core.version) },
  // The defaults the CLI reads: the kit's tag map and manifest, and the landmark packs.
  onSuccess: async () => {
    const kit = new URL('../../assets/models/', import.meta.url);
    const out = new URL('./dist/defaults/', import.meta.url);
    mkdirSync(new URL('ireland/', out), { recursive: true });
    for (const f of ['manifest.json', 'tag-map.json', 'ireland/landmarks.json'])
      cpSync(new URL(f, kit), new URL(f, out));
  },
});
