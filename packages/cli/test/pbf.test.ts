import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPbf } from '../src/pbf';
import { BBOX, nodes, relations, ways } from './fixtures';
import { encodePbf } from './pbf-writer';

describe('readPbf', () => {
  const dir = mkdtempSync(join(tmpdir(), 'toytown-pbf-'));
  const file = join(dir, 'town.osm.pbf');
  writeFileSync(file, encodePbf(nodes, ways, relations, 1_790_000_000));
  const data = readPbf(file, { bbox: BBOX });

  it('reads the header timestamp', () => {
    expect(data.timestamp).toBe(new Date(1_790_000_000_000).toISOString().replace('.000Z', 'Z'));
  });

  it('reads dense node coordinates to 1e-7 degrees', () => {
    for (const n of nodes) {
      const got = data.nodes.get(n.id)!;
      expect(got.lon).toBeCloseTo(n.lon, 7);
      expect(got.lat).toBeCloseTo(n.lat, 7);
    }
  });

  it('keeps tags only on POI and tree nodes', () => {
    const tagged = [...data.nodes.values()]
      .filter((n) => n.tags)
      .map((n) => n.tags!.amenity ?? n.tags!.natural);
    expect(tagged.sort()).toEqual(['cafe', 'pub', 'tree']);
  });

  it('reads ways with delta-decoded refs and tags', () => {
    const { refs, tags } = ways.find((w) => w.id === 100)!;
    expect(data.ways.get(100)).toEqual({ refs, tags });
    expect(data.ways.get(401)!.refs).toEqual(ways.find((w) => w.id === 401)!.refs);
  });

  it('reads building multipolygon relations with roles', () => {
    const { members, tags } = relations[0]!;
    expect(data.relations.get(500)).toEqual({ members, tags });
  });

  it('drops everything outside the bbox and margin', () => {
    const far = readPbf(file, { bbox: [10, 10, 10.1, 10.1], margin: 0 });
    expect([far.nodes.size, far.ways.size, far.relations.size]).toEqual([0, 0, 0]);
  });
});
