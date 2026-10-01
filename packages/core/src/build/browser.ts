/**
 * Build a town's data in the browser: the same pipeline as `toytown build-data`, fed from
 * Overpass directly, so a page can show any area with no data file. Responses are kept in the
 * browser's Cache Storage for a week, so reloads don't hit Overpass again.
 */
import { classifyArea, createClassifier, parseTagMap } from '../classify';
import { hash32 } from '../geometry/hash';
import { LocalProjection } from '../geometry/project';
import { fromOverpassJson, type BBox } from './osm';
import { DEFAULT_OVERPASS_URL, fetchOverpassText, overpassQuery } from './overpass';
import { buildData, type ToyTownCollection } from './pipeline';

export interface AreaBuildOptions {
  /** The kit's tag map (`tag-map.json` next to the models manifest). */
  tagMap: unknown;
  /** The kit's model names; tag rules may only name these. */
  models: string[];
  /** Overpass interpreter URL (default overpass-api.de). */
  overpass?: string;
  /** Refuse areas larger than this, in km² (default 12). Bigger towns: use `toytown build-data`. */
  maxAreaKm2?: number;
  /** Cache Overpass responses in the browser for this many days (default 7, 0 for no cache). */
  cacheDays?: number;
  log?: (msg: string) => void;
  fetch?: typeof fetch;
}

/** Area of a bbox in km² (on MapLibre's sphere, at its middle latitude). */
export function bboxAreaKm2([w, s, e, n]: BBox): number {
  const p = new LocalProjection([w, s]);
  const [x, y] = p.toXY([e, n]);
  return Math.abs(x * y) / 1e6;
}

const CACHE = 'toytown-overpass';

async function cachedOverpass(query: string, url: string, days: number, opts: AreaBuildOptions) {
  const key = `${url}?toytown=${hash32(query).toString(16)}`;
  const store =
    days > 0 && typeof caches !== 'undefined' ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await store?.match(key).catch(() => undefined);
  if (hit) {
    const age = Date.now() - Number(hit.headers.get('x-toytown-fetched') ?? 0);
    if (age < days * 86_400_000) {
      opts.log?.('overpass: using the browser cache');
      return hit.text();
    }
  }
  const text = await fetchOverpassText(query, {
    url,
    attempts: 3,
    ...(opts.log ? { log: opts.log } : {}),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  await store
    ?.put(key, new Response(text, { headers: { 'x-toytown-fetched': String(Date.now()) } }))
    .catch(() => {});
  return text;
}

/** Fetch an area from Overpass and build toy-town data for it, in the page. */
export async function buildAreaData(
  bbox: BBox,
  opts: AreaBuildOptions,
): Promise<ToyTownCollection> {
  const [w, s, e, n] = bbox;
  if (!(w < e && s < n && w >= -180 && e <= 180 && s >= -90 && n <= 90))
    throw new Error(
      `area must be [west, south, east, north] in degrees, got ${JSON.stringify(bbox)}`,
    );
  const max = opts.maxAreaKm2 ?? 12;
  const km2 = bboxAreaKm2(bbox);
  if (km2 > max)
    throw new Error(
      `area is ${km2.toFixed(1)} km², more than the ${max} km² that's built in the browser. ` +
        'Use a smaller area, or build a data file with `npx @toytown/cli build-data`.',
    );
  const tagMap = parseTagMap(opts.tagMap, opts.models);
  const url = opts.overpass ?? DEFAULT_OVERPASS_URL;
  const text = await cachedOverpass(overpassQuery(bbox), url, opts.cacheDays ?? 7, opts);
  const osm = fromOverpassJson(JSON.parse(text));
  const t0 = Date.now();
  const { collection } = buildData(osm, {
    bbox,
    classify: createClassifier(tagMap, []),
    fallback: tagMap.fallback,
    classifyArea: (tags) => classifyArea(tagMap, tags),
    areaTrees: tagMap.spec.areaTrees ?? {},
  });
  opts.log?.(`built ${collection.features.length} features in ${Date.now() - t0} ms`);
  return collection;
}
