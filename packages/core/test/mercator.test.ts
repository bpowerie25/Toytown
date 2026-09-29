import { describe, expect, it } from 'vitest';
import { mercatorPerMetre, toMercator } from '../src/geometry';

describe('mercator', () => {
  it('maps the origin, antimeridian and poles-ish like MapLibre', () => {
    expect(toMercator([0, 0])).toEqual([0.5, 0.5]);
    expect(toMercator([-180, 0])[0]).toBe(0);
    expect(toMercator([180, 0])[0]).toBe(1);
    expect(toMercator([0, 85.051129])[1]).toBeCloseTo(0, 6);
  });

  it('matches an independent calculation for Waterford', () => {
    // Independently computed in Python with the same formula MapLibre uses.
    const [x, y] = toMercator([-7.11, 52.26]);
    expect(x).toBeCloseTo(0.48025, 7);
    expect(y).toBeCloseTo(0.3291386, 6);
  });

  it('gives mercator units per metre, shrinking the equator scale by cos(lat)', () => {
    expect(mercatorPerMetre(0)).toBeCloseTo(1 / 40075016.686, 15);
    expect(mercatorPerMetre(60) / mercatorPerMetre(0)).toBeCloseTo(2, 10);
  });
});
