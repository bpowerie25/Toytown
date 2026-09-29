import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ToyTown, VERSION } from 'toytown-gl';

const map = new maplibregl.Map({
  container: 'map',
  style: ToyTown.style(),
  center: [-7.15, 52.162],
  zoom: 16.2,
  pitch: 55,
  attributionControl: { compact: false },
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// ?debug shows the FPS / draw-call overlay.
const debug = new URLSearchParams(location.search).has('debug');
const toy = new ToyTown({
  data: './data/tramore.geojson',
  models: './models/manifest.json',
  debug,
}).addTo(map);

// Exposed for the Playwright tests and for poking around in devtools.
declare global {
  interface Window {
    map: maplibregl.Map;
    toy: ToyTown;
  }
}
window.map = map;
window.toy = toy;

console.info(`toytown-gl ${VERSION}: Tramore example`);
