import type { LngLat as MaplibreLngLat, Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl';
import { Box3 } from 'three';
import { areaLayers, planAreaProps, type AreaFeature, type AreaLayers } from './areas';
import { tileCenter, tileOf, type LngLat } from './geometry';
import { parseManifest, parsePackManifest, type Manifest, type ModelEntry } from './manifest';
import {
  planKit,
  planPoints,
  planTrees,
  type Placement,
  type PlannedBuilding,
  type PointFeature,
} from './placement';
import { addAreaLayers, removeAreaLayers } from './render/area-style';
import { EffectsOverlay } from './render/effects';
import { SceneFrame } from './render/frame';
import { ToyTownLayer, type ChunkInput, type PickHit } from './render/layer';
import type { LodOptions } from './render/lod';
import { loadModel } from './render/models';
import { DebugOverlay } from './render/overlay';
import { ChunkPool } from './render/pool';
import { recolourStyle, setBaseBuildingsVisible, toytownStyle, type StyleOptions } from './style';
import { resolveTheme, type Theme } from './themes';

interface DataFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: {
    id: string;
    category: string;
    height?: number;
    front?: number | null;
    name?: string;
    /** `area` (open-space polygons) and `track` (lines); absent for buildings, POIs and trees. */
    kind?: 'area' | 'track';
    sport?: string;
  };
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
  /** A built-in theme name (`default`, `night`) or a theme object. */
  theme?: string | Theme;
  /** Zoom thresholds for each level of detail (defaults: 14, 15, 16, 17). */
  lod?: Partial<LodOptions>;
  /** Show an FPS / draw-call panel in the map's corner. */
  debug?: boolean;
  /** Id of the MapLibre layer. Default "toytown". */
  id?: string;
}

/** What a click (or `pick`) found. */
export interface BuildingInfo extends PickHit {
  /** The building or POI category, e.g. `pub` (`tree` for trees). */
  category: string;
  name?: string;
  /** Height in metres, for buildings. */
  height?: number;
  /** Link to the element on openstreetmap.org, or null for scattered trees. */
  osm: string | null;
}

export interface ToyTownClickEvent extends BuildingInfo {
  lngLat: MaplibreLngLat;
  originalEvent: MouseEvent;
}

type Events = { click: ToyTownClickEvent };

/** Drop-in toy-town buildings, models and trees for a MapLibre map. */
export class ToyTown {
  /**
   * The toy-town base style, for `new maplibregl.Map({ style: ToyTown.style() })`.
   * Pass `{ theme: 'night' }` to match a themed ToyTown.
   */
  static style(options?: StyleOptions) {
    return toytownStyle(options);
  }

  private map?: MaplibreMap;
  private layer?: ToyTownLayer;
  private pool?: ChunkPool;
  private overlay?: DebugOverlay;
  private effects?: EffectsOverlay;
  private theme: Theme;
  private areaData?: AreaLayers;
  private readonly id: string;
  private resolveLoaded!: () => void;
  private readonly loaded: Promise<void>;
  private readonly listeners: { [K in keyof Events]: Set<(e: Events[K]) => void> } = {
    click: new Set(),
  };
  private readonly overrides = new Map<string, string>();
  private readonly packs: string[] = [];
  // Set once data is in.
  private data?: {
    buildings: PlannedBuilding[];
    points: PointFeature[];
    trees: { id: string; position: LngLat; height?: number }[];
    areas: AreaFeature[];
    info: Map<string, { category: string; name?: string; height?: number }>;
    frame: SceneFrame;
  };
  private manifest: Manifest | null = null;
  private modelsBase = '';
  private applying: Promise<void> = Promise.resolve();

  constructor(private readonly options: ToyTownOptions) {
    this.theme = resolveTheme(options.theme);
    this.id = options.id ?? 'toytown';
    this.loaded = new Promise((r) => (this.resolveLoaded = r));
  }

  /**
   * Resolves when the data is in and everything the current view needs is drawn: the visible
   * chunks and, at model zoom, their models. Await it again after moving the map.
   */
  get ready(): Promise<void> {
    return this.loaded.then(() => this.applying).then(() => this.layer?.settled());
  }

  addTo(map: MaplibreMap): this {
    this.map = map;
    const start = () => void this.start().catch((e: unknown) => console.error('[toytown-gl]', e));
    if (map.isStyleLoaded()) start();
    else map.once('load', start);
    map.on('click', this.onClick);
    return this;
  }

  remove(): void {
    this.pool?.terminate();
    this.overlay?.remove();
    this.effects?.remove();
    this.effects = undefined;
    this.map?.off('click', this.onClick);
    if (this.map?.getLayer(this.id)) this.map.removeLayer(this.id);
    if (this.map) removeAreaLayers(this.map, this.id);
    if (this.map) setBaseBuildingsVisible(this.map, true);
    this.map = undefined;
    this.layer = undefined;
  }

