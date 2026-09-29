/**
 * Entry for the UMD / script-tag build (`dist/toytown-gl.umd.js`, global `ToyTownGL`). It's
 * self-contained, with three.js bundled; MapLibre comes from the page. Chunk meshing runs in a
 * worker created from an inlined copy of the worker bundle. If the page blocks blob workers
 * (e.g. by CSP), meshing falls back to the main thread.
 */
import workerSource from 'toytown-worker-source';
import { setWorkerFactory } from './render/pool';

setWorkerFactory(() => {
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  return new Worker(url);
});

export * from './index';
