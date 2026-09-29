import { describe, expect, it } from 'vitest';
import {
  LocalProjection,
  angleToBearing,
  centroid,
  closestOnSegment,
  convexHull,
  minRotatedRect,
  orientation,
  pointInPolygon,
  polygonArea,
  rectangularity,
  signedArea,
  snapFront,
  type XY,
} from '../src/geometry';

/** Axis-aligned w×h rectangle centred on (cx, cy), rotated by `deg` counter-clockwise. */
function rect(w: number, h: number, deg = 0, cx = 0, cy = 0): XY[] {
  const t = (deg * Math.PI) / 180;
  return (
    [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ] as XY[]
  ).map(([x, y]) => [
    cx + x * Math.cos(t) - y * Math.sin(t),
    cy + x * Math.sin(t) + y * Math.cos(t),
  ]);
}

describe('LocalProjection', () => {
  it('round-trips and measures roughly a metre per metre', () => {
    const p = new LocalProjection([-7.11, 52.26]);
    const [x, y] = p.toXY([-7.1, 52.27]);
    expect(x).toBeCloseTo(0.01 * 111_320 * Math.cos((52.26 * Math.PI) / 180), 3);
    expect(y).toBeCloseTo(1105.74, 2);
    const back = p.toLngLat([x, y]);
    expect(back[0]).toBeCloseTo(-7.1, 10);
    expect(back[1]).toBeCloseTo(52.27, 10);
  });
});

describe('polygon basics', () => {
  it('computes signed area, area with holes and centroid', () => {
    const outer = rect(10, 4);
    expect(signedArea(outer)).toBeCloseTo(40);
    expect(signedArea([...outer].reverse())).toBeCloseTo(-40);
    expect(polygonArea([outer, rect(2, 2)])).toBeCloseTo(36);
    expect(centroid(rect(10, 4, 0, 5, 7))).toEqual([expect.closeTo(5), expect.closeTo(7)]);
  });

  it('treats an explicitly closed ring the same as an open one', () => {
    const r = rect(10, 4);
    expect(signedArea([...r, r[0]!])).toBeCloseTo(40);
  });

  it('tests points against polygons with holes', () => {
    const donut = [rect(10, 10), rect(4, 4)];
    expect(pointInPolygon([4, 4], donut)).toBe(true);
    expect(pointInPolygon([0, 0], donut)).toBe(false);
    expect(pointInPolygon([6, 0], donut)).toBe(false);
  });

  it('finds the closest point on a segment', () => {
    expect(closestOnSegment([5, 5], [0, 0], [10, 0])).toEqual({ point: [5, 0], dist2: 25 });
    expect(closestOnSegment([-3, 4], [0, 0], [10, 0])).toEqual({ point: [0, 0], dist2: 25 });
  });

  it('builds a convex hull', () => {
    const pts: XY[] = [...rect(4, 4), [0, 0], [1, 0.5], [-1, 1]];
    expect(convexHull(pts)).toHaveLength(4);
  });
});

describe('minRotatedRect (rectangle fitting)', () => {
  it.each([0, 17, 45, 90, 123, 179])('fits a 20×8 rectangle rotated by %i°', (deg) => {
    const r = minRotatedRect(rect(20, 8, deg, 3, -2))!;
    expect(r.length).toBeCloseTo(20, 6);
    expect(r.width).toBeCloseTo(8, 6);
    expect(r.area).toBeCloseTo(160, 6);
    expect(r.center[0]).toBeCloseTo(3, 6);
    expect(r.center[1]).toBeCloseTo(-2, 6);
    expect((r.angle * 180) / Math.PI).toBeCloseTo(deg % 180, 6);
  });

  it('fits an L-shaped footprint by its bounding rectangle', () => {
    const L: XY[] = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ];
    const r = minRotatedRect(L)!;
    expect(r.area).toBeCloseTo(100);
    expect(rectangularity([L])).toBeCloseTo(0.64);
  });

  it('finds the tighter diagonal fit for a rotated shape with extra vertices', () => {
    // A 30×10 rectangle at 30° with midpoints added on each side.
    const base = rect(30, 10, 30);
    const withMids = base.flatMap((p, i) => {
      const q = base[(i + 1) % 4]!;
      return [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as XY];
    });
    const r = minRotatedRect(withMids)!;
    expect(r.area).toBeCloseTo(300, 6);
    expect(rectangularity([withMids])).toBeCloseTo(1, 6);
  });

  it('returns null for degenerate input', () => {
    expect(minRotatedRect([[0, 0], [1, 1], [2, 2]])).toBeNull(); // prettier-ignore
    expect(minRotatedRect([])).toBeNull();
  });
});

describe('orientation', () => {
  it('converts math angles to compass bearings', () => {
    expect(angleToBearing(0)).toBe(90); // east
    expect(angleToBearing(Math.PI / 2)).toBe(0); // north
    expect(angleToBearing(Math.PI)).toBe(270);
  });

  it.each([
    [0, 90], // long side east-west
    [90, 0], // long side north-south
    [30, 60],
    [135, 135],
    [150, 120],
  ])('a footprint rotated %i° CCW has bearing %i°', (deg, bearing) => {
    expect(orientation(rect(20, 8, deg))).toBeCloseTo(bearing, 5);
  });

  it('is always in [0, 180)', () => {
    for (let deg = 0; deg < 360; deg += 7) {
      const o = orientation(rect(20, 8, deg))!;
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(180);
    }
  });
});

describe('snapFront', () => {
  it('snaps the street direction onto the nearest footprint side', () => {
    expect(snapFront(10, 90)).toBe(0);
    expect(snapFront(100, 90)).toBe(90);
    expect(snapFront(200, 30)).toBe(210);
    expect(snapFront(350, 30)).toBe(30);
    expect(snapFront(340, 30)).toBe(300);
    expect(snapFront(359, 0)).toBe(0);
  });
});
