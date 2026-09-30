import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  areaLayers,
  innerPoint,
  pitchMarkings,
  pitchStripes,
  planAreaProps,
  type AreaFeature,
} from '../src/areas';
import {
  LocalProjection,
  minRotatedRect,
  pointInPolygon,
  type LngLat,
  type XY,
} from '../src/geometry';
import { parseManifest } from '../src/manifest';
import { planKit } from '../src/placement';
import { areaStyleLayers } from '../src/render/area-style';
import { DEFAULT_THEME, NIGHT_THEME } from '../src/themes';
import { splitData } from '../src/toytown';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../../../assets/models');
const kit = planKit(parseManifest(JSON.parse(readFileSync(join(ASSETS, 'manifest.json'), 'utf8'))));

const origin: LngLat = [-7.1, 52.2];
const proj = new LocalProjection(origin);
/** A w × h rectangle in metres centred on the origin, turned `deg` counter-clockwise, as lng/lat. */
function rect(w: number, h: number, deg = 0): LngLat[] {
  const a = (deg * Math.PI) / 180;
  const pts: XY[] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
    [-w / 2, -h / 2],
  ];
  return pts.map(([x, y]) =>
    proj.toLngLat([x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]),
  );
}
const area = (category: string, ring: LngLat[], extra: Partial<AreaFeature> = {}): AreaFeature => ({
  id: `way/${category}`,
  category,
  kind: 'area',
  parts: [[ring]],
  ...extra,
});

describe('pitch geometry', () => {
  const r = minRotatedRect(rect(100, 64, 30).map((p) => proj.toXY(p)))!;

  it('marks a soccer pitch: outline, halfway line, boxes at both ends and a centre circle', () => {
    const lines = pitchMarkings(r, 'pitch_soccer');
    expect(lines).toHaveLength(2 + 4 + 1);
    // Every line stays on the pitch.
    const pitch = [rect(100.1, 64.1, 30).map((p) => proj.toXY(p))];
    for (const l of lines) for (const p of l) expect(pointInPolygon(p, pitch)).toBe(true);
  });

  it('marks a GAA pitch with 13, 20 and 45 m lines at each end', () => {
    expect(pitchMarkings(r, 'pitch_gaa')).toHaveLength(2 + 6 + 4 + 1);
  });

  it('gives courts just an outline and a centre line', () => {
    expect(pitchMarkings(r, 'pitch_court')).toHaveLength(2);
  });

  it('mows every other band across the length', () => {
    const s = pitchStripes(r, 12);
    expect(s).toHaveLength(6);
    for (const ring of s) expect(ring).toHaveLength(5);
  });

  it('finds a point well inside an L-shaped park', () => {
    const L: XY[] = [[0, 0], [100, 0], [100, 30], [30, 30], [30, 100], [0, 100], [0, 0]]; // prettier-ignore
    const p = innerPoint([L])!;
    expect(pointInPolygon(p.point, [L])).toBe(true);
    expect(p.clearance).toBeGreaterThan(10);
  });
});

describe('areaLayers', () => {
  const layers = areaLayers([
    area('pitch_soccer', rect(100, 64), { name: 'Walsh Park' }),
    area('park', rect(200, 150), { name: "People's Park" }),
    area('grass', rect(20, 10)),
    { id: 'way/9', category: 'track', kind: 'track', parts: [[rect(80, 40)]] },
  ]);

  it('passes areas through as polygons and tracks as lines', () => {
    expect(layers.areas.features.map((f) => f.geometry.type)).toEqual([
      'Polygon',
      'Polygon',
      'Polygon',
      'LineString',
    ]);
  });

  it('stripes and marks pitches only', () => {
    expect(new Set(layers.stripes.features.map((f) => f.properties.category))).toEqual(
      new Set(['pitch_soccer']),
    );
    expect(layers.markings.features.length).toBeGreaterThan(5);
  });

  it('labels named areas once each', () => {
    expect(layers.labels.features.map((f) => f.properties.name)).toEqual([
      'Walsh Park',
      "People's Park",
    ]);
  });

  it('skips markings on shapes that are far from rectangular', () => {
    const tri: LngLat[] = [[0, 0], [100, 0], [0, 60], [0, 0]].map((p) => proj.toLngLat(p as XY)); // prettier-ignore
    expect(areaLayers([area('pitch', tri)]).markings.features).toHaveLength(0);
  });
});

describe('planAreaProps', () => {
  it('puts a goal at each end of a soccer pitch, facing in', () => {
    const out = planAreaProps([area('pitch_soccer', rect(100, 64))], kit);
    expect(out.map((p) => p.name)).toEqual(['goal_soccer', 'goal_soccer']);
    const [a, b] = out.map((p) => proj.toXY(p.position));
    expect(Math.abs(a![0])).toBeCloseTo(48, 0);
    expect(Math.abs(a![1])).toBeLessThan(0.5);
    // The one at the west end faces east (90°), the east one faces west (270°).
    const west = a![0] < b![0] ? out[0]! : out[1]!;
    expect(west.front).toBeCloseTo(90, 5);
    expect(out[0]!.scale).toBe(out[1]!.scale);
  });

  it('uses GAA posts on GAA pitches and shrinks them on small pitches', () => {
    const big = planAreaProps([area('pitch_gaa', rect(140, 85))], kit);
    const small = planAreaProps([area('pitch_gaa', rect(40, 25))], kit);
    expect(big[0]!.name).toBe('posts_gaa');
    expect(small[0]!.scale).toBeLessThan(big[0]!.scale);
  });

  it('puts a playset in a playground big enough for it', () => {
    expect(planAreaProps([area('playground', rect(30, 25))], kit).map((p) => p.name)).toEqual([
      'playset',
    ]);
    expect(planAreaProps([area('playground', rect(5, 4))], kit)).toHaveLength(0);
  });

  it('adds nothing to parks, courts or tracks', () => {
    expect(
      planAreaProps([area('park', rect(200, 150)), area('pitch_court', rect(24, 11))], kit),
    ).toHaveLength(0);
  });
});

describe('area style', () => {
  it('colours every category in the tag map from the theme, with exact hex', () => {
    const tagMap = JSON.parse(readFileSync(join(ASSETS, 'tag-map.json'), 'utf8')) as {
      areas: { category: string }[];
    };
    for (const theme of [DEFAULT_THEME, NIGHT_THEME]) {
      for (const r of tagMap.areas) expect(theme.areas!.fill).toHaveProperty(r.category);
      for (const v of [...Object.values(theme.areas!.fill), theme.areas!.markings])
        expect(v).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('falls back to the default area colours for themes without them', () => {
    const bare = { ...DEFAULT_THEME, areas: undefined };
    const { under } = areaStyleLayers('toytown', bare);
    expect(JSON.stringify(under)).toContain(DEFAULT_THEME.areas!.fill.park);
  });
});

describe('splitData', () => {
  it('keeps areas and tracks out of the buildings', () => {
    const split = splitData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [rect(10, 8)] },
          properties: { id: 'way/1', category: 'house', height: 6 },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [rect(100, 60)] },
          properties: { id: 'way/2', category: 'park', kind: 'area', name: 'Green Park' },
        },
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: rect(80, 40) },
          properties: { id: 'way/3', category: 'track', kind: 'track' },
        },
      ],
    });
    expect(split.buildings.map((b) => b.id)).toEqual(['way/1']);
    expect(split.areas.map((a) => [a.id, a.kind, a.name])).toEqual([
      ['way/2', 'area', 'Green Park'],
      ['way/3', 'track', undefined],
    ]);
  });
});
