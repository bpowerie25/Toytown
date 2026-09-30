/**
 * Procedural toy buildings: footprints in, merged vertex buffers out. No three.js objects are
 * created here (only its triangulator is used), so this runs in a Web Worker and in Node tests.
 *
 * Frame: local metres around the chunk origin, x east, y north, z up.
 */
import { ShapeUtils, Vector2 } from 'three';
import { wallPalette, windowStyle, type BuildingTheme, type WindowStyle } from '../themes';
import { pick } from './hash';
import { LocalProjection, type LngLat, type XY } from './project';
import { roofRise, selectRoof, type RoofKind } from './roof';
import { cleanRing, edgeNormal, insetRing, wind } from './ring';
import type { RotatedRect } from './rect';

export interface BuildingInputFeature {
  id: string;
  category: string;
  height: number;
  /** Polygon parts in lng/lat: each part is [outer, ...holes]. */
  parts: LngLat[][][];
  /** Compass bearing the building faces (from build-data), for doors and shopfronts. */
  front?: number | null;
}

/** One chunk's merged geometry. Attribute layouts match the render material. */
export interface ChunkMesh {
  /** Chunk origin (lng, lat); positions are metres relative to it. */
  origin: LngLat;
  positions: Float32Array; // xyz
  normals: Int8Array; // xyz, normalised ±127
  colors: Uint8Array; // rgb
  /** Per vertex: u along the wall edge (m), height above ground (m), edge length (0 = no windows), eave height. */
  walls: Float32Array;
  /** Per vertex: index into `ids`. */
  buildings: Float32Array;
  /**
   * Per vertex: face-edge coordinates for the ink-line shader (0 or 255). xyz are barycentric
   * corners; w = 255 means "triangle, outline all three edges", w = 0 means "quad, ignore y"
   * (y is shared by both ends of the quad's diagonal). All 255 means no outline (roof decks).
   */
  edges: Uint8Array;
  /**
   * Per vertex, walls only: window style for the shader (0–255 each): spacing ÷ 10 m, width
   * fraction, height fraction, and flags (1 frame, 2 shopfront, 4 street-facing wall, 8 tall
   * arched, 16 high strip, 32 front door). All 0 means no windows.
   */
  windows: Uint8Array;
  indices: Uint32Array;
  ids: string[];
  /** Roof chosen per building, same order as `ids`. */
  roofs: RoofKind[];
}

type V3 = [number, number, number];
type Edge = [number, number, number, number];
const NO_EDGE: Edge = [255, 255, 255, 255];
// Triangles fan as (0,1,2)(0,2,3): the diagonal 0–2 always has y = 0, which quads ignore.
const QUAD_EDGES: Edge[] = [[255, 0, 0, 0], [0, 255, 0, 0], [0, 0, 255, 0], [0, 255, 0, 0]]; // prettier-ignore
const TRI_EDGES: Edge[] = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]]; // prettier-ignore
type RGB = [number, number, number];
/** Packed window style, see `ChunkMesh.windows`. */
type Win = [number, number, number, number];
const NO_WIN: Win = [0, 0, 0, 0];
const FRONT = 4;

function packWindows(s: WindowStyle): Win {
  const flags =
    (s.frame ? 1 : 0) |
    (s.shopfront ? 2 : 0) |
    (s.tall ? 8 : 0) |
    (s.strip ? 16 : 0) |
    (s.door ? 32 : 0);
  const byte = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  return [byte(s.spacing / 10), byte(s.width), byte(s.height), flags];
}

/** Index of the outer-ring edge facing the street: the longest one within 45° of `front`, or -1. */
export function frontEdge(ring: XY[], front: number | null | undefined): number {
  if (front === null || front === undefined) return -1;
  let best = -1;
  let bestLen = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const [nx, ny] = edgeNormal(a, b);
    const bearing = (Math.atan2(nx, ny) * 180) / Math.PI;
    const diff = Math.abs(((bearing - front + 540) % 360) - 180);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (diff <= 45 && len > bestLen) {
      best = i;
      bestLen = len;
    }
  }
  return best;
}

const UP: V3 = [0, 0, 1];
const MIN_HEIGHT = 2.5;

