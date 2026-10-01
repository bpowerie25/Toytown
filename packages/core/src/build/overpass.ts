/**
 * The Overpass query for a toy town and a polite client for it: waits for a free slot, retries
 * busy responses with backoff, and surfaces Overpass runtime errors. Works in browsers and Node;
 * the CLI adds an on-disk cache around it.
 */
import {
  AREA_LANDUSE,
  AREA_LEISURE,
  HIGHWAY_EXCLUDE,
  POI_KEYS,
  POI_RAILWAY,
  type BBox,
} from './osm';

export const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Buildings, streets, open spaces, POIs and trees in a bbox, as one Overpass QL query. */
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

/** Seconds until an Overpass slot is free, from /api/status. 0 if one is free now or status is unknown. */
export function slotWaitSeconds(statusText: string): number {
  if (/(\d+) slots? available now/.test(statusText)) return 0;
  const waits = [...statusText.matchAll(/in (\d+) seconds/g)].map((m) => Number(m[1]));
  return waits.length ? Math.min(...waits) : 0;
}

export interface OverpassFetchOptions {
  /** Interpreter URL (default overpass-api.de). */
  url?: string;
  log?: (msg: string) => void;
  /** Extra request headers (Node can send a User-Agent; browsers send their own). */
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Attempts before giving up (default 5). */
  attempts?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run an Overpass query and return the raw JSON text. Checks `/api/status` and waits for a free
 * slot first, retries 429, 503 and 504 with backoff (15 s, 30 s, 60 s…), and throws on HTTP errors
 * and on Overpass runtime errors (time-outs, out of memory), which come back as HTTP 200.
 */
export async function fetchOverpassText(
  query: string,
  opts: OverpassFetchOptions = {},
): Promise<string> {
  const url = opts.url ?? DEFAULT_OVERPASS_URL;
  const log = opts.log ?? (() => {});
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const attempts = opts.attempts ?? 5;
  const headers = opts.headers ?? {};

  const statusUrl = url.replace(/\/interpreter$/, '/status');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const status = await doFetch(statusUrl, { headers });
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
      headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }).toString(),
    });
    if (res.ok) {
      const text = await res.text();
      const remark = /"remark"\s*:\s*"([^"]*)"/.exec(text.slice(-2000))?.[1];
      if (remark && /runtime error|timed out|out of memory/i.test(remark)) {
        throw new Error(`Overpass error: ${remark}`);
      }
      return text;
    }
    if (res.status !== 429 && res.status !== 504 && res.status !== 503) {
      throw new Error(
        `Overpass request failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`,
      );
    }
    if (attempt === attempts) break;
    const backoff = 15 * 2 ** (attempt - 1);
    log(`overpass: HTTP ${res.status}, retrying in ${backoff}s`);
    await sleep(backoff * 1000);
  }
  throw new Error(`Overpass request failed after ${attempts} attempts; try again later`);
}
