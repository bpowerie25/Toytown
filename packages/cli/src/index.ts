import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyArea,
  createClassifier,
  parseManifest,
  parseTagMap,
  VERSION,
  type LandmarkPack,
} from 'toytown-gl';
import { parseBuildDataArgs, parseCommand } from './args';
import { writeFlatGeobuf, writeGeoJson } from './output';
import { fetchOverpass } from './overpass';
import { readPbf } from './pbf';
import { buildData, type BuildStats } from 'toytown-gl';
import { renderReport } from './report';

// The default tag map, kit manifest and packs: copied next to the build (dist/defaults) so the
// published CLI carries them; the repo's assets/models when running from source.
const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = existsSync(resolve(HERE, 'defaults'))
  ? resolve(HERE, 'defaults')
  : resolve(HERE, '../../../assets/models');
const DEFAULTS = {
  manifest: resolve(ASSETS, 'manifest.json'),
  tagMap: resolve(ASSETS, 'tag-map.json'),
  packs: [resolve(ASSETS, 'ireland/landmarks.json')],
};

const HELP = `toytown ${VERSION}

Usage:
  toytown build-data --bbox <w,s,e,n> --out <file.geojson> [options]
  toytown report <Name>=<stats.json>... --out <report.md>

build-data options:
  --source overpass            fetch from Overpass (default); raw responses cached in --cache-dir
  --source pbf <file.osm.pbf>  read a PBF extract instead (e.g. from Geofabrik)
  --overpass-url <url>         Overpass interpreter URL (default overpass-api.de)
  --refresh                    ignore the Overpass cache
  --fgb <file.fgb>             also write FlatGeobuf
  --stats <file.json>          write classification stats (input for "toytown report")
  --manifest <file>            model manifest (default: bundled kit)
  --tag-map <file>             tag rules (default: bundled tag-map.json)
  --pack <landmarks.json>      add a landmark pack (repeatable)
  --no-default-packs           don't load the bundled packs
  --cache-dir <dir>            default .cache
  --seed <int>                 seed for scattered trees (default 1)
`;

const log = (msg: string) => process.stderr.write(`${msg}\n`);
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as unknown;

async function buildDataCommand(argv: string[]): Promise<void> {
  const args = parseBuildDataArgs(argv, DEFAULTS);
  const manifest = parseManifest(await readJson(args.manifest));
  const tagMap = parseTagMap(await readJson(args.tagMap), Object.keys(manifest.models));
  const packs = (await Promise.all(args.packs.map(readJson))) as LandmarkPack[];
  for (const p of packs) {
    for (const l of p.landmarks) {
      if (!manifest.models[l.category])
        throw new Error(`pack ${p.pack}: ${l.osm} uses unknown model "${l.category}"`);
    }
  }

  const t0 = Date.now();
  const osm =
    args.source.kind === 'overpass'
      ? await fetchOverpass(args.bbox, {
          url: args.source.url,
          refresh: args.source.refresh,
          cacheDir: args.cacheDir,
          log,
        })
      : readPbf(args.source.file, { bbox: args.bbox, log });
  log(
    `osm: ${osm.nodes.size} nodes, ${osm.ways.size} ways, ${osm.relations.size} relations (${Date.now() - t0} ms)`,
  );

  const { collection, stats } = buildData(osm, {
    bbox: args.bbox,
    classify: createClassifier(tagMap, packs),
    fallback: tagMap.fallback,
    classifyArea: (tags) => classifyArea(tagMap, tags),
    areaTrees: tagMap.spec.areaTrees ?? {},
    trees: { seed: args.seed },
  });
  const bytes = await writeGeoJson(args.out, collection);
  log(`wrote ${args.out} (${(bytes / 1e6).toFixed(2)} MB, ${collection.features.length} features)`);
  if (args.fgb) {
    const n = await writeFlatGeobuf(args.fgb, collection);
    log(`wrote ${args.fgb} (${(n / 1e6).toFixed(2)} MB)`);
  }
  if (args.stats) {
    await mkdir(dirname(args.stats), { recursive: true });
    await writeFile(args.stats, `${JSON.stringify(stats, null, 2)}\n`);
  }
  log(
    `${stats.buildings} buildings: ${Object.entries(stats.via)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
  );
}

async function reportCommand(argv: string[]): Promise<void> {
  const outIndex = argv.indexOf('--out');
  if (outIndex < 0 || !argv[outIndex + 1]) throw new Error('report needs --out <file.md>');
  const out = argv[outIndex + 1]!;
  const inputs = argv.filter((_, i) => i !== outIndex && i !== outIndex + 1);
  if (!inputs.length) throw new Error('report needs at least one <Name>=<stats.json>');
  const towns = await Promise.all(
    inputs.map(async (s) => {
      const eq = s.indexOf('=');
      if (eq < 1) throw new Error(`expected <Name>=<stats.json>, got "${s}"`);
      return { name: s.slice(0, eq), stats: (await readJson(s.slice(eq + 1))) as BuildStats };
    }),
  );
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, renderReport(towns));
  log(`wrote ${out}`);
}

async function main(): Promise<void> {
  const cmd = parseCommand(process.argv.slice(2));
  switch (cmd.name) {
    case 'help':
      process.stdout.write(HELP);
      break;
    case 'version':
      process.stdout.write(`${VERSION}\n`);
      break;
    case 'build-data':
      await buildDataCommand(cmd.argv);
      break;
    case 'report':
      await reportCommand(cmd.argv);
      break;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`error: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
