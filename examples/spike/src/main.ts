/**
 * Phase 2.5 visual spike (throwaway): kit models on real classified Waterford buildings,
 * rendered with deck.gl's ScenegraphLayer over the toy-town base style.
 *
 * URL params: ?zoom=16&bearing=0&pitch=55&lng=…&lat=…
 *   &calibrate=1   four shops facing N, E, S, W (left to right), to check the front convention
 *   &lighting=ambient  ambient light only, intensity π (cancels PBR's 1/π), so faces render their palette colour
 */
import { AmbientLight, DirectionalLight, LightingEffect } from '@deck.gl/core';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { load } from '@loaders.gl/core';
import { GLTFLoader } from '@loaders.gl/gltf';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  LocalProjection,
  centroid,
  minRotatedRect,
  parseManifest,
  toytownStyle,
  type LngLat,
  type Manifest,
} from 'toytown-gl';
import dataUrl from '../../waterford/public/data/waterford.geojson?url';

// The Quay and city centre.
const AREA: [number, number, number, number] = [-7.1175, 52.257, -7.103, 52.2635];
const CENTER: LngLat = [-7.1105, 52.2608];
/** How many buildings to place per category (default 2). */
const PER_CATEGORY: Record<string, number> = {
  house: 4,
  terraced_house: 3,
  shop: 3,
  cafe: 2,
  pub: 2,
};
const MAX_MODELS = 28;
const MAX_TREES = 15;

interface Building {
  type: 'Feature';
  geometry: { type: string; coordinates: LngLat[][] };
  properties: {
    id: string;
    category: string;
    front: number | null;
    orientation: number | null;
    name?: string;
  };
}
interface Tree {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: LngLat };
  properties: { id: string; category: 'tree'; height?: number };
}
interface Placement {
  id: string;
  category: string;
  position: LngLat;
  /** Compass bearing the model's front (+Z) should face. */
  front: number;
  scale: number;
}

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);

