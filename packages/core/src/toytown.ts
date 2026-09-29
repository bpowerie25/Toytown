import type { Map as MaplibreMap } from 'maplibre-gl';
import { groupByChunk, type BuildingInputFeature, type LngLat } from './geometry';
import { BuildingLayer } from './render/layer';
import { MeshPool } from './render/pool';
import { setBaseBuildingsVisible, toytownStyle, type StyleOptions } from './style';
import { DEFAULT_THEME, type Theme } from './themes';

interface DataFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: { id: string; category: string; height?: number };
}
interface DataCollection {
  type: 'FeatureCollection';
  features: DataFeature[];
}

export interface ToyTownOptions {
  /** URL of a `toytown build-data` GeoJSON file, or the collection itself. */
  data: string | DataCollection;
  theme?: Theme;
  /** Id of the MapLibre layer. Default "toytown-buildings". */
  id?: string;
}

/** Drop-in toy-town buildings for a MapLibre map. */
export class ToyTown {
  /** The toy-town base style, for `new maplibregl.Map({ style: ToyTown.style() })`. */
  static style(options?: StyleOptions) {
    return toytownStyle(options);
  }

  private map?: MaplibreMap;
  private layer?: BuildingLayer;
  private pool?: MeshPool;
  private readonly theme: Theme;
  private readonly id: string;
  /** Resolves when every chunk has been meshed and added. */
  ready: Promise<void>;
  private resolveReady!: () => void;

  constructor(private readonly options: ToyTownOptions) {
    this.theme = options.theme ?? DEFAULT_THEME;
    this.id = options.id ?? 'toytown-buildings';
    this.ready = new Promise((r) => (this.resolveReady = r));
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
    if (this.map && this.layer && this.map.getLayer(this.id)) this.map.removeLayer(this.id);
    if (this.map) setBaseBuildingsVisible(this.map, true);
    this.map = undefined;
    this.layer = undefined;
  }

  private async start(): Promise<void> {
    const map = this.map!;
    this.layer = new BuildingLayer(this.id, this.theme.buildings);
    // Draw under the labels.
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer(this.layer, firstSymbol);
    setBaseBuildingsVisible(map, false);

    const data =
      typeof this.options.data === 'string'
        ? ((await (await fetch(this.options.data)).json()) as DataCollection)
        : this.options.data;
    const buildings = toBuildings(data);
    const chunks = groupByChunk(buildings, (b) => b.parts[0]![0]![0]!);
    this.pool = new MeshPool();
    await Promise.all(
      chunks.map(async (c) => {
        const mesh = await this.pool!.mesh(c.items, c.origin, this.theme.buildings);
        this.layer?.addChunk(c.key, mesh);
      }),
    );
    this.pool.terminate();
    this.resolveReady();
  }
}

/** Building polygons from a build-data collection (trees and POI points are skipped here). */
export function toBuildings(data: DataCollection): BuildingInputFeature[] {
  const out: BuildingInputFeature[] = [];
  for (const f of data.features) {
    const g = f.geometry;
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') continue;
    out.push({
      id: f.properties.id,
      category: f.properties.category,
      height: f.properties.height ?? 6,
      parts: g.type === 'Polygon' ? [g.coordinates as LngLat[][]] : (g.coordinates as LngLat[][][]),
    });
  }
  return out;
}
