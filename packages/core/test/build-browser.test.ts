import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bboxAreaKm2, buildAreaData } from '../src/build/browser';
import { BBOX, nodes, relations, ways } from './build-fixtures';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../../../assets/models');
const tagMap: unknown = JSON.parse(readFileSync(join(ASSETS, 'tag-map.json'), 'utf8'));
const models = Object.keys(
  (JSON.parse(readFileSync(join(ASSETS, 'manifest.json'), 'utf8')) as { models: object }).models,
);

/** The fixtures as an Overpass JSON response. */
const overpassJson = JSON.stringify({
  osm3s: { timestamp_osm_base: '2026-10-01T00:00:00Z' },
  elements: [
    ...nodes.map((n) => ({
      type: 'node',
      id: n.id,
      lat: n.lat,
      lon: n.lon,
      ...(n.tags ? { tags: n.tags } : {}),
    })),
    ...ways.map((w) => ({
      type: 'way',
      id: w.id,
      nodes: w.refs,
      ...(w.tags ? { tags: w.tags } : {}),
    })),
    ...relations.map((r) => ({
      type: 'relation',
      id: r.id,
      members: r.members,
      ...(r.tags ? { tags: r.tags } : {}),
    })),
  ],
});

const fakeFetch = (calls: string[]) =>
  (async (url: string) => {
    calls.push(url);
    return url.endsWith('/status')
      ? new Response('1 slots available now.')
      : new Response(overpassJson);
  }) as typeof fetch;

describe('building an area in the browser', () => {
  it('measures a bbox in km²', () => {
    // 0.01° of longitude at 52°N is about 0.69 km, 0.01° of latitude about 1.11 km.
    expect(bboxAreaKm2([-7.11, 52.25, -7.1, 52.26])).toBeCloseTo(0.763, 2);
  });

  it('builds the same features as the CLI pipeline from an Overpass response', async () => {
    const calls: string[] = [];
    const data = await buildAreaData(BBOX, {
      tagMap,
      models,
      cacheDays: 0,
      fetch: fakeFetch(calls),
    });
    expect(calls.some((u) => u.endsWith('/interpreter'))).toBe(true);
    expect(data.type).toBe('FeatureCollection');
    const kinds = new Set(data.features.map((f) => f.geometry.type));
    expect(kinds.has('Polygon')).toBe(true);
    expect(data.features.some((f) => f.properties.category === 'park')).toBe(true);
  });

  it('refuses areas bigger than the limit, pointing at the CLI', async () => {
    await expect(
      buildAreaData([-7.2, 52.2, -7.0, 52.3], { tagMap, models, fetch: fakeFetch([]) }),
    ).rejects.toThrow(/km².*toytown\/cli/);
  });

  it('rejects a bbox that is not west, south, east, north', async () => {
    await expect(buildAreaData([-7, 52.3, -7.1, 52.2], { tagMap, models })).rejects.toThrow(
      /\[west, south, east, north\]/,
    );
  });
});