const map = new maplibregl.Map({
  container: 'map',
  style: toytownStyle(),
  center: [num('lng', CENTER[0]), num('lat', CENTER[1])],
  zoom: num('zoom', 16),
  pitch: num('pitch', 55),
  bearing: num('bearing', 0),
  attributionControl: { compact: false },
  canvasContextAttributes: { antialias: true },
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');

declare global {
  interface Window {
    map: maplibregl.Map;
    spike: { ready: boolean; placements: Placement[] };
  }
}
window.map = map;
window.spike = { ready: false, placements: [] };

function choose(manifest: Manifest, buildings: Building[]): Placement[] {
  const proj = new LocalProjection(CENTER);
  const candidates = buildings
    .filter((b) => b.geometry.type === 'Polygon' && b.properties.front !== null)
    .filter((b) => b.properties.category !== 'generic' && manifest.models[b.properties.category])
    .map((b) => {
      const ring = b.geometry.coordinates[0]!.map((p) => proj.toXY(p));
      const c = centroid(ring);
      return { b, ring, c, lngLat: proj.toLngLat(c) };
    })
    .filter(({ lngLat: [x, y] }) => x >= AREA[0] && x <= AREA[2] && y >= AREA[1] && y <= AREA[3])
    // Nearest to the centre first, then by id for stability.
    .sort(
      (a, b) =>
        Math.hypot(...a.c) - Math.hypot(...b.c) || (a.b.properties.id < b.b.properties.id ? -1 : 1),
    );

  const taken: Record<string, number> = {};
  const out: Placement[] = [];
  for (const { b, ring, lngLat } of candidates) {
    const cat = b.properties.category;
    if ((taken[cat] ?? 0) >= (PER_CATEGORY[cat] ?? 2)) continue;
    const rect = minRotatedRect(ring);
    const [fw, fd] = manifest.models[cat]!.footprint_m;
    const scale = rect
      ? Math.min(1.6, Math.max(0.6, Math.sqrt((rect.length * rect.width) / (fw * fd))))
      : 1;
    out.push({
      id: b.properties.id,
      category: cat,
      position: lngLat,
      front: b.properties.front!,
      scale,
    });
    taken[cat] = (taken[cat] ?? 0) + 1;
    if (out.length >= MAX_MODELS) break;
  }
  return out;
}

/** Four shops in a row west→east at the centre, facing N, E, S, W. */
function calibration(): Placement[] {
  const proj = new LocalProjection(CENTER);
  return [0, 90, 180, 270].map((front, i) => ({
    id: `calibrate/${front}`,
    category: 'shop',
    position: proj.toLngLat([(i - 1.5) * 16, 0]),
    front,
    scale: 1,
  }));
}

async function main() {
  const [manifestJson, data] = await Promise.all([
    fetch('./manifest.json').then((r) => r.json()),
    fetch(dataUrl).then((r) => r.json() as Promise<{ features: (Building | Tree)[] }>),
  ]);
  const manifest = parseManifest(manifestJson);
  const buildings = data.features.filter((f): f is Building => f.geometry.type !== 'Point');
  const placements = params.has('calibrate') ? calibration() : choose(manifest, buildings);
  // Mapped trees in the area, nearest the centre first. Yaw and size vary per tree id.
  const proj = new LocalProjection(CENTER);
  const trees = params.has('calibrate')
    ? []
    : data.features
        .filter(
          (f): f is Tree => f.properties.category === 'tree' && f.properties.id.startsWith('node/'),
        )
        .filter(
          ({
            geometry: {
              coordinates: [x, y],
            },
          }) => x >= AREA[0] && x <= AREA[2] && y >= AREA[1] && y <= AREA[3],
        )
        .sort(
          (a, b) =>
            Math.hypot(...proj.toXY(a.geometry.coordinates)) -
            Math.hypot(...proj.toXY(b.geometry.coordinates)),
        )
        .slice(0, MAX_TREES);
  window.spike.placements = placements;

  const categories = [
    ...new Set([...placements.map((p) => p.category), ...(trees.length ? ['tree'] : [])]),
  ];
  const scenegraphs = Object.fromEntries(
    await Promise.all(
      categories.map(
        async (c) => [c, await load(`./${manifest.models[c]!.file}`, GLTFLoader)] as const,
      ),
    ),
  );

  const hash = (s: string) =>
    [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
  const treeLayer = new ScenegraphLayer<Tree>({
    id: 'model-tree',
    data: trees,
    scenegraph: scenegraphs.tree,
    getPosition: (t) => t.geometry.coordinates,
    getOrientation: (t) => [0, hash(t.properties.id) % 360, 90],
    getScale: (t) => {
      const k = 0.85 + (hash(t.properties.id) % 30) / 100;
      return [k, k, k];
    },
    _lighting: 'pbr',
  });
  const layers = categories
    .filter((c) => c !== 'tree')
    .map(
      (c) =>
        new ScenegraphLayer<Placement>({
          id: `model-${c}`,
          data: placements.filter((p) => p.category === c),
          scenegraph: scenegraphs[c],
          getPosition: (p) => p.position,
          // Kit models are Y-up with the front on +Z. Roll 90° stands them up in deck's Z-up world;
          // yaw turns the front to face the building's front bearing (see PROGRESS.md for the check).
          getOrientation: (p) => [0, 180 - p.front, 90],
          getScale: (p) => [p.scale, p.scale, p.scale],
          sizeScale: 1,
          _lighting: 'pbr',
          pickable: true,
        }),
    );

  const lighting =
    params.get('lighting') === 'ambient'
      ? new LightingEffect({
          ambient: new AmbientLight({ color: [255, 255, 255], intensity: Math.PI }),
        })
      : // PBR divides diffuse by π; these give lit faces ~1.0–1.2× and shaded faces 0.7× the palette.
        new LightingEffect({
          ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.7 * Math.PI }),
          sun: new DirectionalLight({
            color: [255, 255, 255],
            intensity: 0.5 * Math.PI,
            direction: [-1, -2, -3],
          }),
        });
  const overlay = new MapboxOverlay({
    interleaved: true,
    layers: [...layers, treeLayer],
    effects: [lighting],
    getTooltip: ({ object }) =>
      object ? `${(object as Placement).category} · ${(object as Placement).id}` : null,
  });
  map.addControl(overlay);
  map.once('idle', () => {
    window.spike.ready = true;
  });
  map.triggerRepaint();
}

map.on('load', () => {
  main().catch((e: unknown) => console.error(e));
});
