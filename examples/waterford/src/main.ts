import { startDemo } from '@toytown/example-shared/demo';
import { WATERFORD } from '@toytown/example-shared/landmarks';

const { map, toy } = startDemo({
  title: 'Waterford City',
  data: './data/waterford.geojson',
  center: [-7.1085, 52.2615],
  landmarks: WATERFORD,
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
