import { readFileSync } from 'node:fs';
import { defineConfig, type Options } from 'tsup';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/** Resolves `toytown-worker-source` to the IIFE worker bundle's text (built by tsup.config.ts). */
const workerSource: NonNullable<Options['esbuildPlugins']>[number] = {
  name: 'toytown-worker-source',
  setup(build) {
    build.onResolve({ filter: /^toytown-worker-source$/ }, () => ({
      path: 'worker',
      namespace: 'worker-source',
    }));
    build.onLoad({ filter: /.*/, namespace: 'worker-source' }, () => ({
      contents: readFileSync('dist/worker.iife.js', 'utf8'),
      loader: 'text',
    }));
  },
};

// CommonJS and AMD loaders get the same object that script tags see as the ToyTownGL global.
const umdFooter = `;(function(r){if(typeof module==='object'&&module.exports)module.exports=r;else if(typeof define==='function'&&define.amd)define([],function(){return r});})(ToyTownGL);`;

// The UMD / script-tag build: one self-contained file (three.js bundled), global `ToyTownGL`.
export default defineConfig({
  entry: { 'toytown-gl.umd': 'src/umd.ts' },
  format: ['iife'],
  globalName: 'ToyTownGL',
  outExtension: () => ({ js: '.js' }),
  noExternal: [/.*/],
  minify: true,
  sourcemap: true,
  target: 'es2020',
  platform: 'browser',
  define: { __VERSION__: JSON.stringify(version) },
  esbuildPlugins: [workerSource],
  footer: { js: umdFooter },
});
