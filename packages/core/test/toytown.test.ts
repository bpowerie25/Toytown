import { describe, expect, it } from 'vitest';
import { toBuildings } from '../src/toytown';

describe('toBuildings', () => {
  it('keeps polygons, normalises Polygon to parts, and skips points', () => {
    const ring = [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0]]; // prettier-ignore
    const out = toBuildings({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: { id: 'way/1', category: 'house', height: 7 },
        },
        {
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] },
          properties: { id: 'relation/2', category: 'school' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { id: 'node/3', category: 'tree' },
        },
      ],
    });
    expect(out.map((b) => [b.id, b.parts.length, b.height])).toEqual([
      ['way/1', 1, 7],
      ['relation/2', 2, 6], // default height when missing
    ]);
  });
});
