import { describe, expect, it, vi } from 'vitest';
import {
  BASE_BUILDING_LAYER_ID,
  setBaseBuildingsVisible,
  toytownStyle,
  type LayerHost,
} from '../src/style';

/** The phase 1 palette from PLAN.md. These must stay exact. */
const PLAN_PALETTE = {
  land: '#F4EBD0',
  water: '#7EC8E3',
  grass: '#A8D5A2',
  wood: '#6BAA5E',
  sand: '#F6E3B4',
  road: '#FFFFFF',
  road_casing: '#D9C9A3',
  major_road: '#FFE8A3',
  major_road_casing: '#E0B85C',
  rail: '#B8B2A7',
  label: '#2B2D42',
  label_halo: '#FFFFFF',
};

const style = toytownStyle();
const layer = (id: string) => style.layers.find((l) => l.id === id)!;
const paint = (id: string) => (layer(id) as { paint: Record<string, unknown> }).paint;

/** Every string value anywhere in the style that looks like a colour. */
function colours(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string' && /^(#|rgb|hsl)/i.test(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => colours(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => colours(v, out));
  return out;
}

describe('toytown style', () => {
  it('is a MapLibre v8 style over an OpenMapTiles-schema source', () => {
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toEqual(['openmaptiles']);
    expect(new Set(style.layers.map((l) => l.id)).size).toBe(style.layers.length);
  });

  it('carries the exact phase 1 palette', () => {
    const palette = (style.metadata as Record<string, Record<string, string>>)['toytown:palette'];
    expect(palette).toMatchObject(PLAN_PALETTE);
  });

  it('only uses exact hex colours from its palette', () => {
    const palette = new Set(
      Object.values((style.metadata as Record<string, Record<string, string>>)['toytown:palette']!),
    );
    const used = colours(style.layers);
    expect(used.length).toBeGreaterThan(10);
    for (const c of used) {
      expect(c).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.has(c), c).toBe(true);
    }
  });

  it('paints the key features in the planned colours', () => {
    expect(paint('background')['background-color']).toBe(PLAN_PALETTE.land);
    expect(paint('water')['fill-color']).toBe(PLAN_PALETTE.water);
    expect(paint('landcover-grass')['fill-color']).toBe(PLAN_PALETTE.grass);
    expect(paint('landcover-wood')['fill-color']).toBe(PLAN_PALETTE.wood);
    expect(paint('landcover-sand')['fill-color']).toBe(PLAN_PALETTE.sand);
    expect(paint('road-minor')['line-color']).toBe(PLAN_PALETTE.road);
    expect(paint('road-minor-casing')['line-color']).toBe(PLAN_PALETTE.road_casing);
    expect(paint('road-major')['line-color']).toBe(PLAN_PALETTE.major_road);
    expect(paint('road-major-casing')['line-color']).toBe(PLAN_PALETTE.major_road_casing);
    expect(paint('rail')['line-color']).toBe(PLAN_PALETTE.rail);
    for (const l of style.layers.filter((l) => l.type === 'symbol')) {
      expect(paint(l.id)['text-color']).toBe(PLAN_PALETTE.label);
      expect(paint(l.id)['text-halo-color']).toBe(PLAN_PALETTE.label_halo);
    }
  });

  it('uses round caps and joins on every road, rail and waterway line', () => {
    for (const l of style.layers.filter((l) => l.type === 'line' && l.id !== 'rail-sleepers')) {
      expect(l.layout, l.id).toMatchObject({ 'line-cap': 'round', 'line-join': 'round' });
    }
  });

  it('draws road casings wider than their fills at every zoom stop', () => {
    for (const id of ['road-major', 'road-minor', 'road-service']) {
      const fill = paint(id)['line-width'] as unknown[];
      const casing = paint(`${id}-casing`)['line-width'] as unknown[];
      const stops = (e: unknown[]) =>
        new Map(
          e
            .slice(3)
            .reduce<[number, number][]>(
              (acc, v, i, a) => (i % 2 ? acc : [...acc, [v as number, a[i + 1] as number]]),
              [],
            ),
        );
      const f = stops(fill);
      for (const [z, w] of stops(casing)) expect(w, `${id} z${z}`).toBeGreaterThan(f.get(z) ?? 0);
    }
  });

  it('labels only towns, major roads and water bodies, in Nunito', () => {
    const symbols = style.layers.filter((l) => l.type === 'symbol');
    expect(symbols.map((l) => l.id).sort()).toEqual([
      'label-place',
      'label-road-major',
      'label-water-line',
      'label-water-point',
      'label-waterway',
    ]);
    for (const l of symbols) {
      const font = (l.layout as Record<string, string[]>)['text-font']!;
      expect(font[0]).toMatch(/^nunito_/);
    }
    expect(style.glyphs).toContain('{fontstack}');
  });

  it('attributes OpenStreetMap contributors', () => {
    expect(JSON.stringify(style.sources)).toContain('&copy; OpenStreetMap contributors');
  });

  it('has a base building layer that can be hidden', () => {
    expect(layer(BASE_BUILDING_LAYER_ID).type).toBe('fill');
  });
});

describe('toytownStyle options', () => {
  it('returns an independent copy each time', () => {
    const a = toytownStyle();
    a.layers.pop();
    expect(toytownStyle().layers.length).toBe(style.layers.length);
  });

  it('accepts a TileJSON URL', () => {
    const s = toytownStyle({ tiles: 'https://example.com/tiles.json' });
    expect(s.sources.openmaptiles).toMatchObject({ url: 'https://example.com/tiles.json' });
  });

  it('accepts tile URL templates', () => {
    const s = toytownStyle({ tiles: ['https://example.com/{z}/{x}/{y}.pbf'], maxzoom: 15 });
    expect(s.sources.openmaptiles).toMatchObject({
      tiles: ['https://example.com/{z}/{x}/{y}.pbf'],
      maxzoom: 15,
    });
    expect(s.sources.openmaptiles).not.toHaveProperty('url');
  });

  it('overrides glyphs', () => {
    expect(toytownStyle({ glyphs: '/fonts/{fontstack}/{range}.pbf' }).glyphs).toBe(
      '/fonts/{fontstack}/{range}.pbf',
    );
  });

  it('always keeps OpenStreetMap attribution', () => {
    const attr = (s: ReturnType<typeof toytownStyle>) =>
      (s.sources.openmaptiles as { attribution: string }).attribution;
    expect(attr(toytownStyle({ attribution: 'My tiles' }))).toBe(
      'My tiles &copy; OpenStreetMap contributors',
    );
    expect(attr(toytownStyle({ attribution: '© OpenStreetMap contributors' }))).toBe(
      '© OpenStreetMap contributors',
    );
  });
});

describe('setBaseBuildingsVisible', () => {
  const host = (hasLayer: boolean) => ({
    getLayer: (id: string) => (hasLayer && id === BASE_BUILDING_LAYER_ID ? {} : undefined),
    setLayoutProperty: vi.fn<LayerHost['setLayoutProperty']>(),
  });

  it('toggles layer visibility', () => {
    const map = host(true);
    setBaseBuildingsVisible(map, false);
    setBaseBuildingsVisible(map, true);
    expect(map.setLayoutProperty.mock.calls).toEqual([
      [BASE_BUILDING_LAYER_ID, 'visibility', 'none'],
      [BASE_BUILDING_LAYER_ID, 'visibility', 'visible'],
    ]);
  });

  it('does nothing when the style has no base building layer', () => {
    const map = host(false);
    setBaseBuildingsVisible(map, false);
    expect(map.setLayoutProperty).not.toHaveBeenCalled();
  });
});