export function hexToRgb(hex: string): RGB {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  wall: number[] = [];
  bid: number[] = [];
  edge: number[] = [];
  win: number[] = [];
  idx: number[] = [];
  building = 0;
  /** Window style for the vertices being added (walls set it, everything else leaves it off). */
  windows: Win = NO_WIN;

  private vert(
    p: V3,
    n: V3,
    c: RGB,
    w: [number, number, number, number],
    e: Edge = NO_EDGE,
  ): number {
    const i = this.pos.length / 3;
    this.edge.push(e[0], e[1], e[2], e[3]);
    this.win.push(this.windows[0], this.windows[1], this.windows[2], this.windows[3]);
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(Math.round(n[0] * 127), Math.round(n[1] * 127), Math.round(n[2] * 127));
    this.col.push(c[0], c[1], c[2]);
    this.wall.push(w[0], w[1], w[2], w[3]);
    this.bid.push(this.building);
    return i;
  }

  /**
   * A flat polygon face (3 or 4 corners, in order around the face). Winding is fixed so the
   * front faces `facing`; the normal is the face's true normal.
   */
  face(corners: V3[], facing: V3, color: RGB, walls?: [number, number, number, number][]) {
    let n = norm(cross(sub(corners[1]!, corners[0]!), sub(corners[2]!, corners[0]!)));
    let pts = corners;
    let w = walls;
    if (dot(n, facing) < 0) {
      pts = [...corners].reverse();
      w = walls && [...walls].reverse();
      n = [-n[0], -n[1], -n[2]];
    }
    const edges = pts.length === 3 ? TRI_EDGES : pts.length === 4 ? QUAD_EDGES : null;
    const ids = pts.map((p, i) =>
      this.vert(p, n, color, w ? w[i]! : [0, p[2], 0, 0], edges ? edges[i] : NO_EDGE),
    );
    for (let i = 1; i + 1 < ids.length; i++) this.idx.push(ids[0]!, ids[i]!, ids[i + 1]!);
  }

  /** Triangulated horizontal polygon (with holes) at height z, facing up or down. */
  cap(outer: XY[], holes: XY[][], z: number, color: RGB, up = true) {
    const contour = outer.map(([x, y]) => new Vector2(x, y));
    const holeVs = holes.map((h) => h.map(([x, y]) => new Vector2(x, y)));
    const tris = ShapeUtils.triangulateShape(contour, holeVs);
    const all = [...outer, ...holes.flat()];
    const n: V3 = up ? UP : [0, 0, -1];
    const base = all.map(([x, y]) => this.vert([x, y, z], n, color, [0, z, 0, 0]));
    for (const tri of tris) {
      const [a, b, c] = tri as [number, number, number];
      const pa = all[a]!;
      const pb = all[b]!;
      const pc = all[c]!;
      const ccw = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]) > 0;
      if (ccw === up) this.idx.push(base[a]!, base[b]!, base[c]!);
      else this.idx.push(base[a]!, base[c]!, base[b]!);
    }
  }

  toMesh(origin: LngLat, ids: string[], roofs: RoofKind[]): ChunkMesh {
    return {
      origin,
      positions: Float32Array.from(this.pos),
      normals: Int8Array.from(this.nrm),
      colors: Uint8Array.from(this.col),
      walls: Float32Array.from(this.wall),
      buildings: Float32Array.from(this.bid),
      edges: Uint8Array.from(this.edge),
      windows: Uint8Array.from(this.win),
      indices: Uint32Array.from(this.idx),
      ids,
      roofs,
    };
  }
}

/**
 * Vertical walls along a ring from z0 to z1, with the given window style (null: no windows).
 * `front` is the index of the street-facing edge, for doors and shopfronts (-1: none).
 */
function walls(
  m: MeshBuilder,
  ring: XY[],
  z0: number,
  z1: number,
  color: RGB,
  win: Win | null,
  eave: number,
  front = -1,
) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const [nx, ny] = edgeNormal(a, b);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const L = win ? len : 0;
    m.windows = win ? [win[0], win[1], win[2], win[3] | (i === front ? FRONT : 0)] : NO_WIN;
    m.face(
      [
        [a[0], a[1], z0],
        [b[0], b[1], z0],
        [b[0], b[1], z1],
        [a[0], a[1], z1],
      ],
      [nx, ny, 0],
      color,
      [
        [0, z0, L, eave],
        [len, z0, L, eave],
        [len, z1, L, eave],
        [0, z1, L, eave],
      ],
    );
  }
  m.windows = NO_WIN;
}

/** Sloped band from ring `a` at za to ring `b` (same vertex count) at zb, facing `facingUp` blended with each edge's normal. */
function band(
  m: MeshBuilder,
  a: XY[],
  za: number,
  b: XY[],
  zb: number,
  color: RGB,
  outward: 1 | -1,
) {
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    const [nx, ny] = edgeNormal(a[i]!, a[j]!);
    const facing = norm([nx * outward, ny * outward, 1]);
    m.face(
      [
        [a[i]![0], a[i]![1], za],
        [a[j]![0], a[j]![1], za],
        [b[j]![0], b[j]![1], zb],
        [b[i]![0], b[i]![1], zb],
      ],
      facing,
      color,
    );
  }
}

interface Rings {
  outer: XY[];
  holes: XY[][];
}

