import { startDemo } from '@toytown/example-shared/demo';
import { TRAMORE } from '@toytown/example-shared/landmarks';

const { map, toy } = startDemo({
  title: 'Tramore',
  data: './data/tramore.geojson',
  center: [-7.15, 52.162],
  landmarks: TRAMORE,
  other: { title: 'Waterford City', href: '../waterford/' },
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
