import type { LayerSpecification, Map as MaplibreMap } from 'maplibre-gl';
import { RAILED, type AreaLayers } from '../areas';
import { DEFAULT_THEME, type AreaTheme, type Theme } from '../themes';

const SOURCES = ['areas', 'stripes', 'markings', 'labels'] as const;

/** Line width that stays about `m` metres wide on the ground (512 px tiles, at mid latitudes). */
const metres = (m: number | unknown[]) =>
  ['interpolate', ['exponential', 2], ['zoom'], 12, ['/', m, 11.8], 20, ['*', m, 21.8]] as never;

/** The MapLibre layers for open spaces, bottom to top. Labels are separate: they go on top. */
export function areaStyleLayers(
  id: string,
  theme: Theme,
): { under: LayerSpecification[]; labels: LayerSpecification } {
  const t: AreaTheme = theme.areas ?? DEFAULT_THEME.areas!;
  const { default: fallback, ...fills } = t.fill;
  const byCategory = [
    'match',
    ['get', 'category'],
    ...Object.entries(fills).flat(),
    fallback ?? DEFAULT_THEME.areas!.fill.default!,
  ] as unknown as string;
  const src = (s: (typeof SOURCES)[number]) => `${id}-${s}`;
  const polygons = ['==', ['geometry-type'], 'Polygon'] as never;
  const railed = ['in', ['get', 'category'], ['literal', [...RAILED]]] as never;
  // Horse tracks are wide grass; athletics and greyhound tracks are narrower, on a hard surface.
  const turfTrack = ['in', ['get', 'sport'], ['literal', ['horse_racing', 'equestrian']]];
  const trackWidth = ['case', turfTrack, 20, 8];
  return {
    under: [
      {
        id: `${id}-areas`,
        type: 'fill',
        source: src('areas'),
        filter: polygons,
        paint: { 'fill-color': byCategory },
      },
      {
        id: `${id}-area-stripes`,
        type: 'fill',
        source: src('stripes'),
        minzoom: 15,
        paint: { 'fill-color': t.stripe, 'fill-opacity': 0.8 },
      },
      {
        id: `${id}-area-edges`,
        type: 'line',
        source: src('areas'),
        filter: ['all', polygons, ['!=', ['get', 'category'], 'grass'], ['!', railed]] as never,
        minzoom: 14,
        paint: { 'line-color': t.outline, 'line-width': 1 },
      },
      {
        id: `${id}-track-surface`,
        type: 'line',
        source: src('areas'),
        filter: railed,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['case', turfTrack, t.turfTrack, t.trackSurface] as never,
          'line-width': metres(trackWidth),
        },
      },
      ...([-0.5, 0.5] as const).map(
        (side) =>
          ({
            id: `${id}-rails-${side < 0 ? 'inner' : 'outer'}`,
            type: 'line',
            source: src('areas'),
            filter: railed,
            minzoom: 14,
            layout: { 'line-join': 'round' },
            paint: {
              'line-color': t.rail,
              'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 18, 2] as never,
              'line-offset': metres(['*', trackWidth, side]),
            },
          }) as LayerSpecification,
      ),
      {
        id: `${id}-area-markings`,
        type: 'line',
        source: src('markings'),
        minzoom: 15.5,
        paint: { 'line-color': t.markings, 'line-width': metres(0.12) },
      },
    ] as LayerSpecification[],
    labels: {
      id: `${id}-area-labels`,
      type: 'symbol',
      source: src('labels'),
      minzoom: 14.5,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['nunito_bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14.5, 11, 18, 14],
        'text-max-width': 8,
        'text-padding': 4,
      },
      paint: { 'text-color': t.label, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.6 },
    } as LayerSpecification,
  };
}

/**
 * Add the open-space sources and layers: fills and lines under the first road layer (or under
 * `layerId`, the 3D layer, in styles without OpenMapTiles roads), labels under the first label.
 */
export function addAreaLayers(
  map: MaplibreMap,
  id: string,
  data: AreaLayers,
  theme: Theme,
  layerId: string,
) {
  for (const s of SOURCES) map.addSource(`${id}-${s}`, { type: 'geojson', data: data[s] as never });
  const layers = map.getStyle().layers;
  const road = layers.find(
    (l) => 'source-layer' in l && l['source-layer'] === 'transportation',
  )?.id;
  const firstSymbol = layers.find((l) => l.type === 'symbol')?.id;
  const { under, labels } = areaStyleLayers(id, theme);
  for (const l of under) map.addLayer(l, road ?? layerId);
  map.addLayer(labels, firstSymbol);
}

export function removeAreaLayers(map: MaplibreMap, id: string) {
  const { under, labels } = areaStyleLayers(id, DEFAULT_THEME);
  for (const l of [...under, labels]) if (map.getLayer(l.id)) map.removeLayer(l.id);
  for (const s of SOURCES) if (map.getSource(`${id}-${s}`)) map.removeSource(`${id}-${s}`);
}
