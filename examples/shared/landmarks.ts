/**
 * Demo fly-to targets. Ids and positions verified with Nominatim on 2026-09-29.
 */
export interface Landmark {
  name: string;
  osm: string;
  center: [number, number];
  zoom: number;
  bearing: number;
}

export const WATERFORD: Landmark[] = [
  {
    name: "Reginald's Tower",
    osm: 'way/75780894',
    center: [-7.1054, 52.26047],
    zoom: 17.8,
    bearing: -30,
  },
  {
    name: 'Christ Church Cathedral',
    osm: 'way/42744158',
    center: [-7.10757, 52.25995],
    zoom: 17.8,
    bearing: 20,
  },
  {
    name: 'House of Waterford Crystal',
    osm: 'way/72089526',
    center: [-7.10684, 52.25909],
    zoom: 17.6,
    bearing: -60,
  },
  {
    name: "Bishop's Palace",
    osm: 'way/72089538',
    center: [-7.10759, 52.2596],
    zoom: 18,
    bearing: 45,
  },
  {
    name: "People's Park",
    osm: 'way/37300862',
    center: [-7.10461, 52.25622],
    zoom: 16.8,
    bearing: 0,
  },
];

export const TRAMORE: Landmark[] = [
  {
    name: 'The Metal Man',
    osm: 'way/46694890',
    center: [-7.17186, 52.13759],
    zoom: 17.6,
    bearing: 60,
  },
  {
    name: 'The Promenade',
    osm: 'way/23802199',
    center: [-7.14372, 52.15932],
    zoom: 16.8,
    bearing: -20,
  },
  {
    name: 'Holy Cross Church',
    osm: 'way/35141806',
    center: [-7.15645, 52.16325],
    zoom: 17.6,
    bearing: 30,
  },
  {
    name: 'Tramore Racecourse',
    osm: 'way/44184081',
    center: [-7.14846, 52.17246],
    zoom: 16.5,
    bearing: 0,
  },
];

// From the Castlemagner build-data output (OSM ids and footprint positions), 2026-09-29.
export const CASTLEMAGNER: Landmark[] = [
  {
    name: "Saint Mary's Church",
    osm: 'way/340657250',
    center: [-8.82766, 52.16522],
    zoom: 18,
    bearing: 20,
  },
  {
    name: "Geoff's Pub",
    osm: 'way/331400676',
    center: [-8.82482, 52.16655],
    zoom: 18.2,
    bearing: -40,
  },
  {
    name: 'The Rectory',
    osm: 'way/331400671',
    center: [-8.81923, 52.16718],
    zoom: 18,
    bearing: 60,
  },
  {
    name: 'The whole village',
    osm: 'relation/14597374',
    center: [-8.825, 52.1666],
    zoom: 16.3,
    bearing: 0,
  },
];
