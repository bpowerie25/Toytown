/**
 * A tiny synthetic town around (0, 0). Coordinates are built in metres and converted to degrees,
 * so tests can reason about distances. Everything here is made up.
 */
import type { TestNode, TestRelation, TestWay } from './pbf-writer';

const M = 1 / 111_320; // ~1 m in degrees at the equator
let nextNode = 1;
export const nodes: TestNode[] = [];
const node = (x: number, y: number, tags?: Record<string, string>) => {
  const n = { id: nextNode++, lon: x * M, lat: y * M, ...(tags ? { tags } : {}) };
  nodes.push(n);
  return n.id;
};
const ring = (pts: [number, number][]) => {
  const ids = pts.map(([x, y]) => node(x, y));
  return [...ids, ids[0]!];
};
const rect = (x: number, y: number, w: number, h: number) =>
  ring([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); // prettier-ignore

export const ways: TestWay[] = [
  // A house, 10×8 m, long side east-west, south of the street
  { id: 100, refs: rect(0, 0, 10, 8), tags: { building: 'house', name: 'Rose Cottage' } },
  // A building=yes with a café node inside
  { id: 101, refs: rect(20, 0, 8, 12), tags: { building: 'yes' } },
  // A garage (weak generic)
  { id: 102, refs: rect(40, 0, 4, 5), tags: { building: 'garage' } },
  // A street running east-west at y = 20
  {
    id: 200,
    refs: [node(-50, 20), node(100, 20)],
    tags: { highway: 'residential', name: 'Main Street' },
  },
  // A footpath at y = -3, closer to the house than the street is
  { id: 201, refs: [node(-50, -3), node(100, -3)], tags: { highway: 'footway' } },
  // A park, 60×40 m, north of the street
  { id: 300, refs: rect(0, 30, 60, 40), tags: { leisure: 'park', name: 'Green Park' } },
  // A GAA pitch east of the park, and a racetrack line beyond it
  { id: 301, refs: rect(70, 30, 30, 50), tags: { leisure: 'pitch', sport: 'gaelic_games' } },
  {
    id: 302,
    refs: [node(105, 30), node(110, 60), node(105, 85)],
    tags: { leisure: 'track', sport: 'horse_racing' },
  },
  // Multipolygon parts: outer split into two ways, plus an inner courtyard
  { id: 400, refs: [node(60, 0), node(90, 0), node(90, 15)] },
  { id: 401, refs: [] }, // filled below (shares endpoints with 400)
  { id: 402, refs: rect(70, 5, 5, 5) },
];
// Close the outer ring: 90,15 -> 60,15 -> 60,0, sharing the endpoint nodes of way 400.
{
  const w400 = ways.find((w) => w.id === 400)!;
  const w401 = ways.find((w) => w.id === 401)!;
  w401.refs = [w400.refs[2]!, node(60, 15), w400.refs[0]!];
}

export const relations: TestRelation[] = [
  {
    id: 500,
    tags: { type: 'multipolygon', building: 'school', name: 'Scoil Test' },
    members: [
      { type: 'way', ref: 400, role: 'outer' },
      { type: 'way', ref: 401, role: 'outer' },
      { type: 'way', ref: 402, role: 'inner' },
    ],
  },
];

// A café node inside way 101, a standalone pub node, and a mapped tree.
node(24, 6, { amenity: 'cafe', name: 'The Bean' });
node(-30, 40, { amenity: 'pub', name: 'Lonely Pub' });
node(5, 60, { natural: 'tree', height: '9' });

export const BBOX: [number, number, number, number] = [-60 * M, -20 * M, 120 * M, 90 * M];
