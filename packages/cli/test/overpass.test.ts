import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fromOverpassJson } from '../src/osm';
import { fetchOverpass, overpassQuery, slotWaitSeconds } from '../src/overpass';

const response = {
  osm3s: { timestamp_osm_base: '2026-09-29T08:00:00Z' },
  elements: [
    { type: 'node', id: 1, lat: 52.1, lon: -7.1 },
    { type: 'node', id: 2, lat: 52.1, lon: -7.0, tags: { amenity: 'cafe' } },
    { type: 'way', id: 10, nodes: [1, 2, 1], tags: { building: 'yes' } },
    {
      type: 'relation',
      id: 20,
      members: [{ type: 'way', ref: 10, role: 'outer' }],
      tags: { type: 'multipolygon' },
    },
    // The same node again from "out skel" (no tags) must not wipe tags from "out body".
    { type: 'node', id: 2, lat: 52.1, lon: -7.0 },
  ],
};

describe('overpass', () => {
  it('puts the bbox in Overpass order (south, west, north, east)', () => {
    expect(overpassQuery([-7.2, 52.1, -7.0, 52.3])).toContain('[bbox:52.1,-7.2,52.3,-7]');
  });

  it('queries buildings, multipolygons, streets, POIs, trees and green areas', () => {
    const q = overpassQuery([0, 0, 1, 1]);
    for (const s of [
      'way[building]',
      'relation[building]',
      'way[highway]',
      'node[amenity]',
      'node[craft]',
      'node[natural=tree]',
      'way[leisure=park]',
      'way[landuse=grass]',
    ]) {
      expect(q).toContain(s);
    }
  });

  it('parses slot waits from /api/status', () => {
    expect(slotWaitSeconds('Rate limit: 2\n2 slots available now.')).toBe(0);
    expect(
      slotWaitSeconds(
        'Slot available after: 2026-09-29T10:00:05Z, in 5 seconds.\nSlot available after: …, in 12 seconds.',
      ),
    ).toBe(5);
  });

  it('parses Overpass JSON', () => {
    const d = fromOverpassJson(response);
    expect(d.timestamp).toBe('2026-09-29T08:00:00Z');
    expect(d.nodes.get(2)!.tags).toEqual({ amenity: 'cafe' });
    expect(d.ways.get(10)!.refs).toEqual([1, 2, 1]);
    expect(d.relations.get(20)!.members[0]).toEqual({ type: 'way', ref: 10, role: 'outer' });
  });

  it('waits for a slot, retries on 429, and caches the response', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'toytown-overpass-'));
    const sleep = vi.fn(async () => {});
    const calls: string[] = [];
    let posts = 0;
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      if (url.endsWith('/status')) return new Response('Slot available after: x, in 3 seconds.');
      posts++;
      return posts === 1
        ? new Response('busy', { status: 429 })
        : new Response(JSON.stringify(response));
    }) as typeof fetch;

    const d = await fetchOverpass([0, 0, 1, 1], { cacheDir, fetch: fakeFetch, sleep });
    expect(d.ways.size).toBe(1);
    expect(posts).toBe(2);
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(sleep).toHaveBeenCalledWith(15000);

    const again = await fetchOverpass([0, 0, 1, 1], { cacheDir, fetch: fakeFetch, sleep });
    expect(again.ways.size).toBe(1);
    expect(posts).toBe(2); // served from cache
  });

  it('surfaces Overpass runtime errors instead of caching them', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'toytown-overpass-'));
    const fakeFetch = (async (url: string) =>
      url.endsWith('/status')
        ? new Response('1 slots available now.')
        : new Response(
            JSON.stringify({ elements: [], remark: 'runtime error: Query timed out' }),
          )) as typeof fetch;
    await expect(fetchOverpass([0, 0, 1, 1], { cacheDir, fetch: fakeFetch })).rejects.toThrow(
      /timed out/,
    );
  });
});
