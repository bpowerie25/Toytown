import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { toytownStyle, VERSION } from 'toytown-gl';

const map = new maplibregl.Map({
  container: 'map',
  style: toytownStyle(),
  center: [-7.15, 52.162],
  zoom: 15,
  pitch: 55,
  attributionControl: { compact: false },
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Exposed for the Playwright screenshot tests and for poking around in devtools.
declare global {
  interface Window {
    map: maplibregl.Map;
  }
}
window.map = map;

console.info(`toytown-gl ${VERSION}: Tramore example`);
