# PROGRESS.md

Updated at the end of each phase.

| Phase      | Status                | Notes                                                       |
| ---------- | --------------------- | ----------------------------------------------------------- |
| 0 Scaffold | done (CI not yet run) | Workspace, tooling, kit validation, CI, licences, examples. |
| 1 Style    | done (CI not yet run) | toytown.json, Nunito labels, Playwright screenshot tests.   |
| 2 Data     | done (CI not yet run) | build-data CLI, tag-map.json, both datasets, report.        |

## Phase 3: Procedural toy buildings (2026-09-29)

### What was done

- `packages/core/src/geometry/mesher.ts`: every footprint becomes a toy building. Walls are
  extruded to the eaves. Flat roofs get a bevelled top edge and a parapet around a triangulated
  deck, with holes. Gable or hip roofs, with overhang and soffit, go on rectangular-enough
  residential, pub, church and school footprints; there are no straight-skeleton roofs. Window
  strips are drawn by the shader, not built as geometry. Details are in `docs/buildings.md`.
- Wall colours are a deterministic per-building hash into category palettes, including the Irish
  terrace colours. Roofs are `#D9644A` or `#5B6C8F`, and windows `#7EC8E3`. Everything is driven
  by the new `packages/core/src/themes/default.json`: palettes, roof rules, bevel, parapet, window
  spacing and lighting.
- **Chunking** by z15 tile, with meshing in a Web Worker pool (`MeshPool`). Each chunk becomes one
  merged set of typed arrays and one draw call; there is never one mesh per building. Waterford is
  110 chunks, 1.41M vertices, 0.69M triangles, about 230 ms of meshing CPU.
- **Minimal three.js MapLibre custom layer (`BuildingLayer`)**, pulled forward from phase 4 so the
  buildings can be seen. It shares the GL context and depth buffer, uses per-chunk float64 matrix
  composition for precision, sits under the labels, and hides the base 2D buildings.
- **Minimal `ToyTown` class**: `ToyTown.style()`, `new ToyTown({ data }).addTo(map)`, `ready` and
  `remove()`. This is the start of the phase 6 API. Both examples now use it.
- Tests (283 unit tests): roof selection (categories, rectangularity threshold, holes and
  multipolygons, gable/hip share and determinism), roof rise caps, ring cleaning and insets, mesher
  output (merged buffers, gable/hip/flat heights, normals agree with winding, parapet and deck
  heights, box fallback, palette colours, window flags, degenerate input), chunk tiles, and
  `toBuildings`. The screenshot tests now wait for meshing, check the 3D layer exists and the base
  layer is hidden, and have refreshed baselines.
- Screenshots at z15, z16, z17 and z18.3 for both towns are in `docs/buildings/`.

### Decisions

- **Render layer pulled forward.** Phase 4 still owns the toon material, outlines, globe handling
  and hero models; the matrix maths and layer plumbing written now will be reused.
- **`three` is now a dependency of `toytown-gl`** (^0.186; on the approved stack), not a peer, so
  `npm i toytown-gl` stays enough. `@types/three` is a dev dependency. The mesher uses three's
  earcut triangulator (`ShapeUtils`) for roof decks.
- **The library is ESM-only for now.** The CJS build was dropped: the worker is loaded with
  `new URL('./worker.js', import.meta.url)`, which bundlers (Vite, webpack 5) resolve, but which
  has no CJS equivalent. The plan's phase 7 asks for ESM and UMD; UMD will need an inlined worker.
- **`hash32` moved into the core** (the CLI re-exports it), plus `hashUnit` and `pick` for stable
  per-building choices.
- **MapLibre v5 matrix**: `args.defaultProjectionData.mainMatrix` is the mercator [0, 1] to clip
  matrix. `modelViewProjectionMatrix` works in pixel-sized world units, and using it put
  everything past the far plane. Back-face culling stays at the default `FrontSide`.

### Known issues

- Windows shimmer (moiré) at z16 and below. Phase 5's LOD turns windows off below z15; a
  distance-based fade could help too.
- Big flat roofs, such as the city-centre shopping centre, are large plain grey areas. A theme
  could add roof detail later.
