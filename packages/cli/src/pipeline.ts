/**
 * build-data pipeline: OSM data in, classified toy-town features out.
 */
import {
  LocalProjection,
  centroid,
  closestOnSegment,
  orientation as footprintOrientation,
  pointInPolygon,
  polygonArea,
  snapFront,
  type Classifier,
  type LngLat,
  type PolygonXY,
  type Tags,
  type XY,
} from 'toytown-gl';
import { relationPolygons, rewind, wayPolygon, type LngLatPolygon } from './assemble';
import { Grid, bounds, hash32, rng } from './grid';
import {
  inBBox,
  isBuilding,
  isBuildingRelation,
  isHighway,
  isPoi,
  isTree,
  isTreeArea,
  isTreeAreaRelation,
  type BBox,
  type OsmData,
} from './osm';

export interface TreeOptions {
  /** Seed for scattered trees. The same seed and data always give the same trees. */
  seed: number;
  /** Square metres of park per scattered tree. */
  parkDensity: number;
  /** Square metres of grass per scattered tree. */
  grassDensity: number;
  /** Maximum scattered trees per area. */
  maxPerArea: number;
}

export const DEFAULT_TREES: TreeOptions = {
  seed: 1,
  parkDensity: 350,
  grassDensity: 900,
  maxPerArea: 300,
};

export interface BuildOptions {
  bbox: BBox;
  classify: Classifier;
  fallback: string;
  trees?: Partial<TreeOptions>;
  /** How far to look for a street when computing a building's front, in metres. */
  frontRadius?: number;
}

export interface BuildingProps {
  id: string;
  category: string;
  height: number;
  levels: number;
  /** Compass bearing of the footprint's long side, degrees in [0, 180). */
  orientation: number | null;
  /** Compass bearing the building faces (towards the nearest street), degrees in [0, 360). */
  front: number | null;
  name?: string;
}
export interface PointProps {
  id: string;
  category: string;
  height?: number;
  name?: string;
}

type Geometry =
  | { type: 'Polygon'; coordinates: LngLat[][] }
  | { type: 'MultiPolygon'; coordinates: LngLat[][][] }
  | { type: 'Point'; coordinates: LngLat };

export interface Feature<P = BuildingProps | PointProps> {
  type: 'Feature';
  geometry: Geometry;
  properties: P;
}

export interface ToyTownCollection {
  type: 'FeatureCollection';
  bbox: BBox;
  toytown: { version: 1; osm_timestamp?: string; attribution: string; license: string };
  features: Feature[];
}

export interface BuildStats {
  bbox: BBox;
  osm_timestamp?: string;
  buildings: number;
  categories: Record<string, number>;
  via: Record<string, number>;
  withFront: number;
  pois: { inBuildings: number; standalone: number };
  trees: { osm: number; scattered: number };
  /** Tag combinations of buildings that fell through to the fallback, most common first. */
  unmapped: { tags: string; count: number }[];
}

/** Keys that matter for classification; used to describe unmapped buildings in the report. */
const REPORT_KEYS = [
  'building', 'amenity', 'shop', 'office', 'tourism', 'historic', 'leisure', 'craft', 'healthcare',
  'man_made', 'religion', 'railway', 'public_transport', 'emergency', 'military', 'power', 'sport', 'club',
]; // prettier-ignore

/** Highway types a building shouldn't face if a real street is nearby. */
const MINOR_WAYS = new Set([
  'footway',
  'path',
  'cycleway',
  'steps',
  'bridleway',
  'corridor',
  'track',
  'service',
]);

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const roundCoords = (p: LngLat): LngLat => [round(p[0], 6), round(p[1], 6)];

interface Building {
  id: string;
  tags: Tags;
  polys: LngLatPolygon[];
  xy: PolygonXY[];
  area: number;
  /** Outer ring of the largest part, used for orientation and front. */
  main: XY[];
  center: XY;
  pois: Tags[];
}

interface Segment {
  a: XY;
  b: XY;
  minor: boolean;
}

