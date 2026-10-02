import { startDemo } from '@toytown/example-shared/demo';

const { map, toy } = startDemo({
  title: 'Castlemagner',
  data: './data/castlemagner.geojson',
  center: [-8.825, 52.1666],
  // The points of interest replace the fly-to list.
  landmarks: [],
  pois: './data/pois.geojson',
  other: { title: 'Waterford City', href: '../waterford/' },
});

// Exposed for poking around in devtools.
declare global {
  interface Window {
    map: typeof map;
    toy: typeof toy;
  }
}
window.map = map;
window.toy = toy;