  /** Listen for clicks on buildings, models and trees. */
  on<K extends keyof Events>(type: K, listener: (e: Events[K]) => void): this {
    this.listeners[type].add(listener);
    return this;
  }

  off<K extends keyof Events>(type: K, listener: (e: Events[K]) => void): this {
    this.listeners[type].delete(listener);
    return this;
  }

  /** What's under a point (CSS pixels from the map's top-left), or null. */
  pick(point: { x: number; y: number }): BuildingInfo | null {
    const hit = this.layer?.pick(point.x, point.y);
    if (!hit) return null;
    const info = this.data?.info.get(hit.id);
    const category = hit.kind === 'tree' ? 'tree' : (info?.category ?? hit.model ?? 'unknown');
    const osm = /^(node|way|relation)\/\d+$/.test(hit.id)
      ? `https://www.openstreetmap.org/${hit.id}`
      : null;
    return {
      ...hit,
      category,
      ...(info?.name ? { name: info.name } : {}),
      ...(info?.height ? { height: info.height } : {}),
      osm,
    };
  }

  /**
   * Use your own GLB for a category (Y-up, metres, front facing +Z, origin at the base centre).
   * It replaces the kit's model and variants for that category; its footprint is measured from
   * the file for fitting. Materials named by palette keys are coloured by the theme; others keep
   * their own colours.
   */
  setCategoryModel(category: string, url: string): Promise<void> {
    this.overrides.set(category, new URL(url, location.href).href);
    return this.reapply();
  }

  /**
   * Add a regional pack (its `manifest.json`): its models join the kit, and its landmark
   * overrides give specific OSM elements a pack model.
   */
  addPack(url: string): Promise<void> {
    this.packs.push(new URL(url, location.href).href);
    return this.reapply();
  }

  /**
   * Switch to another theme without reloading the map: a built-in name (`default`, `night`,
   * `sitcom`, `pastel`) or a theme object. The toy-town base style is recoloured in place (other
   * styles are left alone), open spaces are restyled, and buildings and models are rebuilt in the
   * new colours. Resolves when the town is re-planned; await `ready` for the redraw.
   */
  setTheme(theme: string | Theme): Promise<void> {
    this.theme = resolveTheme(theme);
    const map = this.map;
    if (map) {
      const restyle = () => {
        if (this.map !== map) return;
        recolourStyle(map, this.theme);
        if (this.areaData) {
          removeAreaLayers(map, this.id);
          addAreaLayers(map, this.id, this.areaData, this.theme, this.id);
        }
      };
      this.effects?.set(this.theme.effects);
      if (map.isStyleLoaded()) restyle();
      else map.once('load', restyle);
    }
    this.layer?.setTheme(this.theme);
    return this.reapply();
  }

  /** The theme in use. */
  getTheme(): Theme {
    return this.theme;
  }

  /** Layer statistics (level of detail, chunks, instances, draw calls), for debugging. */
  stats() {
    return this.layer?.stats();
  }

  private readonly onClick = (e: MapMouseEvent) => {
    if (!this.listeners.click.size) return;
    const info = this.pick(e.point);
    if (!info) return;
    const event: ToyTownClickEvent = { ...info, lngLat: e.lngLat, originalEvent: e.originalEvent };
    for (const l of this.listeners.click) l(event);
  };

