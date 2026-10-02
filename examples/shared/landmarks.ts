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
