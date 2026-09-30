# toytown-gl

**OpenStreetMap as a cartoony toy town, anywhere in the world.** A drop-in plugin for
[MapLibre GL JS](https://maplibre.org/): a friendly base style, procedural toy buildings for every
OSM footprint, and CC0 low-poly models for houses, shops, pubs, schools, churches and more.

![Waterford City as a toy town](https://raw.githubusercontent.com/bpowerie25/Toytown/main/docs/demo.gif)

## Install

```sh
npm i toytown-gl maplibre-gl @toytown/models
```

## Use

```ts
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Vite; other bundlers: see MapLibre's setWorkerUrl docs.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { ToyTown } from 'toytown-gl';

maplibregl.setWorkerUrl(workerUrl);

const map = new maplibregl.Map({
  container: 'map',
  style: ToyTown.style(),
  center: [-7.11, 52.26],
  zoom: 16,
  pitch: 55,
});
const toy = new ToyTown({
  data: '/data/town.geojson',
  models: '/models/manifest.json',
  theme: 'default',
});
toy.addTo(map);
toy.on('click', (b) => console.log(b.category, b.name, b.osm));
```

- **`data`**: a GeoJSON file made by `toytown build-data` for your area. See
  [Building data](https://github.com/bpowerie25/Toytown/blob/main/docs/build-data.md).
- **`models`**: the model kit's `manifest.json`. Copy it from `@toytown/models`
  (`cp -r node_modules/@toytown/models/models public/models`) or serve it from a CDN.
- **`theme`**: `'default'` or `'night'`. Match the base map with `ToyTown.style({ theme: 'night' })`.

Without a bundler:

```html
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6/dist/maplibre-gl.css" />
<script src="https://unpkg.com/toytown-gl/dist/toytown-gl.umd.js"></script>
<script type="module">
  import * as maplibregl from 'https://unpkg.com/maplibre-gl@6/dist/maplibre-gl.mjs';
  const { ToyTown } = ToyTownGL;
</script>
```

MapLibre 6 ships ES modules only, so it's imported in a module script. toytown-gl also works with
MapLibre 5 (`^5.0.0 || ^6.4.1`), but 6.4.1 and later fix an attribution XSS
([GHSA-jrc7-96c5-q579](https://github.com/advisories/GHSA-jrc7-96c5-q579)).

Full documentation: [API](https://github.com/bpowerie25/Toytown/blob/main/docs/api.md) ·
[Adding models](https://github.com/bpowerie25/Toytown/blob/main/docs/adding-models.md) ·
[Performance](https://github.com/bpowerie25/Toytown/blob/main/docs/performance.md) ·
[Repository](https://github.com/bpowerie25/Toytown)

## Attribution

The map data is © OpenStreetMap contributors under the ODbL, and maps must show "© OpenStreetMap
contributors". Building data you derive from OSM is ODbL too. The code is MIT; the models are CC0.
