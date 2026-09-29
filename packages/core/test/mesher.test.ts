import { describe, expect, it } from 'vitest';
import {
  cleanRing,
  groupByChunk,
  hexToRgb,
  insetRing,
  LocalProjection,
  meshChunk,
  signedArea,
  tileCenter,
  tileOf,
  type BuildingInputFeature,
  type ChunkMesh,
  type LngLat,
  type XY,
} from '../src/geometry';
import { DEFAULT_THEME } from '../src/themes';

const t = DEFAULT_THEME.buildings;
const ORIGIN: LngLat = [-7.11, 52.26];
const proj = new LocalProjection(ORIGIN);
/** A w×d rectangle (metres) at (x, y) as a lng/lat ring. */
const rect = (x: number, y: number, w: number, d: number): LngLat[] =>
  ([[x, y], [x + w, y], [x + w, y + d], [x, y + d], [x, y]] as XY[]).map((p) => proj.toLngLat(p)); // prettier-ignore
const building = (
  id: string,
  category: string,
  height: number,
  ...parts: LngLat[][][]
): BuildingInputFeature => ({
  id,
  category,
  height,
  parts,
});

/** Z range and per-triangle checks. */
function inspect(m: ChunkMesh) {
  let maxZ = -Infinity;
  let minZ = Infinity;
  for (let i = 2; i < m.positions.length; i += 3) {
    maxZ = Math.max(maxZ, m.positions[i]!);
    minZ = Math.min(minZ, m.positions[i]!);
  }
  // Every triangle's geometric normal agrees with its stored vertex normal.
  let disagree = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!];
    const p = (k: number) => [
      m.positions[k * 3]!,
      m.positions[k * 3 + 1]!,
      m.positions[k * 3 + 2]!,
    ];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
    const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
    const n = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const s = [m.normals[a * 3]!, m.normals[a * 3 + 1]!, m.normals[a * 3 + 2]!];
    if (n[0]! * s[0]! + n[1]! * s[1]! + n[2]! * s[2]! < 0) disagree++;
  }
  return {
    maxZ,
    minZ,
    disagree,
    vertices: m.positions.length / 3,
    triangles: m.indices.length / 3,
  };
}

describe('ring helpers', () => {
  it('cleans closing, duplicate and collinear points', () => {
    const r: XY[] = [[0, 0], [5, 0], [10, 0], [10, 0.001], [10, 10], [0, 10], [0, 0]]; // prettier-ignore
    expect(cleanRing(r)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]); // prettier-ignore
    expect(cleanRing([[0, 0], [1, 0], [2, 0]])).toBeNull(); // prettier-ignore
  });

  it('insets a CCW square evenly, and refuses to collapse it', () => {
    const sq: XY[] = [[0, 0], [10, 0], [10, 10], [0, 10]]; // prettier-ignore
    const r = insetRing(sq, 1)!;
    expect(r.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)])).toEqual([[1, 1], [9, 1], [9, 9], [1, 9]]); // prettier-ignore
    expect(signedArea(r)).toBeCloseTo(64);
    expect(insetRing(sq, 4.9)).toBeNull();
  });
});

