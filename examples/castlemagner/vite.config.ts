import { defineConfig } from 'vite';
import { kitModels } from '../kit-models';

export default defineConfig({
  // Relative base so the built example works from any GitHub Pages sub-path.
  base: './',
  plugins: [kitModels()],
  // maplibre-gl and three are about 1.6 MB minified together.
  build: { chunkSizeWarningLimit: 2000 },
});
