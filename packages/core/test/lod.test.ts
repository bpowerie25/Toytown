import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LocalProjection,
  meshChunkPlain,
  parseChunkKey,
  tileBounds,
  tileCenter,
  tileOf,
  type LngLat,
  type XY,
} from '../src/geometry';
import { parseManifest } from '../src/manifest';
import { planKit, type PlannedBuilding } from '../src/placement';
import { SceneFrame } from '../src/render/frame';
import { chunkSphere, chunksToDispose, DEFAULT_LOD, lodLevel } from '../src/render/lod';
import { processChunk } from '../src/render/chunk';
import { DEFAULT_THEME as theme } from '../src/themes';
import { toChunks } from '../src/toytown';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../../../assets/models');
const kit = planKit(parseManifest(JSON.parse(readFileSync(join(ASSETS, 'manifest.json'), 'utf8'))));
const ORIGIN: LngLat = [-7.11, 52.26];
const proj = new LocalProjection(ORIGIN);
function building(
  id: string,
  category: string,
  w: number,
  d: number,
  x = 0,
  front: number | null = 180,
): PlannedBuilding {
  const ring = ([[x, 0], [x + w, 0], [x + w, d], [x, d], [x, 0]] as XY[]).map((p) => proj.toLngLat(p)); // prettier-ignore
  return { id, category, height: 8, front, parts: [[ring]] };
}

describe('lodLevel', () => {
  it('follows the plan: base < 14, plain 14–15, full 15–16, models ≥ 16', () => {
    expect([13.9, 14, 14.9, 15, 15.9, 16, 18].map((z) => lodLevel(z, DEFAULT_LOD))).toEqual([
      0, 1, 1, 2, 2, 3, 3,
    ]);
  });
  it('uses custom thresholds', () => {
    expect(lodLevel(15, { ...DEFAULT_LOD, modelZoom: 15 })).toBe(3);
  });
});

describe('meshChunkPlain', () => {
  it('extrudes every footprint to full height with a flat top and no windows', () => {
    const m = meshChunkPlain(
      [building('way/1', 'house', 10, 8), building('way/2', 'office', 20, 15, 30)],
      ORIGIN,
      theme.buildings,
    );
    expect(m.ids).toEqual(['way/1', 'way/2']);
    const zs = new Set<number>();
    for (let i = 2; i < m.positions.length; i += 3) zs.add(Math.round(m.positions[i]! * 100) / 100);
    expect([...zs].sort((a, b) => a - b)).toEqual([0, 8]);
    for (let i = 2; i < m.walls.length; i += 4) expect(m.walls[i]).toBe(0); // no window edges
  });

  it('tops pitched-roof buildings with their roof colour', () => {
    const m = meshChunkPlain([building('way/1', 'church', 10, 20)], ORIGIN, theme.buildings);
    const roofs = new Set(
      theme.buildings.roofs.map((h) =>
        [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(','),
      ),
    );
    let top = '';
    for (let v = 0; v < m.positions.length / 3; v++) {
      if (m.normals[v * 3 + 2] === 127)
        top = `${m.colors[v * 3]},${m.colors[v * 3 + 1]},${m.colors[v * 3 + 2]}`;
    }
    expect(roofs.has(top)).toBe(true);
  });
});

describe('processChunk', () => {
  it('splits buildings into full (kept) and fitted (replaced by models), and plain has all', () => {
    const cafeBig = building('way/1', 'cafe', 30, 12, 0);
    const church = building('way/2', 'church', 10.8, 28.7, 50);
    const r = processChunk({ buildings: [cafeBig, church], origin: ORIGIN, theme, kit });
    expect(r.fitted.ids).toEqual(['way/2']);
    expect(r.full.ids).toEqual(['way/1']);
    expect(r.plain.ids).toEqual(['way/1', 'way/2']);
    expect(r.placements.map((p) => p.name).sort()).toEqual(['awning', 'church']);
  });

  it('meshes everything as full when there is no model kit', () => {
    const r = processChunk({
      buildings: [building('way/2', 'church', 10.8, 28.7)],
      origin: ORIGIN,
      theme,
      kit: null,
    });
    expect([r.full.ids, r.fitted.ids]).toEqual([['way/2'], []]);
  });
});

describe('toChunks', () => {
  it('groups buildings and extras by tile, including tiles with only trees', () => {
    const far = proj.toLngLat([5000, 5000]);
    const chunks = toChunks(
      [building('way/1', 'house', 10, 8)],
      [{ id: 'node/9', kind: 'tree', name: 'tree', position: far, z: 0, front: 0, scale: 1 }],
    );
    expect(chunks).toHaveLength(2);
    expect(chunks.find((c) => c.buildings.length)!.extras).toEqual([]);
    expect(chunks.find((c) => c.extras.length)!.buildings).toEqual([]);
    for (const c of chunks) {
      const [x, y] = parseChunkKey(c.key);
      expect(tileCenter(x, y)).toEqual(c.origin);
    }
  });
});

describe('chunk spheres and disposal', () => {
  it('encloses the whole tile plus a margin', () => {
    const frame = new SceneFrame(ORIGIN);
    const [x, y] = tileOf(ORIGIN);
    const s = chunkSphere(frame, [x, y, 15]);
    const [w, south, e, n] = tileBounds(x, y);
    for (const corner of [
      [w, south],
      [e, n],
      [w, n],
      [e, south],
    ] as LngLat[]) {
      expect(s.containsPoint(frame.toScene(corner))).toBe(true);
    }
  });

  it('frees only loaded chunks that are out of view and stale', () => {
    const chunks = [
      { key: 'a', state: 'ready', lastSeen: 0 },
      { key: 'b', state: 'ready', lastSeen: 9_000 },
      { key: 'c', state: 'ready', lastSeen: 0 },
      { key: 'd', state: 'loading', lastSeen: 0 },
    ];
    expect(chunksToDispose(chunks, new Set(['c']), 25_000, 20_000)).toEqual(['a']);
  });
});
