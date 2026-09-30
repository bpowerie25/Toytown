# @toytown/models

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
