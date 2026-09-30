/**
 * Open spaces: parks, pitches, playgrounds, racecourses and other areas from build-data
 * (`kind: "area"` polygons and `kind: "track"` lines). They're drawn flat on the base map, under
 * the roads and the 3D layer. Pure functions: features in, GeoJSON and placements out.
 *
 * - fills and outlines come straight from the data, coloured by category from the theme;
 * - pitches get mowing stripes and white markings from their minimum rectangle;
 * - named areas get one label, at the point farthest inside the shape;
 * - area props (goals, posts, a playset) are placed at pitch ends or the area's middle.
 */
import {
  LocalProjection,
  hashUnit,
  minRotatedRect,
  pointInPolygon,
  rectangularity,
  type LngLat,
  type RotatedRect,
  type XY,
} from './geometry';
import type { Placement, PlanKit } from './placement';

export interface AreaFeature {
  id: string;
  category: string;
  kind: 'area' | 'track';
  name?: string;
  sport?: string;
  /** Polygons (outer ring first, then holes) for areas; one polygon of one line for tracks. */
  parts: LngLat[][][];
}

type Geometry =
  | { type: 'Polygon'; coordinates: LngLat[][] }
  | { type: 'LineString'; coordinates: LngLat[] }
  | { type: 'Point'; coordinates: LngLat };
interface Feature {
  type: 'Feature';
  geometry: Geometry;
  properties: Record<string, string | number>;
}
export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

/** Categories that get stripes and full pitch markings. */
const PITCHES = new Set(['pitch', 'pitch_soccer', 'pitch_gaa']);
/** Small courts: an outline and a centre line. */
const COURTS = new Set(['pitch_court']);
/** Drawn as a running track (a band between two rails) along their outline or line. */
export const RAILED = new Set(['track']);

const bearing = (v: XY) => ((Math.atan2(v[0], v[1]) * 180) / Math.PI + 360) % 360;

/** A pitch's frame: its minimum rectangle, if the shape is close enough to one. */
function pitchRect(ring: XY[], min = 0.8): RotatedRect | null {
  const rect = minRotatedRect(ring);
  if (!rect || rect.length < 12 || rect.width < 6) return null;
  return rectangularity([ring]) >= min ? rect : null;
}

/** A point in the rectangle's frame: `u` metres along its length, `v` across, from the centre. */
function at(rect: RotatedRect, u: number, v: number): XY {
  const e: XY = [Math.cos(rect.angle), Math.sin(rect.angle)];
  return [rect.center[0] + e[0] * u - e[1] * v, rect.center[1] + e[1] * u + e[0] * v];
}

/** Axis-aligned box in the rectangle's frame, as a closed ring. */
function box(rect: RotatedRect, u0: number, u1: number, v0: number, v1: number): XY[] {
  return [at(rect, u0, v0), at(rect, u1, v0), at(rect, u1, v1), at(rect, u0, v1), at(rect, u0, v0)];
}

/**
 * White line markings for a pitch, in its rectangle's frame. Sizes follow the real pitch where
 * it's big enough, and shrink in proportion on small ones.
 */
