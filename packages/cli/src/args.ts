import { parseArgs } from 'node:util';
import type { BBox } from './osm';

export type Command =
  | { name: 'help' }
  | { name: 'version' }
  | { name: 'build-data'; argv: string[] }
  | { name: 'report'; argv: string[] };

export function parseCommand(argv: string[]): Command {
  const [first, ...rest] = argv;
  if (!first || first === '-h' || first === '--help' || first === 'help') return { name: 'help' };
  if (first === '-v' || first === '--version') return { name: 'version' };
  if (first === 'build-data') return { name: 'build-data', argv: rest };
  if (first === 'report') return { name: 'report', argv: rest };
  throw new Error(`Unknown command "${first}". Run "toytown --help".`);
}

export function parseBBox(s: string): BBox {
  const parts = s.split(',').map((x) => Number(x.trim()));
  if (parts.length !== 4 || parts.some((x) => !Number.isFinite(x))) {
    throw new Error(`--bbox must be four numbers "west,south,east,north", got "${s}"`);
  }
  const [w, south, e, n] = parts as BBox;
  if (w >= e || south >= n)
    throw new Error(`--bbox must have west < east and south < north, got "${s}"`);
  if (w < -180 || e > 180 || south < -90 || n > 90)
    throw new Error(`--bbox is outside the world: "${s}"`);
  return [w, south, e, n];
}

export interface BuildDataArgs {
  bbox: BBox;
  out: string;
  fgb?: string;
  source: { kind: 'overpass'; url?: string; refresh: boolean } | { kind: 'pbf'; file: string };
  manifest: string;
  tagMap: string;
  packs: string[];
  cacheDir: string;
  seed: number;
  stats?: string;
}

export function parseBuildDataArgs(
  argv: string[],
  defaults: { manifest: string; tagMap: string; packs: string[] },
): BuildDataArgs {
  // Support the spec'd form "--source pbf <file>" by folding the file into --pbf.
  const args = [...argv];
  const si = args.indexOf('--source');
  if (si >= 0 && args[si + 1] === 'pbf' && args[si + 2] && !args[si + 2]!.startsWith('--')) {
    args.splice(si, 3, '--source', 'pbf', '--pbf', args[si + 2]!);
  }
  // Western-hemisphere bboxes start with "-", which parseArgs would read as an option.
  const bi = args.indexOf('--bbox');
  if (bi >= 0 && args[bi + 1] !== undefined) args.splice(bi, 2, `--bbox=${args[bi + 1]}`);
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      bbox: { type: 'string' },
      out: { type: 'string' },
      fgb: { type: 'string' },
      source: { type: 'string', default: 'overpass' },
      pbf: { type: 'string' },
      'overpass-url': { type: 'string' },
      refresh: { type: 'boolean', default: false },
      manifest: { type: 'string', default: defaults.manifest },
      'tag-map': { type: 'string', default: defaults.tagMap },
      pack: { type: 'string', multiple: true },
      'no-default-packs': { type: 'boolean', default: false },
      'cache-dir': { type: 'string', default: '.cache' },
      seed: { type: 'string', default: '1' },
      stats: { type: 'string' },
    },
  });
  if (!values.bbox) throw new Error('--bbox <west,south,east,north> is required');
  if (!values.out) throw new Error('--out <file.geojson> is required');
  let source: BuildDataArgs['source'];
  if (values.source === 'overpass') {
    source = { kind: 'overpass', url: values['overpass-url'], refresh: values.refresh ?? false };
  } else if (values.source === 'pbf') {
    if (!values.pbf) throw new Error('--source pbf needs a file: --source pbf <file.osm.pbf>');
    source = { kind: 'pbf', file: values.pbf };
  } else {
    throw new Error(`--source must be "overpass" or "pbf", got "${values.source}"`);
  }
  const seed = Number(values.seed);
  if (!Number.isInteger(seed)) throw new Error(`--seed must be an integer, got "${values.seed}"`);
  return {
    bbox: parseBBox(values.bbox),
    out: values.out,
    fgb: values.fgb,
    source,
    manifest: values.manifest!,
    tagMap: values['tag-map']!,
    packs: [...(values['no-default-packs'] ? [] : defaults.packs), ...(values.pack ?? [])],
    cacheDir: values['cache-dir']!,
    seed,
    stats: values.stats,
  };
}
