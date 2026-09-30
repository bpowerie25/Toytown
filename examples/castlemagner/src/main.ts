import { startDemo } from '@toytown/example-shared/demo';
import { CASTLEMAGNER } from '@toytown/example-shared/landmarks';

const { map, toy } = startDemo({
  title: 'Castlemagner',
  data: './data/castlemagner.geojson',
  center: [-8.825, 52.1666],
  landmarks: CASTLEMAGNER,
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
