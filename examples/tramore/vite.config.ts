import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built example works from any GitHub Pages sub-path.
  base: './',
  // maplibre-gl alone is ~1 MB minified.
  build: { chunkSizeWarningLimit: 1500 },
});