export function pitchMarkings(rect: RotatedRect, category: string): XY[][] {
  const L = rect.length * 0.96; // lines sit just inside the grass
  const W = rect.width * 0.94;
  const hl = L / 2;
  const hw = W / 2;
  const lines: XY[][] = [box(rect, -hl, hl, -hw, hw), [at(rect, 0, -hw), at(rect, 0, hw)]];
  if (COURTS.has(category)) return lines;

  // Scale real-world distances down on pitches shorter than a full-size one.
  const k = Math.min(1, L / (category === 'pitch_gaa' ? 140 : 105));
  if (category === 'pitch_gaa') {
    for (const d of [13, 20, 45]) {
      for (const s of [-1, 1])
        lines.push([at(rect, s * (hl - d * k), -hw), at(rect, s * (hl - d * k), hw)]);
    }
    for (const s of [-1, 1]) {
      lines.push(box(rect, s * hl, s * (hl - 4.5 * k), -7 * k, 7 * k));
      lines.push(box(rect, s * hl, s * (hl - 13 * k), -9.5 * k, 9.5 * k));
    }
    lines.push(circle(rect, 0, 0, Math.min(5 * k, hw * 0.3)));
  } else {
    for (const s of [-1, 1]) {
      lines.push(
        box(
          rect,
          s * hl,
          s * (hl - 16.5 * k),
          -Math.min(20.15 * k, hw * 0.6),
          Math.min(20.15 * k, hw * 0.6),
        ),
      );
      lines.push(
        box(
          rect,
          s * hl,
          s * (hl - 5.5 * k),
          -Math.min(9.16 * k, hw * 0.3),
          Math.min(9.16 * k, hw * 0.3),
        ),
      );
    }
    lines.push(circle(rect, 0, 0, Math.min(9.15 * k, hw * 0.35)));
  }
  return lines;
}

function circle(rect: RotatedRect, u: number, v: number, r: number, n = 32): XY[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return at(rect, u + r * Math.cos(a), v + r * Math.sin(a));
  });
}

/** Mowing stripes: every other band across the pitch's length, as closed rings. */
export function pitchStripes(rect: RotatedRect, bands = 12): XY[][] {
  const out: XY[][] = [];
  const step = rect.length / bands;
  const hw = rect.width / 2;
  for (let i = 1; i < bands; i += 2) {
    const u0 = -rect.length / 2 + i * step;
    out.push(box(rect, u0, u0 + step, -hw, hw));
  }
  return out;
}

/** Shortest distance from `p` to any edge of the polygon. */
function edgeDistance(p: XY, poly: XY[][]): number {
  let best = Infinity;
  for (const ring of poly) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const [ax, ay] = ring[i]!;
      const [bx, by] = ring[i + 1]!;
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(
        0,
        Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)),
      );
      best = Math.min(best, Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy));
    }
  }
  return best;
}

/**
 * A good spot for a label or a centre prop: roughly the point farthest from the edges (a coarse
 * grid search, refined once around the best cell). Always inside the polygon.
 */
export function innerPoint(poly: XY[][]): { point: XY; clearance: number } | null {
  const outer = poly[0];
  if (!outer || outer.length < 4) return null;
  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); // prettier-ignore
  let best: { point: XY; clearance: number } | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const n = 12;
    const sx = (x1 - x0) / n;
    const sy = (y1 - y0) / n;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const p: XY = [x0 + i * sx, y0 + j * sy];
        if (!pointInPolygon(p, poly)) continue;
        const d = edgeDistance(p, poly);
        if (!best || d > best.clearance) best = { point: p, clearance: d };
      }
    }
    if (!best) return null;
    [x0, x1, y0, y1] = [
      best.point[0] - sx,
      best.point[0] + sx,
      best.point[1] - sy,
      best.point[1] + sy,
    ];
  }
  return best;
}

/** The generated map features for a set of areas, one collection per map layer. */
export interface AreaLayers {
  /** The areas themselves (polygons and track lines), with `category` and `kind`. */
  areas: FeatureCollection;
  /** Mowing stripes on pitches. */
  stripes: FeatureCollection;
  /** White pitch and court lines. */
  markings: FeatureCollection;
  /** One point per named area, with `name` and `category`. */
  labels: FeatureCollection;
}

const toLngLat = (proj: LocalProjection, ring: XY[]) => ring.map((p) => proj.toLngLat(p));

