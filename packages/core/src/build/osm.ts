import type { Tags } from '../classify';

export interface OsmNode {
  lon: number;
  lat: number;
  tags?: Tags;
}
export interface OsmWay {
  refs: number[];
  tags?: Tags;
}
export interface OsmMember {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
}
export interface OsmRelation {
  members: OsmMember[];
  tags?: Tags;
}

/** The subset of OSM that build-data needs, from either Overpass or a PBF extract. */
export interface OsmData {
  nodes: Map<number, OsmNode>;
  ways: Map<number, OsmWay>;
  relations: Map<number, OsmRelation>;
  /** Timestamp of the OSM data, when the source reports one. */
  timestamp?: string;
}

/** [west, south, east, north] in degrees. */
export type BBox = [number, number, number, number];

export function inBBox(lon: number, lat: number, [w, s, e, n]: BBox): boolean {
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

// Which elements build-data uses. Shared by the Overpass query and the PBF filter so both
// sources produce the same data.

/** POI node keys (PLAN.md) plus healthcare and railway stations, which tag-map.json uses. */
export const POI_KEYS = [
  'amenity',
  'shop',
  'office',
  'tourism',
  'historic',
  'leisure',
  'craft',
  'healthcare',
];
export const POI_RAILWAY = ['station', 'halt'];
export const HIGHWAY_EXCLUDE = [
  'proposed',
  'construction',
  'abandoned',
  'razed',
  'platform',
  'disused',
];

const has = (tags: Tags | undefined, k: string) =>
  !!tags && tags[k] !== undefined && tags[k] !== 'no';

export const isBuilding = (tags?: Tags) => has(tags, 'building');
export const isBuildingRelation = (tags?: Tags) =>
  isBuilding(tags) && tags!.type === 'multipolygon';
export const isHighway = (tags?: Tags) =>
  has(tags, 'highway') && !HIGHWAY_EXCLUDE.includes(tags!.highway!);
/** Open spaces build-data exports (classified by the tag map's `areas` rules). */
export const AREA_LEISURE = [
  'park', 'garden', 'pitch', 'playground', 'sports_centre', 'stadium', 'track', 'golf_course',
  'recreation_ground', 'village_green', 'common', 'dog_park', 'racetrack',
]; // prettier-ignore
export const AREA_LANDUSE = ['grass', 'meadow', 'recreation_ground', 'village_green', 'cemetery'];
export const isArea = (tags?: Tags) =>
  (!!tags?.leisure && AREA_LEISURE.includes(tags.leisure)) ||
  (!!tags?.landuse && AREA_LANDUSE.includes(tags.landuse)) ||
  tags?.amenity === 'grave_yard';
export const isAreaRelation = (tags?: Tags) => isArea(tags) && tags!.type === 'multipolygon';
/** Race and running tracks drawn as lines (unclosed ways). */
export const isTrackLine = (tags?: Tags) =>
  tags?.leisure === 'track' || tags?.highway === 'raceway';
export const isTree = (tags?: Tags) => tags?.natural === 'tree';
export const isPoi = (tags?: Tags) =>
  POI_KEYS.some((k) => has(tags, k)) || (!!tags?.railway && POI_RAILWAY.includes(tags.railway));

/** Parse an Overpass `[out:json]` response. */
export function fromOverpassJson(json: {
  osm3s?: { timestamp_osm_base?: string };
  elements: Array<Record<string, unknown>>;
}): OsmData {
  const data: OsmData = { nodes: new Map(), ways: new Map(), relations: new Map() };
  if (json.osm3s?.timestamp_osm_base) data.timestamp = json.osm3s.timestamp_osm_base;
  for (const e of json.elements) {
    const id = e.id as number;
    const tags = e.tags as Tags | undefined;
    if (e.type === 'node') {
      const prev = data.nodes.get(id);
      data.nodes.set(id, { lon: e.lon as number, lat: e.lat as number, tags: tags ?? prev?.tags });
    } else if (e.type === 'way') {
      data.ways.set(id, { refs: e.nodes as number[], tags });
    } else if (e.type === 'relation') {
      const members = (
        e.members as Array<{ type: OsmMember['type']; ref: number; role: string }>
      ).map(({ type, ref, role }) => ({ type, ref, role }));
      data.relations.set(id, { members, tags });
    }
  }
  return data;
}
