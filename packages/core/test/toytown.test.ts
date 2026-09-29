import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LocalProjection, type LngLat } from '../src/geometry';
import { SceneFrame } from '../src/render/frame';
import { instanceMatrix, shouldDraw3D } from '../src/render/layer';
import { splitData } from '../src/toytown';

describe('splitData', () => {
  it('splits buildings, POI points and trees, and normalises polygons to parts', () => {
    const ring = [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0]]; // prettier-ignore
    const { buildings, points, trees } = splitData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: { id: 'way/1', category: 'house', height: 7, front: 90 },
        },
        {
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] },
          properties: { id: 'relation/2', category: 'school' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 2] },
          properties: { id: 'node/3', category: 'tree', height: 9 },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [3, 4] },
          properties: { id: 'node/4', category: 'pub', front: 45 },
        },
      ],
    });
    expect(buildings.map((b) => [b.id, b.parts.length, b.height, b.front])).toEqual([
      ['way/1', 1, 7, 90],
      ['relation/2', 2, 6, null],
    ]);
    expect(trees).toEqual([{ id: 'node/3', position: [1, 2], height: 9 }]);
    expect(points).toEqual([{ id: 'node/4', category: 'pub', position: [3, 4], front: 45 }]);
  });
});

describe('SceneFrame', () => {
  const origin: LngLat = [-7.11, 52.26];
  const frame = new SceneFrame(origin);
  const local = new LocalProjection(origin);

  it('puts the origin at 0 and measures metres east and north, matching LocalProjection', () => {
    expect(frame.toScene(origin).length()).toBeLessThan(1e-9);
    const p = frame.toScene(local.toLngLat([100, 200]), 5);
    // Same sphere as MapLibre: agrees with the local projection to centimetres.
    expect(p.x).toBeCloseTo(100, 1);
    expect(p.y).toBeCloseTo(200, 1);
    expect(p.z).toBeCloseTo(5, 3);
  });

  it('projects scene metres through the mercator matrix', () => {
    // With an identity mercator→clip matrix, scene (0,0,0) lands on the origin's mercator coordinates.
    const m = frame.projection(new Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)));
    const v = new Vector3(0, 0, 0).applyMatrix4(m);
    expect(v.x).toBeCloseTo(frame.merc[0], 12);
    expect(v.y).toBeCloseTo(frame.merc[1], 12);
  });
});

describe('instanceMatrix', () => {
  const origin: LngLat = [-7.11, 52.26];
  const frame = new SceneFrame(origin);
  // Loaded models face -Y (south). The instance's yaw must turn that to the placement's bearing.
  const facing = (front: number) => {
    const m = instanceMatrix(frame, {
      id: 'x',
      kind: 'model',
      name: 'house',
      position: origin,
      z: 0,
      front,
      scale: 1,
    });
    const d = new Vector3(0, -1, 0).transformDirection(m);
    return [d.x, d.y];
  };
  it.each([
    [0, [0, 1]], // north
    [90, [1, 0]], // east
    [180, [0, -1]], // south
    [270, [-1, 0]], // west
  ])('front %i° faces %j', (front, dir) => {
    const [x, y] = facing(front);
    expect(x).toBeCloseTo(dir[0]!, 6);
    expect(y).toBeCloseTo(dir[1]!, 6);
  });

  it('scales uniformly', () => {
    const m = instanceMatrix(frame, {
      id: 'x',
      kind: 'model',
      name: 'house',
      position: origin,
      z: 0,
      front: 0,
      scale: 1.5,
    });
    const s = new Vector3();
    m.decompose(new Vector3(), new Quaternion(), s);
    expect(s.x).toBeCloseTo(1.5, 6);
    expect(s.z).toBeCloseTo(1.5, 6);
  });
});

describe('shouldDraw3D', () => {
  it('draws in mercator and when globe has fully transitioned to mercator', () => {
    expect(shouldDraw3D(undefined)).toBe(true);
    expect(shouldDraw3D(0)).toBe(true);
    expect(shouldDraw3D(0.3)).toBe(false);
    expect(shouldDraw3D(1)).toBe(false);
  });
});
