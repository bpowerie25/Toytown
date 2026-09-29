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
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ToyTown } from 'toytown-gl';

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
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/toytown-gl/dist/toytown-gl.umd.js"></script>
<script>
  const { ToyTown } = ToyTownGL;
</script>
```

Full documentation: [API](https://github.com/bpowerie25/Toytown/blob/main/docs/api.md) ·
[Adding models](https://github.com/bpowerie25/Toytown/blob/main/docs/adding-models.md) ·
[Performance](https://github.com/bpowerie25/Toytown/blob/main/docs/performance.md) ·
[Repository](https://github.com/bpowerie25/Toytown)

## Attribution

The map data is © OpenStreetMap contributors under the ODbL, and maps must show "© OpenStreetMap
contributors". Building data you derive from OSM is ODbL too. The code is MIT; the models are CC0.
