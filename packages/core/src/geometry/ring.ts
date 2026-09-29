import { signedArea, type Ring } from './polygon';
import type { XY } from './project';

/**
 * Clean a ring for meshing: drop the closing point, near-duplicate points and near-collinear
 * points. Returns null if fewer than 3 points remain.
 */
export function cleanRing(ring: Ring, tolerance = 0.05): XY[] | null {
  let pts = ring.slice();
  if (pts.length > 1) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  // Remove near-duplicates.
  pts = pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length]!;
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > tolerance;
  });
  // Remove near-collinear points (repeat until stable, since removals expose new triples).
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + pts.length - 1) % pts.length]!;
      const q = pts[i]!;
      const r = pts[(i + 1) % pts.length]!;
      const cross = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      const base = Math.hypot(r[0] - p[0], r[1] - p[1]);
      if (base > 0 && Math.abs(cross) / base < tolerance) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  // Collinear leftovers (e.g. three points on a line) have no area.
  return pts.length >= 3 && Math.abs(signedArea(pts)) > 0.1 ? pts : null;
}

/** Return the ring wound counter-clockwise (ccw = true) or clockwise. */
export function wind(ring: XY[], ccw: boolean): XY[] {
  return signedArea(ring) > 0 === ccw ? ring : [...ring].reverse();
}

/** Outward normal of edge a→b for a counter-clockwise outer ring (or clockwise hole). */
export function edgeNormal(a: XY, b: XY): XY {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dy / len, -dx / len];
}

/**
 * Move every vertex of a ring inwards (into the building's material) by `d`, using mitred
 * offsets with the miter capped at 3×d. Outer rings must be CCW and holes CW. Returns null when
 * the result is implausible (flipped or collapsed), so callers can skip the detail.
 */
export function insetRing(ring: XY[], d: number): XY[] | null {
  const n = ring.length;
  const out: XY[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i + n - 1) % n]!;
    const cur = ring[i]!;
    const next = ring[(i + 1) % n]!;
    const n1 = edgeNormal(prev, cur);
    const n2 = edgeNormal(cur, next);
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) return null; // hairpin
    mx /= ml;
    my /= ml;
    const cos = mx * n1[0] + my * n1[1];
    const len = Math.min(d / Math.max(cos, 1e-6), 3 * d);
    out.push([cur[0] - mx * len, cur[1] - my * len]);
  }
  const a0 = signedArea(ring);
  const a1 = signedArea(out);
  if (Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < 0.3 * Math.abs(a0)) return null;
  return out;
}
