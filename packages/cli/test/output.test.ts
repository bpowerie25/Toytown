import { geojson } from 'flatgeobuf';
import { describe, expect, it } from 'vitest';
import { toFlatGeobuf } from '../src/output';
import type { ToyTownCollection } from 'toytown-gl';
import { renderReport } from '../src/report';

const fc: ToyTownCollection = {
  type: 'FeatureCollection',
  bbox: [0, 0, 1, 1],
  toytown: { version: 1, attribution: '© OpenStreetMap contributors', license: 'ODbL-1.0' },
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0]]] }, // prettier-ignore
      properties: {
        id: 'way/1',
        category: 'house',
        height: 7,
        levels: 2,
        orientation: 90,
        front: null,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0.5, 0.5] },
      properties: { id: 'node/2', category: 'tree', name: 'Old Oak' },
    },
  ],
};

describe('FlatGeobuf output', () => {
  it('round-trips with a fixed schema (-1 for unknown numbers, "" for no name)', async () => {
    const out = [];
    for await (const f of geojson.deserialize(toFlatGeobuf(fc)))
      out.push([f.geometry.type, f.properties]);
    expect(out).toEqual([
      [
        'Polygon',
        {
          id: 'way/1',
          category: 'house',
          height: 7,
          levels: 2,
          orientation: 90,
          front: -1,
          name: '',
        },
      ],
      [
        'Point',
        {
          id: 'node/2',
          category: 'tree',
          height: -1,
          levels: -1,
          orientation: -1,
          front: -1,
          name: 'Old Oak',
        },
      ],
    ]);
  });
});

describe('renderReport', () => {
  it('lists categories per town and unmapped combinations', () => {
    const stats = {
      bbox: [0, 0, 1, 1] as [number, number, number, number],
      buildings: 10,
      categories: { house: 7, generic: 3 },
      via: { tags: 5, heuristic: 2, fallback: 3 },
      withFront: 9,
      pois: { inBuildings: 1, standalone: 0 },
      trees: { osm: 1, scattered: 2 },
      areas: { park: 1 },
      unmapped: [{ tags: 'building=yes + man_made=silo', count: 3 }],
    };
    const md = renderReport([{ name: 'Testville', stats }]);
    expect(md).toContain('| `house` | 7 (70.0%) |');
    expect(md).toContain('## Testville: top 30 unmapped tag combinations');
    expect(md).toContain('| 1 | `building=yes + man_made=silo` | 3 |');
  });
});
