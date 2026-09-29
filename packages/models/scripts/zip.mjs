// Zip the kit for GitHub releases: dist/toytown-models-<version>.zip containing toytown-models/.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
const stage = join(pkg, 'dist', 'toytown-models');
rmSync(join(pkg, 'dist'), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(pkg, 'models'), stage, { recursive: true });
cpSync(join(pkg, 'README.md'), join(stage, 'README.md'));
const zip = `toytown-models-${version}.zip`;
execFileSync('zip', ['-qr', zip, 'toytown-models'], { cwd: join(pkg, 'dist') });
console.log(`wrote packages/models/dist/${zip}`);
