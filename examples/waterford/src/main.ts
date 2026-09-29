import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ToyTown, VERSION } from 'toytown-gl';

const map = new maplibregl.Map({
  container: 'map',
  style: ToyTown.style(),
  center: [-7.1085, 52.2615],
  zoom: 15,
  pitch: 55,
  attributionControl: { compact: false },
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');

const toy = new ToyTown({ data: './data/waterford.geojson' }).addTo(map);

// Exposed for the Playwright screenshot tests and for poking around in devtools.
declare global {
  interface Window {
    map: maplibregl.Map;
    toy: ToyTown;
  }
}
window.map = map;
window.toy = toy;

console.info(`toytown-gl ${VERSION}: Waterford City example`);
