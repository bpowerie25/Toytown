import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  VERSION,
  DEFAULT_OVERPASS_URL,
  fetchOverpassText,
  fromOverpassJson,
  overpassQuery,
  type BBox,
  type OsmData,
} from 'toytown-gl';

export { DEFAULT_OVERPASS_URL, overpassQuery, slotWaitSeconds } from 'toytown-gl';

const USER_AGENT = `toytown-gl-cli/${VERSION}`;

export interface OverpassOptions {
  url?: string;
  cacheDir: string;
  refresh?: boolean;
  log?: (msg: string) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Run the build-data query for a bbox, through the core's Overpass client. Raw responses are
 * cached in `cacheDir/overpass/` by a hash of the endpoint and query.
 */
export async function fetchOverpass(bbox: BBox, opts: OverpassOptions): Promise<OsmData> {
  const url = opts.url ?? DEFAULT_OVERPASS_URL;
  const query = overpassQuery(bbox);
  const key = createHash('sha256').update(`${url}\n${query}`).digest('hex').slice(0, 16);
  const dir = join(opts.cacheDir, 'overpass');
  const file = join(dir, `${key}.json`);
  const log = opts.log ?? (() => {});

  if (!opts.refresh) {
    try {
      const text = await readFile(file, 'utf8');
      log(`overpass: using cached response ${file}`);
      return fromOverpassJson(JSON.parse(text));
    } catch {
      // not cached
    }
  }
  const text = await fetchOverpassText(query, {
    url,
    log,
    headers: { 'user-agent': USER_AGENT },
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
  });
  const json = JSON.parse(text) as Parameters<typeof fromOverpassJson>[0];
  await mkdir(dir, { recursive: true });
  await writeFile(file, text);
  log(`overpass: ${json.elements.length} elements, cached as ${file}`);
  return fromOverpassJson(json);
}
