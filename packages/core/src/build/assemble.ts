/**
 * Turn OSM ways and multipolygon relations into polygons (in lng/lat), including holes.
 */
import { pointInPolygon, signedArea } from '../geometry/polygon';
import { LocalProjection, type LngLat, type XY } from '../geometry/project';
import type { OsmData, OsmRelation } from './osm';

/** GeoJSON-style polygons: each is [outer, ...holes], rings closed. */
export type LngLatPolygon = LngLat[][];

function coords(refs: number[], data: OsmData): LngLat[] | null {
  const out: LngLat[] = [];
  for (const r of refs) {
    const n = data.nodes.get(r);
    if (!n) return null;
    out.push([n.lon, n.lat]);
  }
  return out;
}

const isClosed = (refs: number[]) => refs.length >= 4 && refs[0] === refs[refs.length - 1];

/** A closed way as a single polygon, or null if unclosed, degenerate or missing nodes. */
export function wayPolygon(refs: number[], data: OsmData): LngLatPolygon | null {
  if (!isClosed(refs)) return null;
  const ring = coords(refs, data);
  return ring ? [ring] : null;
}

/**
 * Join way node lists into closed rings by matching endpoints (ways may be split and reversed).
 * Returns node-id rings; pieces that never close are dropped.
 */
export function joinRings(ways: number[][]): number[][] {
  const pending = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  const rings: number[][] = [];
  while (pending.length) {
    let ring = pending.shift()!;
    let grew = true;
    while (ring[0] !== ring[ring.length - 1] && grew) {
      grew = false;
      const end = ring[ring.length - 1];
      const start = ring[0];
      for (let i = 0; i < pending.length; i++) {
        const w = pending[i]!;
        if (w[0] === end) ring = ring.concat(w.slice(1));
        else if (w[w.length - 1] === end) ring = ring.concat([...w].reverse().slice(1));
        else if (w[w.length - 1] === start) ring = w.concat(ring.slice(1));
        else if (w[0] === start) ring = [...w].reverse().concat(ring.slice(1));
        else continue;
        pending.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (isClosed(ring)) rings.push(ring);
  }
  return rings;
}

/** Assemble a multipolygon relation into polygons with holes. Null if no outer ring closes. */
export function relationPolygons(rel: OsmRelation, data: OsmData): LngLatPolygon[] | null {
  const outerWays: number[][] = [];
  const innerWays: number[][] = [];
  for (const m of rel.members) {
    if (m.type !== 'way') continue;
    const w = data.ways.get(m.ref);
    if (!w) return null; // incomplete relation: skip rather than draw a wrong shape
    (m.role === 'inner' ? innerWays : outerWays).push(w.refs);
  }
  const outers = joinRings(outerWays)
    .map((r) => coords(r, data))
    .filter((r): r is LngLat[] => r !== null);
  if (!outers.length) return null;
  const inners = joinRings(innerWays)
    .map((r) => coords(r, data))
    .filter((r): r is LngLat[] => r !== null);

  const proj = new LocalProjection(outers[0]![0]!);
  const xy = (ring: LngLat[]): XY[] => ring.map((p) => proj.toXY(p));
  const polys: LngLatPolygon[] = outers.map((o) => [o]);
  const outerXY = outers.map(xy);
  for (const inner of inners) {
    const probe = proj.toXY(inner[0]!);
    // Assign each hole to the smallest outer that contains it.
    let best = -1;
    let bestArea = Infinity;
    outerXY.forEach((o, i) => {
      const a = Math.abs(signedArea(o));
      if (a < bestArea && pointInPolygon(probe, [o])) {
        best = i;
        bestArea = a;
      }
    });
    if (best >= 0) polys[best]!.push(inner);
  }
  return polys;
}

/** Force GeoJSON (RFC 7946) winding: outer rings counter-clockwise, holes clockwise. */
export function rewind(poly: LngLatPolygon): LngLatPolygon {
  const proj = new LocalProjection(poly[0]![0]!);
  return poly.map((ring, i) => {
    const ccw = signedArea(ring.map((p) => proj.toXY(p))) > 0;
    return ccw === (i === 0) ? ring : [...ring].reverse();
  });
}
