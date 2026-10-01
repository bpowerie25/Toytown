# toytown-gl

## 0.3.0

### Minor Changes

- Build a town's data in the browser: `new ToyTown({ area: [w, s, e, n], models })` fetches
  OpenStreetMap from Overpass and runs the `toytown build-data` pipeline in the page, so a village
  or town centre needs no data file. `data` is now optional; new options are `area`, `overpass`
  (the interpreter URL) and `maxAreaKm2` (default 12; bigger areas should use the CLI). Overpass
  responses are cached in the browser for a week. A new `status` event reports `loading`, `ready`
  and `error`. The pipeline is exported too (`buildData`, `buildAreaData`, `bboxAreaKm2`, the
  Overpass client and OSM parsing).

  Fixed: a ToyTown added after another was removed could wait forever for the map's `load` event,
  and `remove()` during that wait left a pending start that later crashed.

## 0.2.0

### Minor Changes

- 5caddba: Skins: 18 new built-in themes (`sitcom`, `pastel`, `toybox`, `retro`, `neon`, `vintage`,
  `sketch`, `blueprint`, `autumn`, `winter`, `christmas`, `halloween`, `shamrock`, `comic`,
  `handdrawn`, `golden`, `voxel`, `chunky`), theme `effects` (halftone, wobble, paper grain, haze, snow, blocks), skin model sets
  (`models.kit`: the voxel and chunky sets ship in `@toytown/models` under `models/skins/`), and
  `toy.setTheme(name)` to switch skins live without reloading the map. Themes gain
  `outline.inkShade` and `outline.inkMix` for the edge ink, `hullWidth: 0` turns model outlines
  off, and `recolourStyle(map, theme)` recolours a live toy-town style in place.

## 0.1.0

### Minor Changes

- First release.

  - **toytown-gl**: a MapLibre plugin that draws OpenStreetMap as a toy town. It includes the
    toy-town base style, procedural buildings (gable/hip roofs, parapets, windows, ink edges),
    hero models fitted to footprints with variants and props, trees, `default` and `night` themes,
    click events, custom models, regional packs, open spaces (parks, pitches, playgrounds,
    racecourses), and levels of detail by zoom. Works with MapLibre `^5.0.0 || ^6.4.1`. Ships as
    ESM (with types) and a self-contained UMD build.
  - **@toytown/models**: 31 CC0 low-poly building models, 6 variants and 7 props, with a manifest,
    an Irish landmark pack, and a README for three.js, Babylon.js, Unity and Godot.
  - **@toytown/cli**: `toytown build-data` builds the data file for any bbox in the world, from
    Overpass or a PBF extract (`npx @toytown/cli build-data --bbox … --out town.geojson`).
