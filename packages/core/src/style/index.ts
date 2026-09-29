import type { StyleSpecification } from 'maplibre-gl';
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

/**
 * Show or hide the style's flat 2D building layer. The 3D layer calls this with `false`
 * when it is added and `true` when it is removed. A no-op if the layer isn't in the style.
 */
export function setBaseBuildingsVisible(map: LayerHost, visible: boolean): void {
  if (!map.getLayer(BASE_BUILDING_LAYER_ID)) return;
  map.setLayoutProperty(BASE_BUILDING_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
}
