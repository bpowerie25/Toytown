import type { LngLat } from './project';

/** Buildings are grouped into chunks by the web-mercator tile (at this zoom) holding their first vertex. */
export const CHUNK_ZOOM = 15;

export function tileOf([lng, lat]: LngLat, z = CHUNK_ZOOM): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

/** Centre of a tile in lng/lat. */
export function tileCenter(x: number, y: number, z = CHUNK_ZOOM): LngLat {
  const n = 2 ** z;
  const lng = ((x + 0.5) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI;
  return [lng, lat];
}

export interface Chunk<T> {
  key: string;
  origin: LngLat;
  items: T[];
}

/** Group items by chunk tile. Keys look like "15/15724/10812"; order follows first appearance. */
export function groupByChunk<T>(
  items: T[],
  anchor: (item: T) => LngLat,
  z = CHUNK_ZOOM,
): Chunk<T>[] {
  const chunks = new Map<string, Chunk<T>>();
  for (const item of items) {
    const [x, y] = tileOf(anchor(item), z);
    const key = `${z}/${x}/${y}`;
    let c = chunks.get(key);
    if (!c) {
      c = { key, origin: tileCenter(x, y, z), items: [] };
      chunks.set(key, c);
    }
    c.items.push(item);
  }
  return [...chunks.values()];
}

/** [west, south, east, north] of a tile, in degrees. */
export function tileBounds(x: number, y: number, z = CHUNK_ZOOM): [number, number, number, number] {
  const n = 2 ** z;
  const lng = (i: number) => (i / n) * 360 - 180;
  const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return [lng(x), lat(y + 1), lng(x + 1), lat(y)];
}

/** Parse a chunk key ("15/x/y") back to its tile. */
export function parseChunkKey(key: string): [number, number, number] {
  const [z, x, y] = key.split('/').map(Number) as [number, number, number];
  return [x, y, z];
}
