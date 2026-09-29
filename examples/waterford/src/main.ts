import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { VERSION } from 'toytown-gl';

// Phase 0: plain OpenFreeMap base map. The toy-town style and 3D layer arrive in later phases.
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-7.1085, 52.2615],
  zoom: 15,
  pitch: 55,
  attributionControl: { compact: false, customAttribution: '© OpenStreetMap contributors' },
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');

console.info(`toytown-gl ${VERSION}: Waterford City example`);