- Pitched roofs are fitted to the minimum rectangle, so on footprints that are 85–95% rectangular
  the roof overhangs the cut-away corners a little.
- About 62 MB of vertex data for all of Waterford. Fine on desktop; phase 5 needs LOD for phones.
- Globe projection isn't handled yet (phase 4).

## Phase 2.5: Visual spike (2026-09-29), approved

The screenshots were reviewed and approved on 2026-09-29. Zoom exaggeration and the manifest
version were left open; the defaults stand (strictly metric models, manifest version 1) until
decided.

### What was done

- `examples/spike`: deck.gl `ScenegraphLayer` via `MapboxOverlay` (interleaved) over the phase 1
  style. It places 28 kit models on classified Waterford buildings around the Quay and city
  centre, plus 15 mapped trees. Each model sits at the footprint centroid, scaled to the minimum
  rotated rectangle (clamped 0.6–1.6×) and rotated to face `front`.
- Screenshots at z15, z16 and z17 (pitch 55), a close-up, and two calibration shots are in
  `docs/spike/`. Findings are in `docs/spike/README.md`.
- deck.gl 9.4 and loaders.gl 4.5 were added to `examples/spike` only (approved); nothing new in the
  core.

### Decisions

- **Colour fix in `generate_models.py`.** glTF `baseColorFactor` is linear, but the generator wrote
  sRGB hex/255, so every spec-compliant renderer showed the palette washed out. It now writes
  exact linear floats. Because trimesh quantises factors to 8 bits, they're patched into the GLB
  JSON after export. A kit test enforces the conversion. Rendered colours were verified within
  5–11/255 of the palette. All 31 GLBs were regenerated; `check_reproducible.py` passes.
