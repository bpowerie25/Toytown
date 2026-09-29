import { convexHull, polygonArea, type PolygonXY, type Ring } from './polygon';
import type { XY } from './project';

export interface RotatedRect {
  center: XY;
  /** Length of the long side. */
  length: number;
  /** Length of the short side. */
  width: number;
  /** Direction of the long side, radians counter-clockwise from +x (east), in [0, π). */
  angle: number;
  area: number;
  /** The four corners, counter-clockwise. */
  corners: [XY, XY, XY, XY];
}

/**
 * Minimum-area rotated rectangle enclosing the ring, by rotating calipers over the convex hull
 * (the optimal rectangle has a side collinear with a hull edge). Returns null for degenerate input.
 */
export function minRotatedRect(ring: Ring): RotatedRect | null {
  const hull = convexHull(ring);
  if (hull.length < 3) return null;

  let best: { area: number; ux: number; uy: number; min: XY; max: XY } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const [x, y] of hull) {
      const u = x * ux + y * uy;
      const v = -x * uy + y * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    // Tie-break on the smaller angle so results are stable for squares and symmetric shapes.
    if (!best || area < best.area - 1e-9) {
      best = { area, ux, uy, min: [minU, minV], max: [maxU, maxV] };
    }
  }
  if (!best || best.area <= 0) return null;

  const { ux, uy, min, max } = best;
  const toXY = (u: number, v: number): XY => [u * ux - v * uy, u * uy + v * ux];
  const corners: [XY, XY, XY, XY] = [
    toXY(min[0], min[1]),
    toXY(max[0], min[1]),
    toXY(max[0], max[1]),
    toXY(min[0], max[1]),
  ];
  const du = max[0] - min[0];
  const dv = max[1] - min[1];
  let angle = Math.atan2(uy, ux);
  if (dv > du) angle += Math.PI / 2; // long side runs along v
  angle = ((angle % Math.PI) + Math.PI) % Math.PI;
  if (Math.abs(angle - Math.PI) < 1e-9) angle = 0;
  return {
    center: toXY((min[0] + max[0]) / 2, (min[1] + max[1]) / 2),
    length: Math.max(du, dv),
    width: Math.min(du, dv),
    angle,
    area: best.area,
    corners,
  };
}

/** Polygon area divided by its minimum rotated rectangle's area: 1 for a perfect rectangle. */
export function rectangularity(poly: PolygonXY): number {
  const rect = poly[0] && minRotatedRect(poly[0]);
  if (!rect) return 0;
  return polygonArea(poly) / rect.area;
}

/** Convert a math angle (radians CCW from east) to a compass bearing in degrees (clockwise from north). */
export function angleToBearing(angle: number): number {
  const b = 90 - (angle * 180) / Math.PI;
  return ((b % 360) + 360) % 360;
}

/**
 * Orientation of a footprint: the compass bearing of the long side of its minimum rotated
 * rectangle, in degrees in [0, 180).
 */
export function orientation(ring: Ring): number | null {
  const rect = minRotatedRect(ring);
  if (!rect) return null;
  const o = round1(angleToBearing(rect.angle) % 180);
  return o >= 180 ? o - 180 : o;
}

/**
 * Snap the bearing towards a street onto the nearest of the four sides of a footprint
 * with the given orientation, so models face squarely out of one side. Degrees in [0, 360).
 */
export function snapFront(towardsStreet: number, orientationDeg: number): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let k = 0; k < 4; k++) {
    const side = (orientationDeg + k * 90) % 360;
    const diff = Math.abs(((towardsStreet - side + 540) % 360) - 180);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = side;
    }
  }
  return round1(best);
}

function round1(x: number): number {
  const r = Math.round(x * 10) / 10;
  return r >= 360 ? r - 360 : r;
}
