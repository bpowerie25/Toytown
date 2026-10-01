// Install WordPress in the test containers, activate Toytown Map, and add test posts.
// The admin password is generated per run and written to .cache/wordpress-test.json (git-ignored).
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const compose = join(dirname(fileURLToPath(import.meta.url)), 'docker-compose.yml');
const wp = (...args) =>
  execFileSync('docker', ['compose', '-f', compose, 'exec', '-T', 'cli', 'wp', ...args], {
    encoding: 'utf8',
  }).trim();

for (let i = 0; i < 30; i++) {
  try {
    wp('core', 'is-installed');
    break;
  } catch (e) {
    if (
      /not installed|This does not seem to be a WordPress installation/.test(
        String(e.stderr ?? e),
      ) &&
      i > 2
    )
      break;
    execFileSync('sleep', ['2']);
  }
}
const password = randomBytes(12).toString('base64url');
try {
  wp('core', 'is-installed');
  wp('user', 'update', 'admin', `--user_pass=${password}`);
} catch {
  wp(
    'core',
    'install',
    '--url=http://localhost:8089',
    '--title=Toytown test',
    '--admin_user=admin',
    `--admin_password=${password}`,
    '--admin_email=admin@example.test',
    '--skip-email',
  );
}
wp('plugin', 'activate', 'toytown-map');
const shortcode = wp(
  'post',
  'create',
  '--post_type=page',
  '--post_status=publish',
  '--post_title=Shortcode',
  '--post_content=<p>Above the map.</p>[toytown lat="52.1655" lng="-8.8265" size="1.5" skin="sitcom" height="420"]<p>Below the map.</p>',
  '--porcelain',
);
const block = wp(
  'post',
  'create',
  '--post_type=page',
  '--post_status=publish',
  '--post_title=Block',
  '--post_content=<!-- wp:toytown/map {"lat":52.1655,"lng":-8.8265,"place":"Castlemagner","size":1.5,"skin":"voxel","height":420} /-->',
  '--porcelain',
);
const out = { url: 'http://localhost:8089', user: 'admin', password, shortcode, block };
mkdirSync('.cache', { recursive: true });
writeFileSync('.cache/wordpress-test.json', JSON.stringify(out, null, 2));
console.log(
  `WordPress ready: pages ${shortcode} (shortcode) and ${block} (block); login details in .cache/wordpress-test.json`,
);