- **Orientation convention confirmed** with a four-direction calibration render: roll 90° (Y-up to
  deck's Z-up) and yaw `180 − front`. No generator change was needed.
- **Manifest version stays 1.** The documented conventions are unchanged; this was a spec bug.
  This is flagged for review.

### Known issues (for phase 4, not model fixes)

- Hero models overflow small city-centre plots even at the 0.6× clamp. This needs phase 4's
  `fit`/`decorate` rule.
- Models and trees are specks at z15 next to the exaggerated roads. Consider per-zoom
  exaggeration.
- Some terraced town-centre buildings are tagged `building=house` and get the detached-house
  model.

## Phase 2: Building data pipeline (2026-09-29)

### What was done

- `toytown build-data --bbox <w,s,e,n> --out <file>` in `packages/cli`. Sources: Overpass
  (default), or `--source pbf <file>`. Options: `--fgb` (FlatGeobuf), `--stats` and `toytown
report` for the markdown report. Details in `docs/build-data.md`.
- **Overpass client**: one query per bbox. It waits for a free slot via `/api/status`, retries
  429/503/504 with backoff, and caches raw responses in `.cache/overpass/` (git-ignored).
- **PBF reader** with no dependencies (node:zlib and a small protobuf decoder). The whole Ireland
  extract (414 MB) scans in about 11 s with about 250 MB of memory. Tramore from the PBF and from
  Overpass gives identical features and classification; coordinates differ by at most 1e-6°.
- **Polygons**, including multipolygon relations with holes (split member ways are joined).
  Buildings are assigned to a bbox by centroid, so adjacent bboxes never share one.
- **Classification** is in the core (`createClassifier`, `parseTagMap`), driven by
  `assets/models/tag-map.json`: 53 rules and 4 heuristics, whose categories must exist in the
  manifest. The order is landmark override, strong tags, POIs inside (point-in-polygon), weak
  tags, heuristics, then `generic`. Rules have priority, tag conditions (`building:levels>=8`)
  and measure conditions (`@area`, `@levels`, `@height`). See `docs/tag-mapping.md`.
- **Landmark pack**: `assets/models/ireland/landmarks.json` maps `way/46694890` to
  `landmark_metal_man`. The id was verified with Nominatim ("Metal Man Tramore") and the OSM API:
  `building=tower`, `historic=monument`, wikidata Q32824163.
- **Geometry** in the core (`packages/core/src/geometry/`): local projection, area, centroid,
  point-in-polygon with holes, convex hull, minimum rotated rectangle (rotating calipers),
  rectangularity, orientation, and front snapping.
- **Height** comes from `height`, else `building:levels` × 3 m, else a per-category default.
  **Orientation** is the bearing of the minimum-rectangle long side, in [0, 180). **Front** is
  the bearing to the nearest street within 100 m, snapped to a rectangle side. Footpaths and
  service roads are only used when no street is in range.
- **Trees**: 2,085 + 1,742 in Waterford and 3,028 + 575 in Tramore (mapped + scattered). The
  scatter in parks and grass is seeded by `--seed` and each area's OSM id, and trees are kept off
  buildings and roads.
- **Standalone POIs** (nodes outside any footprint that map to a model) are written as points for
  phase 4's `point` placement.
- **Datasets**: `examples/waterford/public/data/waterford.geojson` (8.80 MB, 26,870 buildings) and
  `examples/tramore/public/data/tramore.geojson` (2.45 MB, 6,272 buildings). Both are committed,
  since each is under 10 MB. Rebuild with `pnpm data:build`.
- `docs/classification-report.md`: counts per category for each town and the 30 most common
  unmapped tag combinations.
- 228 unit tests (up from 122): geometry, rectangle fitting, orientation, conditions, the tag map
  against the manifest, classifier stages, heights, PBF decoding (against an in-test PBF
  encoder), ring assembly, the Overpass client (slot waits, retry, cache), the pipeline on a
  synthetic town, args, FlatGeobuf round-trip, and the report.

### Decisions

- **Final bboxes** (checked against Nominatim; reasoning in the example READMEs):
  - Waterford `-7.17,52.22,-7.05,52.28`. The plan's rough box was `-7.16,52.23,-7.05,52.28`; I
    extended it west and south to cover the built-up area measured from land use.
  - Tramore `-7.18,52.135,-7.12,52.18`. The plan's rough box was `-7.17,52.15,-7.12,52.18`; I
    extended it south to include the Metal Man, which sits at 52.1376.
- **Weak rules** (not in the plan): vague building types such as `retail`, `commercial`,
  `industrial`, `civic` and `residential` give way to a POI inside. Otherwise a `building=retail`
  with a pharmacy inside would stay a generic `shop`.
- **Heuristics** in `tag-map.json` beyond levels and height, which the plan mentions:
  - Untagged buildings of 50–250 m² become `house`. This is 23% of Waterford.
  - Buildings of 2,500 m² or more with 2 levels or fewer become `warehouse`.
  - Buildings with 8 or more levels become `office`.

  Small structures (`garage`, `shed`, `roof`...) are pinned to `generic` so they don't turn into
  houses.

- **Queried POIs beyond the plan's list**: `healthcare=*` and `railway=station|halt` nodes are
  also fetched, because the tag map uses them.
- **Output format**: a single GeoJSON file holding buildings, trees (`category: "tree"`) and
  standalone POIs, so the plugin needs just one `data:` URL. Ids are `way/…`, `relation/…`,
  `node/…` and `scatter/…`.
- **`flatgeobuf` added to the CLI** (approved). Its licence is **BSD-3-Clause**, not MIT as I said
  when asking. FlatGeobuf needs a fixed column schema, so unknown numbers are `-1` and a missing
  name is `""`.
- **Overpass query uses `[maxsize:256MB]`, not 1 GB.** With 1 GB the server returned 504 five times
  in a row; the smaller reservation is served immediately.
- **Generator cleanup narrowed again**: it now deletes only `*.glb`, `manifest.json` and
  `preview.png`, so hand-written files in pack folders (`ireland/landmarks.json`, `tag-map.json`)
  survive regeneration.
- **Obvious fixes found via the first report**: `building=police` → `police_station`,
  `building=farm` → `house`, and `building=stable` → `barn`.

### Known issues

- About 10% of Waterford and 13% of Tramore buildings are still `generic`. Mostly these are
  `building=yes` outside the 50–250 m² house heuristic (2,572 in Waterford) and Tramore's caravan
  parks (`static_caravan` and `mobile_home`, 518 buildings), which have no model. See the report.
- `front` points at the nearest street segment from the centroid. For corner buildings and deep
  plots this can pick a side street; phase 4 can refine it with address or entrance tags.
- Scattered trees avoid buildings and roads, but not water or car parks inside a `landuse=grass`
  polygon.
- The PBF reader supports zlib and raw blobs only (standard for Geofabrik), not LZ4, zstd or LZMA.
- CI still hasn't run (no remote yet).

## Phase 1: Cartoon base style (2026-09-29)

### What was done

- `packages/core/src/style/toytown.json`: a 25-layer MapLibre style over OpenMapTiles-schema tiles
  (OpenFreeMap by default), using the exact plan palette. Round caps and joins, exaggerated road
  widths, and labels only for towns and villages, major roads, and water bodies. Full details in
  `docs/style.md`.
- `toytownStyle(options)`: returns a fresh copy of the style. Options: `tiles` (a TileJSON URL or
  XYZ templates), `maxzoom`, `glyphs`, `attribution`. OSM attribution is always kept.
- `setBaseBuildingsVisible(map, visible)` and `BASE_BUILDING_LAYER_ID`: the flat 2D building
  layer, ready for the 3D layer to hide in phase 4.
- Both examples now use `toytownStyle()`, and expose `window.map` for tests.
- Unit tests (`packages/core/test/style.test.ts`) check the exact palette, that every colour is a
  palette hex, round caps, casings wider than fills, the label set and font, attribution, the
  options, and the building toggle. 122 unit tests in total.
- Playwright screenshot tests (`e2e/`) for both examples. They wait for the style, tiles and
  glyphs to load, then check there are no console errors, the OSM attribution is shown and the
  base building layer exists, and compare against baselines. A CI job runs them in the same
  Docker image.
- Screenshots at z13, z15 and z17 for both towns are in `docs/style/`.

### Decisions

- **Font: Nunito, served by the VersaTiles glyph server.** Nothing on the OpenFreeMap glyph server
  is rounded. fonts.openmaptiles.org looks like it hosts Nunito, Varela Round and Fredoka, but it
  returns the same HTML redirect page for every font name, so it's effectively dead. The
  reasoning, and the self-hosting fallback, are in `docs/style.md`.
- **2D building colours** `#E8DCBE` (fill) and `#D9C9A3` (outline) are extra palette keys; the plan
  didn't specify building colours.
- **Line labels face the viewer** (`text-pitch-alignment: viewport`). At pitch 55 and z17, the
  map-aligned river labels were tiny and flattened.
- **Screenshot baselines are Linux-only** and generated in `mcr.microsoft.com/playwright:v1.63.0-noble`
  via Docker (`pnpm test:e2e`, `pnpm test:e2e:update`). The CI job uses the same image as a
  container, so local and CI rendering match. The examples are served from their `dist/` folders
  by a dependency-free static server (`e2e/serve.mjs`), so the host's macOS `node_modules` work
  inside the container.
- **`maplibre-gl` is now a peer dependency (`^5`)** of `toytown-gl`, and a dev dependency for
  types. `@playwright/test` was added at the root (it's on the approved stack).
- **Style validation.** I didn't add `@maplibre/maplibre-gl-style-spec` because it isn't on the
  approved list. The style is checked at runtime instead: the e2e tests fail on any MapLibre
  console error. Adding it as a dev dependency would allow a proper unit-level `validate()`.

### Known issues

- Screenshot baselines use live OpenFreeMap tiles, which update weekly. The tests allow a 3% pixel
  difference, but a big OSM edit in view could fail them; if so, run `pnpm test:e2e:update` and
  review the diff.
- VersaTiles' Nunito doesn't cover scripts such as Arabic or Devanagari, so those labels won't
  render (see `docs/style.md`).
- Chrome driven through the extension doesn't run `requestAnimationFrame` in a hidden tab, so the
  map never loads there. This explains the blank first captures in phase 0. Playwright runs
  headless and doesn't have this problem.
- CI still hasn't run (no remote yet).

## Phase 0: Scaffold (2026-09-29)

### Name check

- npm: `toytown-gl`, `@toytown/models` and `toytown` are all unpublished (registry 404).
- npm scope `@toytown`: no packages exist, but whether the scope is free can't be confirmed without
  a logged-in `npm org create toytown`. Needed from phase 4b.
- GitHub: no repo named `toytown-gl` exists anywhere. The `github.com/toytown` account is taken (a
  user account since 2010), so the repo should live under a personal account or a differently
  named org.

### What was done

- pnpm workspace (`packages/*`, `examples/*`) with TypeScript 6.0, tsup, Vite 8, Vitest 5,
  ESLint 10 (flat config + typescript-eslint) and Prettier.
- `packages/core` (`toytown-gl`): ESM + CJS + `.d.ts` build. Contains `parseManifest()`, a typed
  validator for `manifest.json` that enforces the fixed kit conventions.
- `packages/cli` (`@toytown/cli`, private, bin `toytown`): argument parsing and a `build-data` stub.
- `examples/waterford` and `examples/tramore`: Vite apps with a plain OpenFreeMap "liberty" map at
  pitch 55. Screenshots: `docs/phase0-waterford.jpg`, `docs/phase0-tramore.jpg`.
- Model kit tests (`packages/core/test/kit.test.ts`): the manifest parses; the files on disk match
  the manifest exactly; all 31 GLBs pass the Khronos glTF validator with 0 errors and 0 warnings
  (only 257 `BUFFER_VIEW_TARGET_MISSING` hints); material names match the manifest and the palette;
  models sit at Y=0 with origin at base centre and height matching `height_m`.
- Generator: added `assets/generator/requirements.txt` (pinned) and `check_reproducible.py`, which
  regenerates the kit into a temp dir and compares it with the committed kit.
- `.github/workflows/ci.yml`: a Node job (lint, build, test, typecheck) and a Python job (generator
  reproducibility).
- `LICENSE` (MIT), `assets/models/LICENSES.md` (CC0, per-file provenance), stub `README.md` with
  ODbL attribution requirements.

### Decisions

- **TypeScript 6.0, not 7.** typescript-eslint supports TypeScript `<6.1`. tsup's dts step needs
  `ignoreDeprecations: "6.0"` because it sets `baseUrl`.
- **maplibre-gl 5.x** as the project guidelines specify, even though 6.x is now the latest.
- **typescript-eslint pinned to ~8.70**, because 8.71 was younger than pnpm's minimum release age.
- **Tooling dependencies added** beyond the named stack: `gltf-validator` (the plan requires the
  glTF validator), `typescript-eslint`, `@eslint/js`, `eslint-config-prettier`, `globals`,
  `@types/node`. All are dev-only.
- **pnpm 12** is pinned in CI; `pnpm-workspace.yaml` allows only `esbuild` to run install scripts.
- **"Reproduces the kit" is checked semantically, not byte for byte.** With trimesh 4.12.2 the
  manifest, meshes, materials, accessors and binary buffers are identical. The GLB bytes differ
  only because this trimesh adds a transform-free `world` root node. No trimesh release installable
  on Python 3.9 gives byte-identical output (tried 4.5.3, 4.6.13, 4.8.3 and 4.12.2), so the kit was
  probably generated on a newer Python. The committed GLBs were left untouched.
- **Generator changes** (small, behaviour-preserving): the output dir can be overridden with
  `TOYTOWN_MODELS_OUT`, and regeneration no longer deletes `LICENSES.md`, `README.md` or dotfiles
  in `assets/models`. Before this change it wiped the whole directory.

### Known issues

- **CI has not run yet**: nothing has been pushed and there is no GitHub remote. `pnpm lint`,
  `pnpm build`, `pnpm test` (106 tests) and `pnpm typecheck` all pass locally. The phase's
  acceptance criterion ("passes in CI") is only confirmed after the first push.
- The Python CI job assumes Linux numpy produces the same float output as macOS for the
  reproducibility check. Unverified until CI runs.
- Headless Chrome (`--screenshot`) doesn't wait for MapLibre tiles, so phase 0 screenshots were
  taken in a real browser. Playwright screenshot tests (with a wait for `map.idle`) come in phase 1.
- OpenFreeMap's liberty style logs missing-sprite warnings (e.g. `gaelic_games`). These are harmless
  and go away when we switch to our own style in phase 1.
- Examples import `toytown-gl` from `dist/`, so run `pnpm build` before `pnpm dev` in an example.
