import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Serve the model kit (GLBs + manifest.json) straight from the repo.
  publicDir: '../../assets/models',
  build: { chunkSizeWarningLimit: 3000 },
});