/** Fills, stripes, markings and labels for the base map. */
export function areaLayers(areas: AreaFeature[]): AreaLayers {
  const out: AreaLayers = {
    areas: { type: 'FeatureCollection', features: [] },
    stripes: { type: 'FeatureCollection', features: [] },
    markings: { type: 'FeatureCollection', features: [] },
    labels: { type: 'FeatureCollection', features: [] },
  };
  for (const a of areas) {
    const props = {
      id: a.id,
      category: a.category,
      kind: a.kind,
      ...(a.sport ? { sport: a.sport } : {}),
    };
    if (a.kind === 'track') {
      for (const line of a.parts[0] ?? []) {
        out.areas.features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: line },
          properties: props,
        });
      }
      continue;
    }
    for (const poly of a.parts) {
      out.areas.features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: poly },
        properties: props,
      });
    }

    // Pitch details and labels work on the largest part.
    const main = largest(a.parts);
    if (!main) continue;
    const proj = new LocalProjection(main[0]![0]!);
    const poly = main.map((r) => r.map((p) => proj.toXY(p)));
    if (PITCHES.has(a.category) || COURTS.has(a.category)) {
      const rect = pitchRect(poly[0]!);
      if (rect) {
        if (PITCHES.has(a.category)) {
          for (const s of pitchStripes(rect)) {
            out.stripes.features.push({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [toLngLat(proj, s)] },
              properties: props,
            });
          }
        }
        for (const l of pitchMarkings(rect, a.category)) {
          out.markings.features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: toLngLat(proj, l) },
            properties: props,
          });
        }
      }
    }
    if (a.name) {
      const inner = innerPoint(poly);
      if (inner) {
        out.labels.features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: proj.toLngLat(inner.point) },
          properties: { ...props, name: a.name },
        });
      }
    }
  }
  return out;
}

/** The part with the largest outer-ring bounding box (cheap, and fine for picking one). */
function largest(parts: LngLat[][][]): LngLat[][] | null {
  let best: LngLat[][] | null = null;
  let size = -1;
  for (const p of parts) {
    const r = p[0];
    if (!r || r.length < 4) continue;
    const xs = r.map((q) => q[0]);
    const ys = r.map((q) => q[1]);
    const s = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (s > size) [best, size] = [p, s];
  }
  return best;
}

/**
 * Props for open spaces: kit props whose `categories` name area categories. `pitch-ends` puts
 * one at each end of the pitch facing in (scaled down on small pitches); `area-centre` puts one
 * at the area's middle if it fits.
 */
export function planAreaProps(areas: AreaFeature[], kit: PlanKit): Placement[] {
  const out: Placement[] = [];
  for (const a of areas) {
    if (a.kind !== 'area') continue;
    const props = Object.entries(kit.props).filter(
      ([, p]) =>
        p.categories.includes(a.category) &&
        (p.attach.at === 'pitch-ends' || p.attach.at === 'area-centre'),
    );
    if (!props.length) continue;
    const main = largest(a.parts);
    if (!main) continue;
    const proj = new LocalProjection(main[0]![0]!);
    const poly = main.map((r) => r.map((p) => proj.toXY(p)));
    // One prop per area and attach mode: the first listed for the category wins.
    const done = new Set<string>();
    for (const [name, p] of props) {
      if (done.has(p.attach.at)) continue;
      if (p.attach.at === 'pitch-ends') {
        const rect = pitchRect(poly[0]!);
        if (!rect || rect.length < 20) continue;
        const scale = Math.max(0.4, Math.min(1, (rect.width * 0.11) / p.footprint_m[0]));
        const e: XY = [Math.cos(rect.angle), Math.sin(rect.angle)];
        for (const s of [-1, 1]) {
          const u = s * (rect.length * 0.48);
          out.push({
            id: a.id,
            kind: 'prop',
            name,
            position: proj.toLngLat(at(rect, u, 0)),
            z: 0,
            front: bearing([-s * e[0], -s * e[1]]),
            scale,
          });
        }
      } else {
        const inner = innerPoint(poly);
        if (!inner || inner.clearance < Math.max(...p.footprint_m) / 2 + 1) continue;
        out.push({
          id: a.id,
          kind: 'prop',
          name,
          position: proj.toLngLat(inner.point),
          z: 0,
          front: Math.round(hashUnit(`${a.id}:yaw`) * 4) * 90,
          scale: 1,
        });
      }
      done.add(p.attach.at);
    }
  }
  return out;
}
