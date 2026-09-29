import type { XY } from './project';

/** A ring of positions. The closing position may or may not repeat the first. */
export type Ring = XY[];
/** First ring is the outer boundary, the rest are holes. */
export type PolygonXY = Ring[];

function open(ring: Ring): Ring {
  const n = ring.length;
  if (n > 1 && ring[0]![0] === ring[n - 1]![0] && ring[0]![1] === ring[n - 1]![1]) {
    return ring.slice(0, -1);
  }
  return ring;
}

/** Signed area (shoelace). Positive when counter-clockwise. */
export function signedArea(ring: Ring): number {
  const r = open(ring);
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    a += (r[j]![0] - r[i]![0]) * (r[j]![1] + r[i]![1]);
  }
  return a / 2;
}

/** Area of a polygon with holes, in square units of the input. */
export function polygonArea(poly: PolygonXY): number {
  const [outer, ...holes] = poly;
  if (!outer) return 0;
  return holes.reduce((a, h) => a - Math.abs(signedArea(h)), Math.abs(signedArea(outer)));
}

/** Area-weighted centroid of the outer ring (falls back to the vertex mean for degenerate rings). */
export function centroid(ring: Ring): XY {
  const r = open(ring);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x0, y0] = r[j]!;
    const [x1, y1] = r[i]!;
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const n = r.length || 1;
    return [r.reduce((s, p) => s + p[0], 0) / n, r.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

function pointInRing([x, y]: XY, ring: Ring): boolean {
  let inside = false;
  const r = open(ring);
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!;
    const [xj, yj] = r[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd point-in-polygon test that respects holes. */
export function pointInPolygon(p: XY, poly: PolygonXY): boolean {
  const [outer, ...holes] = poly;
  if (!outer || !pointInRing(p, outer)) return false;
  return !holes.some((h) => pointInRing(p, h));
}

/** Closest point to `p` on segment ab, and its squared distance. */
export function closestOnSegment(p: XY, a: XY, b: XY): { point: XY; dist2: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point: XY = [a[0] + t * dx, a[1] + t * dy];
  const ex = p[0] - point[0];
  const ey = p[1] - point[1];
  return { point, dist2: ex * ex + ey * ey };
}

/** Convex hull (Andrew's monotone chain), counter-clockwise, no repeated closing point. */
export function convexHull(points: XY[]): XY[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: XY, a: XY, b: XY) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: XY[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: XY[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