function flatBuilding(
  m: MeshBuilder,
  parts: Rings[],
  h: number,
  wall: RGB,
  deck: RGB,
  win: Win | null,
  front: number | null | undefined,
  t: BuildingTheme,
) {
  const { bevel, parapetHeight, parapetWidth } = t.flat;
  for (const { outer, holes } of parts) {
    const rings = [outer, ...holes];
    const inset1 = rings.map((r) => insetRing(r, bevel));
    const inset2 = rings.map((r) => insetRing(r, bevel + parapetWidth));
    const detailed = h >= 4 && inset1.every(Boolean) && inset2.every(Boolean);
    if (!detailed) {
      // Too small or too thin for a bevel and parapet: a plain box.
      rings.forEach((r, k) => walls(m, r, 0, h, wall, win, h, k === 0 ? frontEdge(r, front) : -1));
      m.cap(outer, holes, h, deck);
      continue;
    }
    const zb = h - bevel;
    const zd = h - parapetHeight;
    rings.forEach((r, k) => {
      walls(m, r, 0, zb, wall, win, zd, k === 0 ? frontEdge(r, front) : -1);
      band(m, r, zb, inset1[k]!, h, wall, 1); // bevelled top edge
      // Flat top of the parapet, from the bevel to the inner face.
      band(m, inset1[k]!, h, inset2[k]!, h, wall, 1);
      // Inner face of the parapet, facing the roof deck.
      const inner = inset2[k]!;
      for (let i = 0; i < inner.length; i++) {
        const a = inner[i]!;
        const b = inner[(i + 1) % inner.length]!;
        const [nx, ny] = edgeNormal(a, b);
        m.face(
          [
            [a[0], a[1], zd],
            [b[0], b[1], zd],
            [b[0], b[1], h],
            [a[0], a[1], h],
          ],
          [-nx, -ny, 0],
          wall,
        );
      }
    });
    m.cap(inset2[0]!, inset2.slice(1) as XY[][], zd, deck);
  }
}

function pitchedBuilding(
  m: MeshBuilder,
  outer: XY[],
  rect: RotatedRect,
  kind: 'gable' | 'hip',
  h: number,
  rise: number,
  wall: RGB,
  roof: RGB,
  win: Win | null,
  front: number | null | undefined,
  t: BuildingTheme,
) {
  const eave = h - rise;
  walls(m, outer, 0, eave, wall, win, eave, frontEdge(outer, front));

  const e: XY = [Math.cos(rect.angle), Math.sin(rect.angle)];
  const f: XY = [-e[1], e[0]];
  const [cx, cy] = rect.center;
  const at = (u: number, v: number, z: number): V3 => [
    cx + e[0] * u + f[0] * v,
    cy + e[1] * u + f[1] * v,
    z,
  ];
  const hl0 = rect.length / 2;
  const hw0 = rect.width / 2;
  const hl = hl0 + t.pitchedRoofs.overhang;
  const hw = hw0 + t.pitchedRoofs.overhang;
  // Keep the pitch the same over the overhang: the eave line drops below the wall top.
  const zEave = eave - (t.pitchedRoofs.overhang * rise) / hw0;
  const E: V3 = [e[0], e[1], 0];
  const F: V3 = [f[0], f[1], 0];
  const up = (d: V3): V3 => norm([d[0], d[1], 1]);

  if (kind === 'gable') {
    m.face([at(-hl, hw, zEave), at(hl, hw, zEave), at(hl, 0, h), at(-hl, 0, h)], up(F), roof);
    m.face(
      [at(-hl, -hw, zEave), at(hl, -hw, zEave), at(hl, 0, h), at(-hl, 0, h)],
      up([-F[0], -F[1], 0]),
      roof,
    );
    // Gable end walls, in the wall plane, from the wall top to the ridge.
    m.face([at(hl0, -hw0, eave), at(hl0, hw0, eave), at(hl0, 0, h)], E, wall);
    m.face([at(-hl0, -hw0, eave), at(-hl0, hw0, eave), at(-hl0, 0, h)], [-E[0], -E[1], 0], wall);
  } else {
    const r = Math.max(0, hl - hw);
    m.face(
      [at(-hl, hw, zEave), at(hl, hw, zEave), at(r, 0, h), at(-r, 0, h)].filter(dedupe),
      up(F),
      roof,
    );
    m.face(
      [at(-hl, -hw, zEave), at(hl, -hw, zEave), at(r, 0, h), at(-r, 0, h)].filter(dedupe),
      up([-F[0], -F[1], 0]),
      roof,
    );
    m.face([at(hl, -hw, zEave), at(hl, hw, zEave), at(r, 0, h)], up(E), roof);
    m.face([at(-hl, -hw, zEave), at(-hl, hw, zEave), at(-r, 0, h)], up([-E[0], -E[1], 0]), roof);
  }
  // Soffit under the eaves, so the overhang isn't see-through from low angles.
  m.face(
    [at(-hl, -hw, zEave), at(hl, -hw, zEave), at(hl, hw, zEave), at(-hl, hw, zEave)],
    [0, 0, -1],
    roof,
  );
}

