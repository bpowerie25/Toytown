import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyArea, createClassifier, parseTagMap } from '../src/classify';
import { describe, expect, it } from 'vitest';
import type { OsmData } from '../src/build/osm';
import { buildData, type BuildingProps, type PointProps } from '../src/build/pipeline';
import { BBOX, nodes, relations, ways } from './build-fixtures';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../../../assets/models');
const tagMap = parseTagMap(JSON.parse(readFileSync(join(ASSETS, 'tag-map.json'), 'utf8')));

const osm = (): OsmData => ({
  nodes: new Map(nodes.map((n) => [n.id, { lon: n.lon, lat: n.lat, tags: n.tags }])),
  ways: new Map(ways.map((w) => [w.id, { refs: w.refs, tags: w.tags }])),
  relations: new Map(relations.map((r) => [r.id, { members: r.members, tags: r.tags }])),
  timestamp: '2026-09-29T00:00:00Z',
});
const areaOpts = {
  classifyArea: (t: Record<string, string>) => classifyArea(tagMap, t),
  areaTrees: tagMap.spec.areaTrees ?? {},
};
const run = (seed = 1) =>
  buildData(osm(), {
    bbox: BBOX,
    classify: createClassifier(tagMap),
    fallback: 'generic',
    trees: { seed },
    ...areaOpts,
  });

const { collection, stats } = run();
const byId = (id: string) => collection.features.find((f) => f.properties.id === id)!;
const props = (id: string) => byId(id).properties as BuildingProps;

describe('buildData', () => {
  it('classifies buildings by their own tags, POIs inside, and weak rules', () => {
    expect(props('way/100').category).toBe('house');
    expect(props('way/101').category).toBe('cafe');
    expect(props('way/102').category).toBe('generic');
    expect(props('relation/500').category).toBe('school');
    expect(stats.via).toMatchObject({ tags: 3, poi: 1 });
  });

  it('keeps names and computes heights', () => {
    expect(props('way/100')).toMatchObject({ name: 'Rose Cottage', height: 7, levels: 2 });
    expect(props('relation/500').name).toBe('Scoil Test');
  });

  it('assembles multipolygon buildings with their holes', () => {
    const g = byId('relation/500').geometry;
    expect(g.type).toBe('Polygon');
    expect((g as { coordinates: unknown[] }).coordinates).toHaveLength(2);
  });

  it('computes orientation from the minimum rotated rectangle', () => {
    expect(props('way/100').orientation).toBe(90); // 10×8, long side east-west
    expect(props('way/101').orientation).toBe(0); // 8×12, long side north-south
  });

  it('faces buildings toward the nearest street, preferring streets over footpaths', () => {
    // Main Street is to the north; the footway just south is closer but minor.
    expect(props('way/100').front).toBe(0);
    expect(stats.withFront).toBe(4);
  });

  it('writes standalone POIs that map to a model as points', () => {
    const pub = byId('node/' + nodes.find((n) => n.tags?.amenity === 'pub')!.id);
    expect(pub.geometry.type).toBe('Point');
    // The pub is at (-30, 40); the nearest street (y = 20) is due south of it.
    expect(pub.properties).toMatchObject({ category: 'pub', name: 'Lonely Pub', front: 180 });
    expect(stats.pois).toEqual({ inBuildings: 1, standalone: 1 });
  });

  it('exports mapped trees and scatters trees in parks, inside the park and off buildings', () => {
    const trees = collection.features.filter((f) => f.properties.category === 'tree');
    const mapped = trees.filter((t) => t.properties.id.startsWith('node/'));
    expect(mapped).toHaveLength(1);
    expect((mapped[0]!.properties as PointProps).height).toBe(9);
    const scattered = trees.filter((t) => t.properties.id.startsWith('scatter/'));
    expect(scattered.length).toBe(stats.trees.scattered);
    expect(scattered.length).toBeGreaterThan(3); // 2400 m² / 350 m² ≈ 6
    expect(scattered.length).toBeLessThanOrEqual(6);
    const M = 1 / 111_320;
    for (const t of scattered) {
      const [lon, lat] = (t.geometry as { coordinates: [number, number] }).coordinates;
      expect(lon / M).toBeGreaterThan(0);
      expect(lon / M).toBeLessThan(60);
      expect(lat / M).toBeGreaterThan(30);
      expect(lat / M).toBeLessThan(70);
    }
  });

  it('is deterministic for a seed, and varies with it', () => {
    expect(JSON.stringify(run(1).collection)).toBe(JSON.stringify(collection));
    expect(JSON.stringify(run(2).collection)).not.toBe(JSON.stringify(collection));
  });

  it('drops buildings whose centroid is outside the bbox', () => {
    const M = 1 / 111_320;
    const small = buildData(osm(), {
      bbox: [-60 * M, -20 * M, 15 * M, 90 * M],
      classify: createClassifier(tagMap),
      fallback: 'generic',
    });
    const ids = small.collection.features
      .filter((f) => f.geometry.type !== 'Point')
      .map((f) => f.properties.id);
    expect(ids).toEqual(['way/100']);
  });

  it('carries OSM attribution and licence', () => {
    expect(collection.toytown).toEqual({
      version: 1,
      osm_timestamp: '2026-09-29T00:00:00Z',
      attribution: '© OpenStreetMap contributors',
      license: 'ODbL-1.0',
    });
  });

  it('writes GeoJSON-winding polygons with 6-decimal coordinates', () => {
    const ring = (byId('way/100').geometry as { coordinates: [number, number][][] })
      .coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [x, y] of ring) {
      expect(Math.round(x * 1e6) / 1e6).toBe(x);
      expect(Math.round(y * 1e6) / 1e6).toBe(y);
    }
  });

  it('exports open spaces with their category, name and sport, and tracks as lines', () => {
    expect(byId('way/300')).toMatchObject({
      geometry: { type: 'Polygon' },
      properties: { category: 'park', kind: 'area', name: 'Green Park' },
    });
    expect(byId('way/301').properties).toMatchObject({
      category: 'pitch_gaa',
      kind: 'area',
      sport: 'gaelic_games',
    });
    expect(byId('way/302')).toMatchObject({
      geometry: { type: 'LineString' },
      properties: { category: 'track', kind: 'track' },
    });
    expect(stats.areas).toEqual({ park: 1, pitch_gaa: 1, track: 1 });
  });

  it('scatters trees only in area categories with a tree density (not on pitches)', () => {
    const trees = collection.features.filter((f) => f.properties.id.startsWith('scatter/'));
    expect(trees.every((t) => t.properties.id.startsWith('scatter/way/300/'))).toBe(true);
  });

  it('reports unmapped tag combinations', () => {
    const extra = osm();
    extra.ways.set(900, {
      refs: ways.find((w) => w.id === 102)!.refs,
      tags: { building: 'yes', man_made: 'silo' },
    });
    extra.ways.delete(102);
    const s = buildData(extra, {
      bbox: BBOX,
      classify: createClassifier(tagMap),
      fallback: 'generic',
    }).stats;
    expect(s.unmapped).toEqual([{ tags: 'building=yes + man_made=silo', count: 1 }]);
  });
});