describe('meshChunk', () => {
  it('merges many buildings into one set of buffers', () => {
    const m = meshChunk(
      Array.from({ length: 20 }, (_, i) =>
        building(`way/${i}`, 'house', 8, [rect(i * 15, 0, 10, 8)]),
      ),
      ORIGIN,
      t,
    );
    expect(m.ids).toHaveLength(20);
    expect(new Set(m.buildings)).toEqual(new Set(Array.from({ length: 20 }, (_, i) => i)));
    const { vertices } = inspect(m);
    for (const arr of [m.normals, m.colors]) expect(arr.length).toBe(vertices * 3);
    expect(m.walls.length).toBe(vertices * 4);
    expect(Math.max(...m.indices)).toBe(vertices - 1);
  });

  it('builds a gable house: walls to the eaves, ridge at full height, normals outward', () => {
    const m = meshChunk([building('way/1', 'church', 9, [rect(0, 0, 12, 8)])], ORIGIN, t);
    expect(m.roofs).toEqual(['gable']);
    const { maxZ, minZ, disagree } = inspect(m);
    expect(maxZ).toBeCloseTo(9, 5);
    expect(minZ).toBeLessThanOrEqual(0.001);
    expect(disagree).toBe(0);
  });

  it('builds a hip roof', () => {
    const m = meshChunk([building('way/1', 'school', 10, [rect(0, 0, 20, 10)])], ORIGIN, t);
    expect(m.roofs).toEqual(['hip']);
    expect(inspect(m).disagree).toBe(0);
  });

  it('builds a flat roof with bevel and parapet, the deck below the parapet top', () => {
    const m = meshChunk([building('way/1', 'office', 12, [rect(0, 0, 20, 15)])], ORIGIN, t);
    expect(m.roofs).toEqual(['flat']);
    const zs = new Set<number>();
    for (let i = 2; i < m.positions.length; i += 3) zs.add(Math.round(m.positions[i]! * 100) / 100);
    expect([...zs].sort((a, b) => a - b)).toEqual([0, 11.4, 11.7, 12]); // ground, deck, bevel start, top
    expect(inspect(m).disagree).toBe(0);
  });

  it('meshes courtyards (holes) and multipolygons flat', () => {
    const outer = rect(0, 0, 30, 30);
    const hole = rect(10, 10, 10, 10).reverse();
    const m = meshChunk(
      [building('relation/1', 'house', 8, [outer, hole], [rect(40, 0, 5, 5)])],
      ORIGIN,
      t,
    );
    expect(m.roofs).toEqual(['flat']);
    expect(inspect(m).disagree).toBe(0);
  });

  it('falls back to a plain box when the footprint is too thin for a parapet', () => {
    const m = meshChunk([building('way/1', 'office', 10, [rect(0, 0, 20, 0.9)])], ORIGIN, t);
    const zs = new Set<number>();
    for (let i = 2; i < m.positions.length; i += 3) zs.add(m.positions[i]!);
    expect([...zs].sort((a, b) => a - b)).toEqual([0, 10]);
  });

  it('uses the category wall palette and a roof colour from the theme', () => {
    const m = meshChunk([building('way/7', 'terraced_house', 8, [rect(0, 0, 6, 9)])], ORIGIN, t);
    const colors = new Set<string>();
    for (let i = 0; i < m.colors.length; i += 3)
      colors.add(`${m.colors[i]},${m.colors[i + 1]},${m.colors[i + 2]}`);
    const allowed = new Set(
      [...t.walls.terraced_house!, ...t.roofs].map((h) => hexToRgb(h).join(',')),
    );
    for (const c of colors) expect(allowed.has(c), c).toBe(true);
  });

  it('is deterministic per building id', () => {
    const f = [building('way/42', 'house', 8, [rect(0, 0, 10, 8)])];
    expect(meshChunk(f, ORIGIN, t)).toEqual(meshChunk(f, ORIGIN, t));
  });

  it('marks wall edges for windows, except for window-less categories and sheds', () => {
    const edgeLengths = (m: ChunkMesh) => {
      const s = new Set<number>();
      for (let i = 2; i < m.walls.length; i += 4) s.add(Math.round(m.walls[i]!));
      return s;
    };
    expect(
      edgeLengths(meshChunk([building('way/1', 'office', 12, [rect(0, 0, 20, 15)])], ORIGIN, t)),
    ).toEqual(new Set([0, 15, 20]));
    expect(
      edgeLengths(meshChunk([building('way/1', 'warehouse', 9, [rect(0, 0, 20, 15)])], ORIGIN, t)),
    ).toEqual(new Set([0]));
    expect(
      edgeLengths(meshChunk([building('way/1', 'generic', 3, [rect(0, 0, 4, 5)])], ORIGIN, t)),
    ).toEqual(new Set([0]));
  });

  it('skips degenerate footprints', () => {
    const line = [
      proj.toLngLat([0, 0]),
      proj.toLngLat([5, 0]),
      proj.toLngLat([10, 0]),
      proj.toLngLat([0, 0]),
    ];
    expect(meshChunk([building('way/1', 'house', 8, [line])], ORIGIN, t).ids).toEqual([]);
  });
});

describe('chunks', () => {
  it('maps lng/lat to z15 tiles and back to the tile centre', () => {
    const [x, y] = tileOf([-7.11, 52.26]);
    const c = tileCenter(x, y);
    expect(tileOf(c)).toEqual([x, y]);
    expect(Math.abs(c[0] + 7.11)).toBeLessThan(0.011);
  });

  it('groups items by tile', () => {
    const pts: LngLat[] = [[-7.11, 52.26], [-7.1101, 52.2601], [-7.0, 52.3]]; // prettier-ignore
    const chunks = groupByChunk(pts, (p) => p);
    expect(chunks.map((c) => c.items.length)).toEqual([2, 1]);
    expect(chunks[0]!.key).toMatch(/^15\/\d+\/\d+$/);
  });
});
