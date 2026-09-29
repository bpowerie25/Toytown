// Serves each built example at /<name>/ from examples/<name>/dist. No dependencies, so it runs
// unchanged inside the Playwright Docker image.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../examples');
const PORT = Number(process.env.PORT ?? 4310);
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const [, example, ...rest] = decodeURIComponent(url.pathname).split('/');
  let file = normalize(join(ROOT, example ?? '', 'dist', ...rest));
  if (!file.startsWith(ROOT)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return void res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`examples on http://localhost:${PORT}/`));
