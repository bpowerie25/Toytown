// Copy the model kit from assets/models (the source of truth, written by the generator) into
// this package. The copy is git-ignored.
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const kit = join(pkg, '../../assets/models');
rmSync(join(pkg, 'models'), { recursive: true, force: true });
cpSync(kit, join(pkg, 'models'), { recursive: true, filter: (src) => !src.endsWith('.DS_Store') });
console.log('copied the model kit into packages/models/models');
