import type { StyleSpecification } from 'maplibre-gl';
import { resolveTheme, type Theme } from '../themes';
import toytown from './toytown.json';

/** Id of the flat 2D building layer in the toy-town style. Hidden while the 3D layer is active. */
export const BASE_BUILDING_LAYER_ID = 'toytown-base-buildings';

export interface StyleOptions {
  /**
   * Vector tiles in the OpenMapTiles schema: either a TileJSON URL, or an array of
   * `{z}/{x}/{y}` tile URL templates. Defaults to OpenFreeMap (no API key).
   */
  tiles?: string | string[];
  /** Max zoom of the tiles, when `tiles` is an array of templates. Defaults to 14. */
  maxzoom?: number;
  /** Glyph URL template with `{fontstack}` and `{range}`. The style uses `nunito_bold` and `nunito_extrabold`. */
  glyphs?: string;
  /**
   * Source attribution HTML. Must keep "© OpenStreetMap contributors" (ODbL); this is enforced.
   */
  attribution?: string;
  /** Recolour the base map with a theme's `style` palette: a built-in name (`night`) or a theme. */
  theme?: string | Theme;
}

const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';

/** Returns a fresh copy of the toy-town MapLibre style, optionally pointed at other tiles or glyphs. */
export function toytownStyle(options: StyleOptions = {}): StyleSpecification {
  const style = structuredClone(toytown) as unknown as StyleSpecification;
  const source = style.sources.openmaptiles as {
    url?: string;
    tiles?: string[];
    maxzoom?: number;
    attribution?: string;
  };

  if (typeof options.tiles === 'string') {
    source.url = options.tiles;
  } else if (Array.isArray(options.tiles)) {
    delete source.url;
    source.tiles = options.tiles;
    source.maxzoom = options.maxzoom ?? 14;
  }
  if (options.glyphs) style.glyphs = options.glyphs;
  if (options.theme !== undefined) {
    const palette = resolveTheme(options.theme).style;
    const colors = (style.metadata as Record<string, Record<string, string>>)['toytown:colors']!;
    for (const layer of style.layers) {
      const paint = (layer as { paint?: Record<string, unknown> }).paint;
      if (!paint) continue;
      for (const prop of Object.keys(paint)) {
        const key = colors[`${layer.id}/${prop}`];
        if (key && palette[key]) paint[prop] = palette[key];
      }
    }
    (style.metadata as Record<string, unknown>)['toytown:palette'] = { ...palette };
  }
  if (options.attribution !== undefined) {
    const a = options.attribution;
    source.attribution = /(©|&copy;)\s*OpenStreetMap contributors/.test(a)
      ? a
      : [a, OSM_ATTRIBUTION].filter(Boolean).join(' ');
  }
  return style;
}

/** The minimal slice of a MapLibre `Map` that `setBaseBuildingsVisible` needs. */
export interface LayerHost {
  getLayer(id: string): unknown;
  setLayoutProperty(layer: string, name: string, value: unknown): unknown;
}

/** The slice of a MapLibre `Map` that `recolourStyle` needs. */
export interface StyleHost {
  getStyle(): { metadata?: unknown; layers: { id: string }[] } | undefined;
  setPaintProperty(layer: string, name: string, value: unknown): unknown;
}

/**
 * Recolour a map that's showing the toy-town style with a theme's `style` palette, in place
 * (no style reload). Uses the colour map in the style's metadata, so it's a no-op on other styles.
 * Returns the number of paint properties changed.
 */
export function recolourStyle(map: StyleHost, theme: string | Theme): number {
  const style = map.getStyle();
  const colors = (style?.metadata as Record<string, Record<string, string>> | undefined)?.[
    'toytown:colors'
  ];
  if (!style || !colors) return 0;
  const palette = resolveTheme(theme).style;
  const ids = new Set(style.layers.map((l) => l.id));
  let n = 0;
  for (const [path, key] of Object.entries(colors)) {
    const slash = path.indexOf('/');
    const layer = path.slice(0, slash);
    if (!ids.has(layer) || !palette[key]) continue;
    map.setPaintProperty(layer, path.slice(slash + 1), palette[key]);
    n++;
  }
  return n;
}

/**
 * Show or hide the style's flat 2D building layer. The 3D layer calls this with `false`
 * when it is added and `true` when it is removed. A no-op if the layer isn't in the style.
 */
export function setBaseBuildingsVisible(map: LayerHost, visible: boolean): void {
  if (!map.getLayer(BASE_BUILDING_LAYER_ID)) return;
  map.setLayoutProperty(BASE_BUILDING_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
}
