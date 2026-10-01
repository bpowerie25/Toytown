// Release notes for a tag: the CHANGELOG section of each published package whose version is the
// tag's. Packages at another version aren't in this release (pnpm publish skips versions already
// on npm). Fails if no package is at the tag's version.
//   node scripts/release-notes.mjs v0.1.0 > notes.md
import { readFileSync } from 'node:fs';

const tag = process.argv[2] ?? '';
const packages = ['packages/core', 'packages/models', 'packages/cli'];
const out = [];
for (const dir of packages) {
  const { name, version } = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
  if (`v${version}` !== tag) {
    console.error(`${name} is at ${version}, not in ${tag}`);
    continue;
  }
  const log = readFileSync(`${dir}/CHANGELOG.md`, 'utf8');
  const start = log.indexOf(`## ${version}`);
  const end = log.indexOf('\n## ', start + 1);
  out.push(
    `## ${name} ${version}\n${log.slice(start + `## ${version}`.length, end < 0 ? undefined : end).trim()}\n`,
  );
}
if (!out.length) {
  console.error(`No package is at ${tag}. Run "pnpm version-packages" and commit before tagging.`);
  process.exit(1);
}
out.push(
  'Map data © OpenStreetMap contributors (ODbL). The models zip is CC0. `toytown-map.zip` is the WordPress plugin.',
);
console.log(out.join('\n'));
