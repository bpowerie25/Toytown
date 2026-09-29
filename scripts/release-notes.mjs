// Release notes for a tag: each published package's CHANGELOG section for its current version.
// Fails if the tag doesn't match the packages' versions.
//   node scripts/release-notes.mjs v0.1.0 > notes.md
import { readFileSync } from 'node:fs';

const tag = process.argv[2] ?? '';
const packages = ['packages/core', 'packages/models'];
const out = [];
for (const dir of packages) {
  const { name, version } = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
  if (`v${version}` !== tag) {
    console.error(
      `${name} is at ${version}, but the tag is ${tag}. Run "pnpm version-packages" and commit before tagging.`,
    );
    process.exit(1);
  }
  const log = readFileSync(`${dir}/CHANGELOG.md`, 'utf8');
  const start = log.indexOf(`## ${version}`);
  const end = log.indexOf('\n## ', start + 1);
  out.push(
    `## ${name} ${version}\n${log.slice(start + `## ${version}`.length, end < 0 ? undefined : end).trim()}\n`,
  );
}
out.push('Map data © OpenStreetMap contributors (ODbL). The models zip is CC0.');
console.log(out.join('\n'));
