import { startDemo } from '@toytown/example-shared/demo';

const { map, toy } = startDemo({
  title: 'Waterford City',
  data: './data/waterford.geojson',
  center: [-7.1085, 52.2615],
  // The points of interest replace the fly-to list.
  landmarks: [],
  pois: './data/pois.geojson',
  other: { title: 'Tramore', href: '../tramore/' },
});

// Exposed for the Playwright tests and for poking around in devtools.
declare global {
  interface Window {
    map: typeof map;
    toy: typeof toy;
  }
}
window.map = map;
window.toy = toy;
