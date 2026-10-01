# API

```ts
import { ToyTown } from 'toytown-gl';
```

## `ToyTown.style(options?)`

Returns the toy-town MapLibre style (a fresh copy each time):

| Option        | Meaning                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `theme`       | `'default'`, `'night'`, `'sitcom'`, `'pastel'`, `'winter'`, `'blueprint'` or a theme object.     |
| `tiles`       | A TileJSON URL or `{z}/{x}/{y}` templates, for OpenMapTiles-schema tiles (default: OpenFreeMap). |
| `maxzoom`     | Max zoom of the templates (default 14).                                                          |
| `glyphs`      | Glyph URL template (default: VersaTiles; the fonts are `nunito_bold` and `nunito_extrabold`).    |
| `attribution` | Source attribution. "© OpenStreetMap contributors" is always kept.                               |

## `new ToyTown(options)`

| Option   | Meaning                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| `data`   | URL of a `toytown build-data` GeoJSON file, or the collection itself. **Required.**                                   |
| `models` | URL of a model kit `manifest.json`. Without it, only procedural buildings are drawn.                                  |
| `theme`  | `'default'`, `'night'`, `'sitcom'`, `'pastel'`, `'winter'`, `'blueprint'` or a theme object (`themes/*.json`).        |
| `lod`    | `{ minZoom: 14, fullZoom: 15, modelZoom: 16, outlineZoom: 17, keepMs: 20000 }`; see [performance.md](performance.md). |
| `debug`  | Show the FPS / draw-call overlay.                                                                                     |
| `id`     | MapLibre layer id (default `"toytown"`).                                                                              |

### Methods

| Method                                 | Meaning                                                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addTo(map)`                           | Add to a MapLibre map (waits for the style to load). Returns `this`.                                                                                                                                                          |
| `remove()`                             | Remove from the map and free everything.                                                                                                                                                                                      |
| `ready`                                | A promise that resolves when the current view is drawn: data in, visible chunks meshed, and at model zoom, their models loaded. Await it again after moving the map.                                                          |
| `on('click', fn)` / `off('click', fn)` | Clicks on buildings, models, props and trees. `fn` receives a `BuildingInfo` plus `lngLat` and `originalEvent`.                                                                                                               |
| `pick({ x, y })`                       | What's under a point, in CSS pixels from the map's top-left: a `BuildingInfo` or `null`.                                                                                                                                      |
| `setCategoryModel(category, url)`      | Use your own GLB for a category, replacing its kit model and variants. Its footprint is measured from the file for fitting. Materials named by palette keys follow the theme; others keep their colours. Returns a promise.   |
| `setTheme(theme)`                      | Switch skin live, without reloading the map: a built-in name or a theme object. Recolours the toy-town base style in place, restyles open spaces, and rebuilds buildings and models in the new colours. Returns a promise.    |
| `getTheme()`                           | The theme in use.                                                                                                                                                                                                             |
| `addPack(url)`                         | Add a pack's `manifest.json`: its models join the kit, and its landmarks give specific OSM elements a pack model. Returns a promise. The format is in [your-own-buildings.md](your-own-buildings.md#3-one-specific-building). |
| `stats()`                              | Level of detail, chunks, instances, draw calls and triangles, for debugging.                                                                                                                                                  |

### `BuildingInfo`

```ts
{
  id: 'way/42744158',                 // OSM element (or scatter/… for scattered trees)
  kind: 'building' | 'model' | 'prop' | 'tree',
  category: 'church',                 // from the tag map
  name?: 'Christ Church Cathedral',
  height?: 32,                        // metres
  model?: 'church',                   // for models, props and trees
  osm: 'https://www.openstreetmap.org/way/42744158' | null,
}
```

## Lower-level exports

For custom renderers and tools, the core also exports:

- the style: `toytownStyle` and `setBaseBuildingsVisible`;
- classification: `parseTagMap` and `createClassifier`;
- geometry: `meshChunk`, `meshChunkPlain`, `minRotatedRect`, `orientation` and friends;
- placement: `planBuildings`, `fitModel`, `decorate`, `planPoints`, `planTrees` and
  `chooseVariant`;
- themes: `THEMES` and `resolveTheme`, and `recolourStyle(map, theme)` to recolour a live toy-town
  style in place;
- manifests: `parseManifest` and `parsePackManifest`;
- the custom layer itself: `ToyTownLayer`.

See `packages/core/src/index.ts`.