export function buildData(
  osm: OsmData,
  opts: BuildOptions,
): { collection: ToyTownCollection; stats: BuildStats } {
  const { bbox, classify, fallback } = opts;
  const treeOpts = { ...DEFAULT_TREES, ...opts.trees };
  const frontRadius = opts.frontRadius ?? 100;
  const proj = new LocalProjection([(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]);
  const toXY = (p: LngLat) => proj.toXY(p);

  // 1. Building polygons
  const buildings: Building[] = [];
  const outerMembers = new Set<number>();
  const addBuilding = (id: string, tags: Tags, polys: LngLatPolygon[]) => {
    const xy = polys.map((poly) => poly.map((ring) => ring.map(toXY)));
    const areas = xy.map(polygonArea);
    const area = areas.reduce((a, b) => a + b, 0);
    if (!(area > 1)) return;
    const mainIndex = areas.indexOf(Math.max(...areas));
    const main = xy[mainIndex]![0]!;
    const center = centroid(main);
    if (!inBBox(...proj.toLngLat(center), bbox)) return; // each building belongs to exactly one bbox
    buildings.push({ id, tags, polys: polys.map(rewind), xy, area, main, center, pois: [] });
  };
  for (const [id, rel] of osm.relations) {
    if (!isBuildingRelation(rel.tags)) continue;
    const polys = relationPolygons(rel, osm);
    if (!polys) continue;
    for (const m of rel.members)
      if (m.type === 'way' && m.role !== 'inner') outerMembers.add(m.ref);
    addBuilding(`relation/${id}`, rel.tags!, polys);
  }
  for (const [id, way] of osm.ways) {
    if (!isBuilding(way.tags) || outerMembers.has(id)) continue; // old-style multipolygons tag the outer way too
    const poly = wayPolygon(way.refs, osm);
    if (poly) addBuilding(`way/${id}`, way.tags!, [poly]);
  }
  buildings.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const buildingGrid = new Grid<Building>(50);
  for (const b of buildings) buildingGrid.insert(b, ...bounds(b.xy.flatMap((p) => p[0]!)));
  const buildingAt = (p: XY): Building | null => {
    let found: Building | null = null;
    for (const b of buildingGrid.near(p)) {
      if (found && b.area >= found.area) continue; // nested buildings: the smallest one wins
      if (b.xy.some((poly) => pointInPolygon(p, poly))) found = b;
    }
    return found;
  };

  // 2. POIs inside buildings
  const standalonePois: [number, LngLat, Tags][] = [];
  let poisInBuildings = 0;
  for (const [id, n] of osm.nodes) {
    if (!n.tags || !isPoi(n.tags)) continue;
    const b = buildingAt(toXY([n.lon, n.lat]));
    if (b) {
      b.pois.push(n.tags);
      poisInBuildings++;
    } else if (inBBox(n.lon, n.lat, bbox)) standalonePois.push([id, [n.lon, n.lat], n.tags]);
  }

  // 3. Streets, for building fronts and to keep scattered trees off roads
  const streetGrid = new Grid<Segment>(50);
  for (const way of osm.ways.values()) {
    if (!isHighway(way.tags)) continue;
    const minor = MINOR_WAYS.has(way.tags!.highway!);
    let prev: XY | null = null;
    for (const ref of way.refs) {
      const n = osm.nodes.get(ref);
      if (!n) {
        prev = null;
        continue;
      }
      const p = toXY([n.lon, n.lat]);
      if (prev) streetGrid.insert({ a: prev, b: p, minor }, ...bounds([prev, p]));
      prev = p;
    }
  }
  const nearestStreet = (p: XY, radius: number, includeMinor: boolean) => {
    let best: { point: XY; dist2: number } | null = null;
    for (const s of streetGrid.near(p, radius)) {
      if (s.minor && !includeMinor) continue;
      const c = closestOnSegment(p, s.a, s.b);
      if (c.dist2 <= radius * radius && (!best || c.dist2 < best.dist2)) best = c;
    }
    return best;
  };

  // 4. Classify, orient and face each building
  const features: Feature[] = [];
  const categories: Record<string, number> = {};
  const via: Record<string, number> = {};
  const unmapped = new Map<string, number>();
  let withFront = 0;

  for (const b of buildings) {
    const c = classify({ id: b.id, tags: b.tags, area: b.area, pois: b.pois });
    categories[c.category] = (categories[c.category] ?? 0) + 1;
    via[c.via] = (via[c.via] ?? 0) + 1;
    if (c.via === 'fallback') {
      const key = describe(b.tags, b.pois);
      unmapped.set(key, (unmapped.get(key) ?? 0) + 1);
    }

    const orientation = footprintOrientation(b.main);
    const street =
      nearestStreet(b.center, frontRadius, false) ?? nearestStreet(b.center, frontRadius, true);
    let front: number | null = null;
    if (street) {
      const dx = street.point[0] - b.center[0];
      const dy = street.point[1] - b.center[1];
      const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      front = orientation === null ? round(bearing, 1) % 360 : snapFront(bearing, orientation);
      withFront++;
    }

    const props: BuildingProps = {
      id: b.id,
      category: c.category,
      height: c.height,
      levels: c.levels,
      orientation,
      front,
    };
    if (b.tags.name) props.name = b.tags.name;
    const polys = b.polys.map((poly) => poly.map((ring) => ring.map(roundCoords)));
    features.push({
      type: 'Feature',
      geometry:
        polys.length === 1
          ? { type: 'Polygon', coordinates: polys[0]! }
          : { type: 'MultiPolygon', coordinates: polys },
      properties: props,
    });
  }

  // 5. POIs outside any footprint that map to a model (for the "point" placement in phase 4)
  let standalone = 0;
  for (const [id, p, tags] of standalonePois.sort((a, b) => a[0] - b[0])) {
    const c = classify({ id: `node/${id}`, tags, area: 0, pois: [] });
    if ((c.via !== 'tags' && c.via !== 'landmark') || c.category === fallback) continue;
    const props: PointProps = { id: `node/${id}`, category: c.category, height: c.height };
    if (tags.name) props.name = tags.name;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: roundCoords(p) },
      properties: props,
    });
    standalone++;
  }

  // 6. Trees: mapped trees, then seeded scatter inside parks and grass
  const treeGrid = new Grid<XY>(10);
  let osmTrees = 0;
  const treeIds = [...osm.nodes.keys()]
    .filter((id) => isTree(osm.nodes.get(id)!.tags))
    .sort((a, b) => a - b);
  for (const id of treeIds) {
    const n = osm.nodes.get(id)!;
    if (!inBBox(n.lon, n.lat, bbox)) continue;
    const p = toXY([n.lon, n.lat]);
    treeGrid.insert(p, p[0], p[1], p[0], p[1]);
    const props: PointProps = { id: `node/${id}`, category: 'tree' };
    const h = Number.parseFloat(n.tags!.height ?? '');
    if (h > 0) props.height = h;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: roundCoords([n.lon, n.lat]) },
      properties: props,
    });
    osmTrees++;
  }

  const areas: [string, LngLatPolygon[], Tags][] = [];
  for (const [id, rel] of [...osm.relations].sort((a, b) => a[0] - b[0])) {
    if (!isTreeAreaRelation(rel.tags)) continue;
    const polys = relationPolygons(rel, osm);
    if (polys) areas.push([`relation/${id}`, polys, rel.tags!]);
  }
  for (const [id, way] of [...osm.ways].sort((a, b) => a[0] - b[0])) {
    if (!isTreeArea(way.tags)) continue;
    const poly = wayPolygon(way.refs, osm);
    if (poly) areas.push([`way/${id}`, [poly], way.tags!]);
  }

  let scattered = 0;
  for (const [areaId, polys, tags] of areas) {
    const random = rng(hash32(`${treeOpts.seed}:${areaId}`));
    const density = tags.leisure === 'park' ? treeOpts.parkDensity : treeOpts.grassDensity;
    for (const [pi, poly] of polys.entries()) {
      const xy = poly.map((ring) => ring.map(toXY));
      const want = Math.min(treeOpts.maxPerArea, Math.floor(polygonArea(xy) / density));
      const [minX, minY, maxX, maxY] = bounds(xy[0]!);
      let placed = 0;
      for (let attempt = 0; attempt < want * 12 && placed < want; attempt++) {
        const p: XY = [minX + random() * (maxX - minX), minY + random() * (maxY - minY)];
        if (!pointInPolygon(p, xy)) continue;
        const ll = proj.toLngLat(p);
        if (!inBBox(ll[0], ll[1], bbox)) continue;
        if (buildingAt(p)) continue;
        if (nearestStreet(p, 4, true)) continue;
        let crowded = false;
        for (const t of treeGrid.near(p, 5)) {
          if ((t[0] - p[0]) ** 2 + (t[1] - p[1]) ** 2 < 25) {
            crowded = true;
            break;
          }
        }
        if (crowded) continue;
        treeGrid.insert(p, p[0], p[1], p[0], p[1]);
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: roundCoords(ll) },
          properties: { id: `scatter/${areaId}/${pi}/${placed}`, category: 'tree' },
        });
        placed++;
      }
      scattered += placed;
    }
  }

  const collection: ToyTownCollection = {
    type: 'FeatureCollection',
    bbox,
    toytown: {
      version: 1,
      ...(osm.timestamp ? { osm_timestamp: osm.timestamp } : {}),
      attribution: '© OpenStreetMap contributors',
      license: 'ODbL-1.0',
    },
    features,
  };
  const stats: BuildStats = {
    bbox,
    ...(osm.timestamp ? { osm_timestamp: osm.timestamp } : {}),
    buildings: buildings.length,
    categories: sortRecord(categories),
    via: sortRecord(via),
    withFront,
    pois: { inBuildings: poisInBuildings, standalone },
    trees: { osm: osmTrees, scattered },
    unmapped: [...unmapped]
      .map(([tags, count]) => ({ tags, count }))
      .sort((a, b) => b.count - a.count || (a.tags < b.tags ? -1 : 1))
      .slice(0, 100),
  };
  return { collection, stats };
}

function describe(tags: Tags, pois: Tags[]): string {
  const parts = new Set<string>();
  for (const k of REPORT_KEYS) if (tags[k] !== undefined) parts.add(`${k}=${tags[k]}`);
  for (const poi of pois)
    for (const k of REPORT_KEYS) if (poi[k] !== undefined) parts.add(`poi:${k}=${poi[k]}`);
  return [...parts].sort().join(' + ') || '(no relevant tags)';
}

function sortRecord(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(r).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
  );
}
