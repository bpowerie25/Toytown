import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VERSION } from 'toytown-gl';
import {
  AREA_LANDUSE,
  AREA_LEISURE,
  fromOverpassJson,
  HIGHWAY_EXCLUDE,
  POI_KEYS,
  POI_RAILWAY,
  type BBox,
  type OsmData,
} from './osm';

export const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = `toytown-gl-cli/${VERSION}`;

export function overpassQuery([w, s, e, n]: BBox): string {
  const poiNodes = POI_KEYS.map((k) => `node[${k}][${k}!=no];`).join('\n  ');
  return `[out:json][timeout:180][maxsize:268435456][bbox:${s},${w},${n},${e}];
(
  way[building][building!=no];
  relation[building][building!=no][type=multipolygon];
  way[highway][highway!~"^(${HIGHWAY_EXCLUDE.join('|')})$"];
  way[leisure~"^(${AREA_LEISURE.join('|')})$"];
  relation[leisure~"^(${AREA_LEISURE.join('|')})$"][type=multipolygon];
  way[landuse~"^(${AREA_LANDUSE.join('|')})$"];
  relation[landuse~"^(${AREA_LANDUSE.join('|')})$"][type=multipolygon];
  way[amenity=grave_yard];
  way[highway=raceway];
);
out body;
>;
out skel qt;
(
  ${poiNodes}
  node[railway~"^(${POI_RAILWAY.join('|')})$"];
  node[natural=tree];
);
out body qt;`;
}

export interface OverpassOptions {
  url?: string;
  cacheDir: string;
  refresh?: boolean;
  log?: (msg: string) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Seconds until an Overpass slot is free, from /api/status. 0 if one is free now or status is unknown. */
export function slotWaitSeconds(statusText: string): number {
  if (/(\d+) slots? available now/.test(statusText)) return 0;
  const waits = [...statusText.matchAll(/in (\d+) seconds/g)].map((m) => Number(m[1]));
  return waits.length ? Math.min(...waits) : 0;
}

/**
 * Run the build-data query for a bbox. Raw responses are cached in `cacheDir/overpass/` by a
 * hash of the endpoint and query. Waits for a free slot and retries on 429/504.
 */
export async function fetchOverpass(bbox: BBox, opts: OverpassOptions): Promise<OsmData> {
  const url = opts.url ?? DEFAULT_OVERPASS_URL;
  const query = overpassQuery(bbox);
  const key = createHash('sha256').update(`${url}\n${query}`).digest('hex').slice(0, 16);
  const dir = join(opts.cacheDir, 'overpass');
  const file = join(dir, `${key}.json`);
  const log = opts.log ?? (() => {});
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;

  if (!opts.refresh) {
    try {
      const text = await readFile(file, 'utf8');
      log(`overpass: using cached response ${file}`);
      return fromOverpassJson(JSON.parse(text));
    } catch {
      // not cached
    }
  }

  const statusUrl = url.replace(/\/interpreter$/, '/status');
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const status = await doFetch(statusUrl, { headers: { 'user-agent': USER_AGENT } });
      const wait = status.ok ? slotWaitSeconds(await status.text()) : 0;
      if (wait > 0) {
        log(`overpass: waiting ${wait}s for a free slot`);
        await sleep(Math.min(wait, 300) * 1000);
      }
    } catch {
      // Status is best-effort; not all Overpass instances expose it.
    }

    log(`overpass: querying ${url} (attempt ${attempt})`);
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }).toString(),
    });
    if (res.ok) {
      const text = await res.text();
      const json = JSON.parse(text) as { remark?: string; elements: [] };
      if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) {
        throw new Error(`Overpass error: ${json.remark}`);
      }
      await mkdir(dir, { recursive: true });
      await writeFile(file, text);
      log(`overpass: ${json.elements.length} elements, cached as ${file}`);
      return fromOverpassJson(json);
    }
    if (res.status !== 429 && res.status !== 504 && res.status !== 503) {
      throw new Error(
        `Overpass request failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`,
      );
    }
    if (attempt === 5) break;
    const backoff = 15 * 2 ** (attempt - 1);
    log(`overpass: HTTP ${res.status}, retrying in ${backoff}s`);
    await sleep(backoff * 1000);
  }
  throw new Error(
    'Overpass request failed after 5 attempts; try again later or pass --overpass-url',
  );
}