/** Drop the second of two identical consecutive corners (a hip with no ridge is a pyramid). */
function dedupe(p: V3, i: number, all: V3[]): boolean {
  if (i === 0) return true;
  const q = all[i - 1]!;
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-9;
}

/** Mesh all buildings of one chunk into a single set of buffers. */
export function meshChunk(
  features: BuildingInputFeature[],
  origin: LngLat,
  theme: BuildingTheme,
): ChunkMesh {
  const proj = new LocalProjection(origin);
  const m = new MeshBuilder();
  const ids: string[] = [];
  const roofs: RoofKind[] = [];

  for (const f of features) {
    const parts: Rings[] = [];
    for (const part of f.parts) {
      const outer = cleanRing(part[0]!.map((p) => proj.toXY(p)));
      if (!outer) continue;
      const holes = part
        .slice(1)
        .map((h) => cleanRing(h.map((p) => proj.toXY(p))))
        .filter((h): h is XY[] => h !== null)
        .map((h) => wind(h, false));
      parts.push({ outer: wind(outer, true), holes });
    }
    if (!parts.length) continue;

    m.building = ids.length;
    ids.push(f.id);
    const h = Math.max(MIN_HEIGHT, f.height);
    const wall = hexToRgb(pick(wallPalette(theme, f.category), `${f.id}:wall`));
    const win =
      h >= theme.minWindowHeight && !theme.windowsOff.includes(f.category)
        ? packWindows(windowStyle(theme, f.category))
        : null;

    const choice = selectRoof(
      f.id,
      f.category,
      parts.map((p) => [p.outer, ...p.holes]),
      theme,
    );
    const rise = choice.rect ? roofRise(choice.rect.width, h, theme) : 0;
    if (choice.kind !== 'flat' && rise > 0) {
      const roof = hexToRgb(pick(theme.roofs, `${f.id}:roofcolor`));
      pitchedBuilding(
        m,
        parts[0]!.outer,
        choice.rect!,
        choice.kind,
        h,
        rise,
        wall,
        roof,
        win,
        f.front,
        theme,
      );
      roofs.push(choice.kind);
    } else {
      flatBuilding(m, parts, h, wall, hexToRgb(theme.flatRoof), win, f.front, theme);
      roofs.push('flat');
    }
  }
  return m.toMesh(origin, ids, roofs);
}

/**
 * The low-detail version of a chunk (LOD for zoom 14–15): every footprint extruded to its full
 * height with a flat top, with no windows, bevels, parapets or roof shapes. The top uses the
 * building's roof colour when it would get a pitched roof, so the colours stay continuous as
 * detail loads in.
 */
export function meshChunkPlain(
  features: BuildingInputFeature[],
  origin: LngLat,
  theme: BuildingTheme,
): ChunkMesh {
  const proj = new LocalProjection(origin);
  const m = new MeshBuilder();
  const ids: string[] = [];
  const roofs: RoofKind[] = [];
  for (const f of features) {
    const parts: Rings[] = [];
    for (const part of f.parts) {
      const outer = cleanRing(part[0]!.map((p) => proj.toXY(p)));
      if (!outer) continue;
      const holes = part
        .slice(1)
        .map((h) => cleanRing(h.map((p) => proj.toXY(p))))
        .filter((h): h is XY[] => h !== null)
        .map((h) => wind(h, false));
      parts.push({ outer: wind(outer, true), holes });
    }
    if (!parts.length) continue;
    m.building = ids.length;
    ids.push(f.id);
    const h = Math.max(MIN_HEIGHT, f.height);
    const wall = hexToRgb(pick(wallPalette(theme, f.category), `${f.id}:wall`));
    const choice = selectRoof(
      f.id,
      f.category,
      parts.map((p) => [p.outer, ...p.holes]),
      theme,
    );
    const pitched =
      choice.kind !== 'flat' && !!choice.rect && roofRise(choice.rect.width, h, theme) > 0;
    const top = hexToRgb(pitched ? pick(theme.roofs, `${f.id}:roofcolor`) : theme.flatRoof);
    for (const { outer, holes } of parts) {
      for (const r of [outer, ...holes]) walls(m, r, 0, h, wall, null, h);
      m.cap(outer, holes, h, top);
    }
    roofs.push('flat');
  }
  return m.toMesh(origin, ids, roofs);
}
