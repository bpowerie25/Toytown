import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/models');
const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.md': 'text/markdown',
};
const shipped = (file: string) => statSync(file).isDirectory() || /\.(glb|json|md)$/.test(file);

/** Serves the repo's model kit at ./models/ in dev, and copies it into the build. */
export function kitModels(): Plugin {
  return {
    name: 'toytown-kit-models',
    configureServer(server) {
      server.middlewares.use('/models', (req, res, next) => {
        const file = normalize(join(KIT, decodeURIComponent((req.url ?? '/').split('?')[0]!)));
        if (!file.startsWith(KIT) || !existsSync(file) || statSync(file).isDirectory())
          return next();
        res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      cpSync(KIT, join(options.dir!, 'models'), { recursive: true, filter: shipped });
    },
  };
}
