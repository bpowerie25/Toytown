import type { Map as MaplibreMap } from 'maplibre-gl';
import { tileCenter, tileOf, type LngLat } from './geometry';
import { parseManifest, type Manifest } from './manifest';
import {
  planKit,
  planPoints,
  planTrees,
  type Placement,
  type PlannedBuilding,
  type PointFeature,
} from './placement';
import { SceneFrame } from './render/frame';
import { ToyTownLayer, type ChunkInput } from './render/layer';
import type { LodOptions } from './render/lod';
import { DebugOverlay } from './render/overlay';
import { ChunkPool } from './render/pool';
import { setBaseBuildingsVisible, toytownStyle, type StyleOptions } from './style';
import { DEFAULT_THEME, type Theme } from './themes';

interface DataFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: { id: string; category: string; height?: number; front?: number | null };
}
export interface DataCollection {
  type: 'FeatureCollection';
  bbox?: [number, number, number, number];
  features: DataFeature[];
}

export interface ToyTownOptions {
  /** URL of a `toytown build-data` GeoJSON file, or the collection itself. */
  data: string | DataCollection;
  /** URL of a model kit `manifest.json`. Without it, only procedural buildings are drawn. */
  models?: string;
  theme?: Theme;
  /** Zoom thresholds for each level of detail (defaults: 14, 15, 16, 17). */
  lod?: Partial<LodOptions>;
  /** Show an FPS / draw-call panel in the map's corner. */
  debug?: boolean;
  /** Id of the MapLibre layer. Default "toytown". */
  id?: string;
}

/** Drop-in toy-town buildings, models and trees for a MapLibre map. */
export class ToyTown {
  /** The toy-town base style, for `new maplibregl.Map({ style: ToyTown.style() })`. */
  static style(options?: StyleOptions) {
    return toytownStyle(options);
  }

  private map?: MaplibreMap;
  private layer?: ToyTownLayer;
  private pool?: ChunkPool;
  private overlay?: DebugOverlay;
  private readonly theme: Theme;
  private readonly id: string;
  private resolveLoaded!: () => void;
  private readonly loaded: Promise<void>;

  constructor(private readonly options: ToyTownOptions) {
    this.theme = options.theme ?? DEFAULT_THEME;
    this.id = options.id ?? 'toytown';
    this.loaded = new Promise((r) => (this.resolveLoaded = r));
  }

  /**
   * Resolves when the data is in and everything the current view needs is drawn: the visible
   * chunks and, at model zoom, their models. Await it again after moving the map.
   */
  get ready(): Promise<void> {
    return this.loaded.then(() => this.layer?.settled());
  }

  addTo(map: MaplibreMap): this {
    this.map = map;
    const start = () => void this.start().catch((e: unknown) => console.error('[toytown-gl]', e));
    if (map.isStyleLoaded()) start();
    else map.once('load', start);
    return this;
  }

  remove(): void {
    this.pool?.terminate();
    this.overlay?.remove();
    if (this.map?.getLayer(this.id)) this.map.removeLayer(this.id);
    if (this.map) setBaseBuildingsVisible(this.map, true);
    this.map = undefined;
    this.layer = undefined;
  }

  /** Layer statistics (level of detail, chunks, instances, draw calls), for debugging. */
  stats() {
    return this.layer?.stats();
  }

  private async start(): Promise<void> {
    const map = this.map!;
    this.layer = new ToyTownLayer(this.id, this.theme, this.options.lod);
    // Draw under the labels.
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer(this.layer, firstSymbol);
    if (this.options.debug) this.overlay = new DebugOverlay(map, () => this.layer?.stats());

    const [data, manifest] = await Promise.all([
      typeof this.options.data === 'string'
        ? fetch(this.options.data).then((r) => r.json() as Promise<DataCollection>)
        : this.options.data,
      this.options.models
        ? fetch(this.options.models).then(async (r) => parseManifest(await r.json()))
        : Promise.resolve(null as Manifest | null),
    ]);
    const { buildings, points, trees } = splitData(data);
    const bbox = data.bbox ?? bboxOf(buildings);
    const frame = new SceneFrame([(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]);
    const kit = manifest ? planKit(manifest) : null;

    // Points and trees don't depend on a chunk's meshing, so they're planned once up front and
    // handed to the chunk whose tile they're in.
    const extras: Placement[] = kit
      ? [...planPoints(points, buildings, kit, this.theme), ...planTrees(trees, kit, this.theme)]
      : [];
    const chunks = toChunks(buildings, extras);

    this.pool = new ChunkPool();
    const pool = this.pool;
    this.layer.setData(
      frame,
      chunks,
      (c) => pool.process({ buildings: c.buildings, origin: c.origin, theme: this.theme, kit }),
      manifest ?? undefined,
      this.options.models ? new URL(this.options.models, location.href).href : '',
    );
    this.resolveLoaded();
  }
}

/** Group buildings and extra placements into chunks by tile, in a fixed order. */
export function toChunks(buildings: PlannedBuilding[], extras: Placement[]): ChunkInput[] {
  const chunks = new Map<string, ChunkInput>();
  const slot = (p: LngLat) => {
    const [x, y] = tileOf(p);
    const key = `15/${x}/${y}`;
    let c = chunks.get(key);
    if (!c) chunks.set(key, (c = { key, origin: tileCenter(x, y), buildings: [], extras: [] }));
    return c;
  };
  for (const b of buildings) slot(b.parts[0]![0]![0]!).buildings.push(b);
  for (const p of extras) slot(p.position).extras.push(p);
  const sort = (a: { name?: string; id: string }, b: { name?: string; id: string }) =>
    (a.name ?? '') < (b.name ?? '')
      ? -1
      : (a.name ?? '') > (b.name ?? '')
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0;
  for (const c of chunks.values()) c.extras.sort(sort);
  return [...chunks.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Split a build-data collection into buildings, POI points and trees. */
export function splitData(data: DataCollection): {
  buildings: PlannedBuilding[];
  points: PointFeature[];
  trees: { id: string; position: LngLat; height?: number }[];
} {
  const buildings: PlannedBuilding[] = [];
  const points: PointFeature[] = [];
  const trees: { id: string; position: LngLat; height?: number }[] = [];
  for (const f of data.features) {
    const g = f.geometry;
    const p = f.properties;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      buildings.push({
        id: p.id,
        category: p.category,
        height: p.height ?? 6,
        front: p.front ?? null,
        parts:
          g.type === 'Polygon' ? [g.coordinates as LngLat[][]] : (g.coordinates as LngLat[][][]),
      });
    } else if (g.type === 'Point') {
      const position = g.coordinates as LngLat;
      if (p.category === 'tree')
        trees.push({ id: p.id, position, ...(p.height ? { height: p.height } : {}) });
      else points.push({ id: p.id, category: p.category, position, front: p.front ?? null });
    }
  }
  return { buildings, points, trees };
}

function bboxOf(buildings: PlannedBuilding[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; // prettier-ignore
  for (const b of buildings) {
    for (const [x, y] of b.parts[0]![0]!) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
  }
  return [w, s, e, n];
}