  private async start(): Promise<void> {
    const map = this.map!;
    this.layer = new ToyTownLayer(this.id, this.theme, this.options.lod);
    // Draw under the labels.
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer(this.layer, firstSymbol);
    this.effects = new EffectsOverlay(map);
    this.effects.set(this.theme.effects);
    if (this.options.debug) this.overlay = new DebugOverlay(map, () => this.layer?.stats());

    const [data, manifest] = await Promise.all([
      typeof this.options.data === 'string'
        ? fetch(this.options.data).then((r) => r.json() as Promise<DataCollection>)
        : this.options.data,
      this.options.models
        ? fetch(this.options.models).then(async (r) => parseManifest(await r.json()))
        : Promise.resolve(null as Manifest | null),
    ]);
    this.manifest = manifest;
    this.modelsBase = this.options.models ? new URL(this.options.models, location.href).href : '';
    const split = splitData(data);
    const bbox = data.bbox ?? bboxOf(split.buildings);
    const info = new Map<string, { category: string; name?: string; height?: number }>();
    for (const f of data.features) {
      const { id, category, name, height } = f.properties;
      info.set(id, { category, ...(name ? { name } : {}), ...(height ? { height } : {}) });
    }
    this.data = {
      ...split,
      info,
      frame: new SceneFrame([(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]),
    };
    if (split.areas.length) {
      this.areaData = areaLayers(split.areas);
      addAreaLayers(map, this.id, this.areaData, this.theme, this.id);
    }
    this.pool = new ChunkPool();
    await this.reapply();
    this.resolveLoaded();
  }

  /** Apply packs and model overrides to the kit, then (re)plan the town. Queued, one at a time. */
  private reapply(): Promise<void> {
    this.applying = this.applying
      .then(() => this.plan())
      .catch((e: unknown) => console.error('[toytown-gl]', e));
    return this.applying;
  }

  private async plan(): Promise<void> {
    if (!this.data || !this.layer || !this.pool) return; // not started yet: start() will plan
    let manifest = this.manifest;

    for (const url of this.packs) {
      const pack = parsePackManifest(await (await fetch(url)).json());
      manifest ??= { version: 1, units: 'metres', up: '+Y', front: '+Z', palette: {}, models: {} };
      const abs = (f: string) => new URL(f, url).href;
      const models: Record<string, ModelEntry> = { ...manifest.models };
      for (const [name, m] of Object.entries(pack.models)) {
        models[name] = {
          ...m,
          file: abs(m.file),
          variants: m.variants?.map((v) => ({ ...v, file: abs(v.file) })),
        };
      }
      manifest = { ...manifest, palette: { ...pack.palette, ...manifest.palette }, models };
      for (const l of pack.landmarks) {
        if (!models[l.category]) continue;
        const b = this.data.buildings.find((x) => x.id === l.osm);
        if (b) {
          b.category = l.category;
          const i = this.data.info.get(l.osm);
          if (i) i.category = l.category;
        }
      }
    }
    this.packs.length = 0;

    for (const [category, url] of this.overrides) {
      manifest ??= { version: 1, units: 'metres', up: '+Y', front: '+Z', palette: {}, models: {} };
      const model = await loadModel(url, manifest, this.theme);
      const box = new Box3().setFromBufferAttribute(
        model.geometry.getAttribute('position') as never,
      );
      model.geometry.dispose();
      model.hull.dispose();
      const size = box.max.clone().sub(box.min);
      manifest = {
        ...manifest,
        models: {
          ...manifest.models,
          [category]: {
            file: url,
            pack: 'user',
            osm_tags: [],
            materials: [],
            footprint_m: [Math.max(0.1, size.x), Math.max(0.1, size.y)],
            height_m: Math.max(0.1, box.max.z),
          },
        },
      };
    }
    this.overrides.clear();
    this.manifest = manifest;

    const kit = manifest ? planKit(manifest) : null;
    const { buildings, points, trees, areas, frame } = this.data;
    // Points and trees don't depend on a chunk's meshing, so they're planned once up front and
    // handed to the chunk whose tile they're in.
    const extras: Placement[] = kit
      ? [
          ...planPoints(points, buildings, kit, this.theme),
          ...planTrees(trees, kit, this.theme),
          ...planAreaProps(areas, kit),
        ]
      : [];
    const pool = this.pool;
    this.layer.clear();
    this.layer.setData(
      frame,
      toChunks(buildings, extras),
      (c) => pool.process({ buildings: c.buildings, origin: c.origin, theme: this.theme, kit }),
      manifest ?? undefined,
      this.modelsBase,
    );
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

/** Split a build-data collection into buildings, POI points, trees and open spaces. */
export function splitData(data: DataCollection): {
  buildings: PlannedBuilding[];
  points: PointFeature[];
  trees: { id: string; position: LngLat; height?: number }[];
  areas: AreaFeature[];
} {
  const buildings: PlannedBuilding[] = [];
  const points: PointFeature[] = [];
  const trees: { id: string; position: LngLat; height?: number }[] = [];
  const areas: AreaFeature[] = [];
  for (const f of data.features) {
    const g = f.geometry;
    const p = f.properties;
    if (p.kind === 'area' || p.kind === 'track') {
      const parts =
        g.type === 'Polygon'
          ? [g.coordinates as LngLat[][]]
          : g.type === 'MultiPolygon'
            ? (g.coordinates as LngLat[][][])
            : g.type === 'LineString'
              ? [[g.coordinates as LngLat[]]]
              : [];
      if (parts.length)
        areas.push({
          id: p.id,
          category: p.category,
          kind: p.kind,
          parts,
          ...(p.name ? { name: p.name } : {}),
          ...(p.sport ? { sport: p.sport } : {}),
        });
    } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
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
  return { buildings, points, trees, areas };
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
