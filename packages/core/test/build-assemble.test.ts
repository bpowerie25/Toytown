import { describe, expect, it } from 'vitest';
import { joinRings, relationPolygons, rewind, wayPolygon } from '../src/build/assemble';
import type { OsmData } from '../src/build/osm';

const data = (coords: Record<number, [number, number]>): OsmData => ({
  nodes: new Map(Object.entries(coords).map(([id, [lon, lat]]) => [Number(id), { lon, lat }])),
  ways: new Map(),
  relations: new Map(),
});

describe('joinRings', () => {
  it('joins split and reversed ways into closed rings', () => {
    expect(
      joinRings([
        [1, 2, 3],
        [5, 4, 3],
        [5, 1],
      ]),
    ).toEqual([[1, 2, 3, 4, 5, 1]]);
  });
  it('keeps already-closed ways', () => {
    expect(joinRings([[1, 2, 3, 1]])).toEqual([[1, 2, 3, 1]]);
  });
  it('drops pieces that never close', () => {
    expect(
      joinRings([
        [1, 2, 3],
        [7, 8, 9, 7],
      ]),
    ).toEqual([[7, 8, 9, 7]]);
  });
});

describe('polygons', () => {
  const d = data({
    1: [0, 0],
    2: [1, 0],
    3: [1, 1],
    4: [0, 1],
    5: [0.4, 0.4],
    6: [0.6, 0.4],
    7: [0.6, 0.6],
    8: [0.4, 0.6],
  });

  it('builds a polygon from a closed way, and rejects open ways', () => {
    expect(wayPolygon([1, 2, 3, 4, 1], d)).toHaveLength(1);
    expect(wayPolygon([1, 2, 3, 4], d)).toBeNull();
    expect(wayPolygon([1, 2, 99, 1], d)).toBeNull();
  });

  it('assembles a multipolygon with a hole', () => {
    d.ways.set(10, { refs: [1, 2, 3] });
    d.ways.set(11, { refs: [3, 4, 1] });
    d.ways.set(12, { refs: [5, 6, 7, 8, 5] });
    const polys = relationPolygons(
      {
        members: [
          { type: 'way', ref: 10, role: 'outer' },
          { type: 'way', ref: 11, role: 'outer' },
          { type: 'way', ref: 12, role: 'inner' },
        ],
      },
      d,
    )!;
    expect(polys).toHaveLength(1);
    expect(polys[0]).toHaveLength(2);
  });

  it('skips relations with missing member ways', () => {
    expect(relationPolygons({ members: [{ type: 'way', ref: 999, role: 'outer' }] }, d)).toBeNull();
  });

  it('rewinds to RFC 7946 (outer CCW, holes CW)', () => {
    const cw: [number, number][] = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    const [outer, hole] = rewind([cw, [...cw].reverse()]);
    expect(outer).toEqual([...cw].reverse());
    expect(hole).toEqual(cw);
  });
});
