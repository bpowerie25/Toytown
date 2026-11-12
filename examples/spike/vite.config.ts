// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Serve the model kit (GLBs + manifest.json) straight from the repo.
  publicDir: '../../assets/models',
  build: { chunkSizeWarningLimit: 3000 },
});
