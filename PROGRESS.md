# PROGRESS.md

Updated at the end of each phase.

| Phase           | Status               | Notes                                                                      |
| --------------- | -------------------- | -------------------------------------------------------------------------- |
| 0 Scaffold      | done                 | Workspace, tooling, kit validation, CI, licences, examples.                |
| 1 Style         | done                 | toytown.json, Nunito labels, Playwright screenshot tests.                  |
| 2 Data          | done                 | build-data CLI, tag-map.json, both datasets, report.                       |
| 2.5 Spike       | approved             | deck.gl spike; model kit colour fix. See docs/spike/README.md.             |
| 3 Buildings     | done                 | Procedural buildings, worker meshing, minimal render layer.                |
| 4 Toon + models | done                 | Toon/ink rendering, fit/decorate/point, props, instancing.                 |
| 4b Model kit    | done                 | @toytown/models + zip, variants, kit CI, adding-models guide.              |
| 5 Performance   | done                 | LOD by zoom, lazy chunks, per-chunk culling, debug overlay, perf docs.     |
| 6 API + demos   | done                 | Themes, click/pick, overrides, packs, demos, README/GIF, templates, Pages. |
| 7 Release       | published 2026-09-30 | v0.1.0: toytown-gl, @toytown/models, @toytown/cli on npm; demos on Pages.  |

## After phase 7 (2026-09-30)

- **Skins (2026-10-01)**: two new built-in themes and live switching, for v0.2.0 (changeset added,
  not released).
  - **`sitcom`** is a TV-cartoon look: flat saturated walls, solid `#1A1A22` outlines (2.2 px
    edges, 0.3 m model hulls) and hard two-band shading. It's inspired by that style of cartoon,
    with no copied characters, names or landmarks.
  - **`pastel`**: soft walls, three gentle toon steps, faint tinted edges and no model outlines.
    The first pass was too washed out (the walls vanished into the ground), so saturation and
    shading were raised.
  - **`toy.setTheme(name | theme)`** switches without reloading the map. It recolours the base
    style in place (new `recolourStyle`, driven by the style's `toytown:colors` map), re-adds the
    open-space layers, swaps the layer's materials and lights, and re-plans the town, since
    colours are baked into chunk meshes and model geometry. A switch takes about 0.8 s on Tramore.
  - Theme `outline` gains `inkShade` and `inkMix` (the defaults keep the old look exactly), and
    `hullWidth: 0` hides model hulls.
  - **`winter`** (snowy ground and roofs, evergreen trees, cool light, windows glowing warm at
    half strength) and **`blueprint`** (every colour mapped to paper blue by lightness, solid
    white line work, flat shading) followed on request. Both are theme JSON only.
  - Nine more theme-only skins followed: `toybox`, `retro` (four Game Boy-style greens), `neon`,
    `vintage`, `sketch`, `autumn`, `christmas`, `halloween` and `shamrock`. They're generated
    from `default.json` by `scripts/make-skins.py`. Retro's first pass blended buildings into
    the ground (its two light greens are nearly equal), so walls and flat roofs use the darker
    shades.
  - The demo picker became a dropdown of all 15 skins (dark skins get the dark panel). The e2e
    test walks every skin in the dropdown and screenshots each on Tramore.
  - Earlier, the picker was buttons (Day / Night / Sitcom / Pastel / Winter / Blueprint) that switches live and keeps `?theme=`
    in the URL. A new e2e test covers the picker with sitcom and pastel baselines. The night
    baseline was refreshed for the new panel.

- **Released v0.1.0 (2026-09-30).** `toytown-gl`, `@toytown/models` and `@toytown/cli` are on npm
  with provenance, the GitHub release has the models zip, and the demos are live at
  https://bpowerie25.github.io/Toytown/. Checked afterwards from the real registry:
  `npx @toytown/cli build-data` for Castlemagner gives the same 190 buildings, and a fresh Vite
  project with the README quick start renders with no errors. Before tagging, the commit history
  was rewritten to brian@duhallowdigital.com and the repo made public. Two release-workflow
  problems showed up on the first real run and were fixed: the release notes were written into
  the repo, where the formatting check failed on them; and npm needs the CI token to have "bypass
  2FA", because the account uses two-factor authentication.

- **Castlemagner demo** (`examples/castlemagner`), added on request: a village in north County
  Cork. The bbox is `-8.845,52.155,-8.805,52.178` (the village relation 14597374 plus about
  1 km), giving 190 buildings (139 houses, 33 barns, 2 churches, 1 pub). Landmarks come from the
  data: Saint Mary's Church, Geoff's Pub and The Rectory. It's on the Pages landing page too.
- **Bug fixed: white roads were drawn tan since phase 6.** The theme colour map
  (`toytown:colors`) was built by matching hex values. `#FFFFFF` belongs to both `road` and
  `label_halo`, and my tie-break sent every shared colour to `road_casing`. So road, path and
  rail-sleeper fills, and every label halo, took the casing colour, in both themes. The tests
  didn't notice, because `#D9C9A3` is a valid palette colour, and the phase 6 baseline refresh
  captured the bug. The map is now built by what each property is (halo, casing, fill), and a
  new test checks that theming with `default` leaves the style unchanged. The screenshot
  baselines and the README GIF were regenerated.

- **Look pass (buildings looked ugly)**: you picked windows, clumsy models, and colours/shading
  as the problems.
  - **Window styles per category** in the theme: houses get framed windows and a front door on
    the street-facing wall; shops get shopfronts with a fascia; churches get tall arched windows;
    warehouses and factories get a high strip; generic buildings get sparse windows.
  - **Model fit**: models are scaled to fit _inside_ the footprint (0.75–1.3×), must cover 60% of
    it, and must be within 1.6× of the building's height (spires and towers exempt).
    **Attached buildings stay procedural** (`detachedOnly`), so terraces are consistent. Fewer
    hero models appear as a result.
  - **Colours and shading**: a softer palette, 5 toon steps plus a hemisphere fill, ink tinted
    from each face, and warmer flat roofs with a faint panel pattern.
  - **This departs from PLAN.md's colours at your request**: windows `#7EC8E3` → `#8EC5DA`, roofs
    `#D9644A` / `#5B6C8F` → `#C96B55` / `#66728C`. The night theme was re-derived from the new
    day colours.
  - `scripts/views.mjs` captures fixed comparison views for design reviews.

- **Open spaces** (you noticed that Tramore racecourse and People's Park were blank): OpenMapTiles
  has no racecourse or sports-ground areas, and our data only had buildings, POIs and trees.
  - **Data**: build-data now exports open spaces as `kind: "area"` polygons (and unclosed tracks
    as `kind: "track"` lines) with `name` and `sport`. They're classified by new `areas` rules in
    `tag-map.json`: racecourse, track, pitch_gaa, pitch_soccer, pitch_court, pitch, playground,
    golf_course, sports_ground, garden, park, cemetery and grass. Tree scatter is now driven by
    `areaTrees` in the tag map, so pitches and playgrounds stay clear. Waterford has 704 areas
    (9.4 MB, still under 10 MB) and Tramore 148.
  - **Plugin**: the areas are drawn as MapLibre layers under the roads: fills per category from
    the theme's new `areas` palette, mowing stripes and real-layout markings on pitches (soccer
    boxes; GAA 13, 20 and 45 m lines), tracks as a surface between two white rails (turf for
    horse racing, red for athletics and greyhounds), outlines, and name labels.
  - **Props**: the generator makes three new CC0 props: `goal_soccer` (120 tris), `posts_gaa`
    (60) and `playset` (224). The manifest's `attach.at` gains `pitch-ends` and `area-centre`.
  - **Tag map fix**: a `leisure=track` with `sport=horse_racing` is now a `track` (the running
    loop), not a `racecourse`; the racecourse is the grounds (`sports_centre` etc.).
  - New views in `scripts/views.mjs`: `tramore-racecourse`, `waterford-peoples-park` and
    `waterford-walsh-park`.
  - Known issues:
    - Where OSM maps a club's grounds and its pitch as separately named areas, both labels show
      (Walsh Park and "Páirc an Bhreatnaigh GAA").
    - Stripes and markings are skipped on pitches that fill less than 80% of their minimum
      rectangle.

- **Dependabot alerts fixed** (10 open: 7 × maplibre-gl, image-size, esbuild):
  - **maplibre-gl 5 → 6.11** (GHSA-jrc7-96c5-q579, an XSS in the attribution sanitiser; there's no
    5.x patch). You chose the upgrade over CLAUDE.md's "v5". The plugin's peer range is now
    `^5.0.0 || ^6.4.1`, so v5 users still work. v6 is ES-modules only: `import * as maplibregl`
    (no default export), and a bundler must point MapLibre at its worker once with
    `setWorkerUrl(workerUrl)` from `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` (Vite).
    The READMEs, demos and acceptance test do this. The script-tag example loads MapLibre as a
    module next to our classic UMD script, which never needed a `maplibregl` global. Rendering is
    unchanged: the screenshot baselines still pass.
  - **esbuild 0.27 → 0.28** and **image-size 0.7 → 2.0** through `overrides` in
    `pnpm-workspace.yaml` (both transitive: tsup/vite, and the deck.gl spike's texture-compressor).

- **`@toytown/cli` is published too** (your call; it was private since phase 2), so a new user's
  first step is `npx @toytown/cli build-data --bbox … --out town.geojson`, with no clone.
  - The CLI bundles the core's three.js-free source (`packages/core/src/data.ts`: classification,
    manifests, footprint geometry) instead of depending on `toytown-gl`. It's one 61 KB file plus
    `dist/defaults/` (the kit's tag map, manifest and Irish landmarks), 24 kB packed, and its only
    dependency is `flatgeobuf`. Bundling `toytown-gl`'s `dist` pulled in three.js (508 KB), because
    module-level three objects can't be tree-shaken.
  - The acceptance test packs all three packages and runs `npx toytown build-data` in the fresh
    project against a canned Overpass response on a local server (deterministic, no network).
  - `toytown build-data --help` prints help (it used to fail as an unknown option).
  - New guide: [docs/your-own-buildings.md](docs/your-own-buildings.md), for using your own models
    in an app without forking (by category, by OSM id with a pack, or a new category). The pack
    route was checked in the browser.

## Phase 7: Packaging and release (2026-09-29), ready but not published

### What was done

- **Builds**: `toytown-gl` ships ESM with types (`dist/index.js`, with `three` and `maplibre-gl`
  external and `dist/worker.js` loaded via `import.meta.url`) and a **self-contained UMD build**
  (`dist/toytown-gl.umd.js`, 939 KB minified, global `ToyTownGL`, three bundled). The UMD build
  inlines the chunk worker as a Blob (a worker IIFE built first and loaded as text); if the page
  blocks blob workers, meshing falls back to the main thread. `package.json` has `unpkg`,
  `jsdelivr`, `require` → UMD, `import` → ESM, and `VERSION` set from `package.json` at build time.
- **UMD proof**: `examples/umd`, a no-bundler page with plain script tags, served by the e2e
  server. An e2e test checks it draws Tramore with models and no errors.
- **Versions**: changesets (`.changeset/`, private packages not versioned). The first-release
  changeset was applied, so `toytown-gl` and `@toytown/models` are at **0.1.0**, with
  `CHANGELOG.md` files. Use `pnpm changeset` and `pnpm version-packages`.
- **Release workflow** (`.github/workflows/release.yml`, on `v*` tags):
  - checks the tag matches both versions and builds the release notes from the changelogs
    (`scripts/release-notes.mjs`);
  - lints, builds and tests;
  - zips the kit, runs `pnpm -r publish` with provenance, and creates a GitHub release with
    `toytown-models-0.1.0.zip`.
- **Acceptance** (`scripts/acceptance.mjs`, also a new CI job): packs both packages, runs
  `npm create vite@8` with vanilla-ts, installs the tarballs and MapLibre with npm, copies the
  **package README's quick-start code verbatim** into `src/main.ts`, follows the README's setup
  (copy the kit, add data), runs `npm run build` (which type-checks it) and renders it in Chrome.
  **It passes locally**: Tramore draws (9 chunks, 2,186 model instances) with no errors and no
  failed requests. This is the phase's acceptance criterion, verified before publishing.
- **Demo GIF**: `docs/demo.gif` is now 27.6 s covering both towns: Waterford by day to Reginald's
  Tower, Tramore by day, Tramore at night, Waterford at night. It's 160 frames at 480×300, 6.9 MB,
  with one shared 96-colour palette.
- **Package READMEs**: `toytown-gl` has its own README with absolute GitHub links (the repo
  README's relative links break on npmjs.com) and a LICENSE copy. `@toytown/models` has repository
  metadata. `docs/releasing.md` covers the workflow and one-time setup.

### Not done, and why

Publishing to npm, pushing the `v0.1.0` tag and the GitHub release all need your accounts and
decisions (see "Blocking" below). The Pages deploy needs a repository setting, and the workflow
has been in place since phase 6.

### Blocking: decisions for the owner

1. **npm scope**: create the `toytown` npm organisation for `@toytown/models` (`toytown-gl` is
   unscoped, and both names were still free on 2026-09-29).
2. **npm auth for CI**: an `NPM_TOKEN` repository secret, or npm trusted publishing for
   `release.yml`.
3. **Provenance needs a public repository.** The repo is private, so either make it public before
   tagging, or drop provenance (`NPM_CONFIG_PROVENANCE` in `release.yml` and
   `publishConfig.provenance` in both package.json files).
4. **The repo is also referenced publicly**: the package README's GIF and doc links point at
   `github.com/bpowerie25/Toytown`, which npm users can't see while it's private.
5. **Pages**: enable GitHub Pages (Source: GitHub Actions) and set `PAGES_ENABLED=true`.

### Decisions

- **The UMD build bundles three.js.** three r160+ no longer ships a global build, so a script-tag
  user couldn't provide `THREE` themselves.
- **`@changesets/cli` v3's `init` is interactive**, so `.changeset/config.json` was written by hand.
- **The demo is a GIF, not MP4**: GitHub renders GIFs in a README from the repo, and there's no
  video encoder locally (no ffmpeg).

## Phase 6: Public API, examples, docs (2026-09-29)

### What was done

- **The API as in the plan**: `ToyTown.style({ theme })`,
  `new ToyTown({ data, models, theme, lod, debug })`, `addTo`, `ready`,
  `setCategoryModel(category, url)`, `addPack(url)`, `on/off('click')`, `pick({x, y})`, `stats()`
  and `remove()`. See `docs/api.md`.
- **Themes as JSON**: `default` and `night` (background `#1B2238`, windows `#FFD166` that glow at
  full colour). Each covers the base-map palette, building palettes, lighting, outlines, model
  palette overrides and glow keys. The base style recolours through an explicit paint-property →
  palette-key map (`toytown:colors`), because road casing and building outlines share a default
  hex.
- **Click and pick**: raycasting through the last frame's camera into the visible chunk meshes (the
  `aBuilding` attribute maps a hit to its OSM id) and model instances (each instance buffer keeps
  its placements). Returns category, name, height, kind and an openstreetmap.org link.
- **`setCategoryModel`**: loads the user's GLB, measures its footprint for fitting, replaces the
  category's model and variants, and re-plans the town. Materials named by palette keys follow
  the theme; others keep their own colours. Before, they would have turned magenta.
- **`addPack`**: loads a pack `manifest.json` (models relative to the pack and landmark overrides
  by OSM id), merges the models and re-categorises landmark buildings. The generator now writes
  `assets/models/<pack>/manifest.json` (the Ireland one lists the Metal Man), and
  `check_reproducible.py` checks pack manifests too.
- **Demos**: full-screen Waterford and Tramore with a panel of landmark fly-to buttons
  (Waterford: Reginald's Tower, Christ Church Cathedral, House of Waterford Crystal, Bishop's
  Palace and People's Park; Tramore: the Metal Man, the Promenade, Holy Cross Church and the
  Racecourse), all ids and positions verified with Nominatim. There's also a day/night toggle, a
  link to the other town, click popups (category, height, "View on OpenStreetMap"), a pointer
  cursor over clickable things, and `?debug`. The shared UI is a private workspace package,
  `@toytown/example-shared`.
- **README rewrite**: a demo GIF (`docs/demo.gif`, 60 frames, 4.1 MB: a day orbit to Reginald's
  Tower, then night), what you get, a quick start, adding models, improving the tag mapping,
  documentation links, attribution and ODbL, and a roadmap. Plus `docs/api.md`,
  `CONTRIBUTING.md`, and issue templates (bug, wrong building type, model or pack request).
- **GitHub Pages**: `.github/workflows/pages.yml` builds a site (landing page with the GIF, plus
  both demos). The deploy job only runs when the repo variable `PAGES_ENABLED` is `true`.
- **Tests**: themes (hex only, key parity, night colours), the themed style (every colour from the
  night palette, casing and outline themed separately), pack manifests, and 4 new e2e tests
  (click popup with OSM link, landmark fly-to, a night screenshot, `setCategoryModel` +
  `addPack`). 483 unit tests and 8 e2e tests in total.

### Decisions

- **Only `window` glows at night.** Letting `glass` glow turned the glass office and apartment
  models into solid yellow blocks.
- **Custom-model colours**: GLB materials that aren't palette keys keep their own base colour
  (sRGB), so user models look as authored.
- **The README quick start uses the repo CLI** (`node packages/cli/dist/index.js build-data`),
  because the CLI isn't a published package; phase 7 publishes only `toytown-gl` and
  `@toytown/models`.

### Bugs found and fixed along the way

- **The model glow shader didn't compile under ANGLE**: I assumed `vColor` was a `vec3` at the end
  of three's toon fragment shader, and it isn't. It now mixes with `diffuseColor.rgb`. The
  screenshot tests' console-error check caught it.
- **The 3% screenshot tolerance had hidden real changes**: `--update-snapshots` only rewrites
  failing baselines, so phase 4b/5 look changes (e.g. variants) weren't reflected. All baselines
  were rewritten with `--update-snapshots=all`. Refresh deliberately with that flag after visual
  changes.
- **pnpm workspace issues**: the shared demo code first lived in a plain folder, which pnpm's
  strict layout can't resolve dependencies from, so it's now a package. And zsh expanded
  `workspace:*` as a glob.

### Known issues

- **GitHub Pages isn't enabled yet** (a repo setting). Pages on a private repo needs a paid GitHub
  plan. The workflow builds the site on every push, and deploys once enabled.
- Hover picking raycasts the visible chunks (a few ms); it's throttled to once per frame and
  skipped while the map moves.
- `addPack` landmark overrides only re-categorise buildings present in the data; they don't
  re-run classification.

## Phase 5: Performance and levels of detail (2026-09-29)

### What was done

- **LOD by zoom**, as in the plan: base style only below z14; plain extrusions at z14–15 (no
  windows or roofs); full procedural buildings from z15; hero models, props and trees from z16.
  Also model outline hulls from z17. The thresholds are configurable (`lod` option).
- **Three meshes per chunk from the worker**: `full` (kept buildings), `fitted` (the detailed
  version of buildings that models replace, shown at z15–16 so nothing disappears before the
  models appear) and `plain` (every building, flat-topped in its roof colour).
- **Lazy chunks**: a chunk is meshed when its bounding sphere enters the frustum, and its GPU
  buffers are disposed after 20 s out of view.
- **Per-chunk culling for models**: each model's `InstancedMesh` holds only the instances in
  visible, loaded chunks, rebuilt from precomputed per-chunk matrices when the visible set changes.
  Buffers grow as needed.
- **Debug overlay** (`debug: true`, or `?debug` in the examples): FPS, zoom, LOD level, draw calls,
  triangles, chunks, instances and the layer's CPU time.
- **`ready` now means "the current view is drawn"**: it resolves after a frame where the visible
  chunks and the models they need are loaded. Await it again after moving the map.
- **Perf harness** (`e2e/perf.spec.ts`, `PERF=1`): installed Chrome, real GPU, vsync off,
  continuous rotation at z16 / pitch 60 over Waterford, with laptop and CPU-throttled phone
  profiles. Results are in `docs/performance.md`.
- **Results on an Apple M5**: 274 → 513 fps (p95 4.9 → 3.2 ms) on the laptop profile. Draw calls
  73 → 46, and instances in view 16.4k → 7.6k. The phone profile (4× CPU throttle) runs at
  644 fps. The layer's CPU time is 0.35 ms per frame.
- Tests: LOD levels, the plain mesher, chunk splitting, tile chunks for tree-only tiles, chunk
  spheres and the disposal policy (473 unit tests). A new e2e test walks z13.5 → z16.5 checking
  the level, base-building visibility, instance counts and the overlay. The examples now open at
  z16.2, so models show.

### Decisions

- **Frame rate measured uncapped** (vsync off). With vsync the M5 sits at 60 fps even with the old
  code and 4× CPU throttling, which says nothing about headroom.
- **The M5 isn't a mid-range laptop**, so `docs/performance.md` gives estimates for mid-range
  laptop and phone GPUs, labelled as estimates, and draw calls and triangles as the portable
  numbers. The phone budget still needs a real-device check.
- **Instances are culled per chunk on the CPU** rather than with one InstancedMesh per chunk per
  model, which would mean hundreds of draw calls.
- The PROGRESS table was missing the 4b row: the same silent text-match failure that dropped
  rows before. Rows are now inserted by position.

### Known issues

- **Not measured on a real mid-range laptop or phone.** See `docs/performance.md`.
- The JS heap is up about 34 MB, because chunks keep CPU-side vertex arrays. That's deliberate
  until phase 6's picking decides between raycasting and GPU id picking.
- No distance-based LOD within a level, and no DPR cap. Both are listed as next steps in
  `docs/performance.md`.

## Phase 4b: Model kit as its own distributable (2026-09-29)

### What was done

- **`packages/models` (`@toytown/models`, CC0-1.0)**: an npm package of the kit, with GLBs,
  manifest, preview and licences, plus a README covering the conventions and use from three.js,
  Babylon.js, Unity (glTFast) and Godot. `pnpm --filter @toytown/models zip` builds
  `toytown-models-<version>.zip` for GitHub releases (51 files, 1.1 MB). The package copies from
  `assets/models`, which stays the single source of truth. It is not published yet (phase 7).
- **Variants**: 2 extra looks each for `house`, `shop` and `apartment`, in the generator:
  - houses: a hipped pink house with a porch, and a front-gabled yellow house with a bay window;
  - shops: a blue shop with a fascia sign, and a 3-storey shop with a striped awning;
  - apartments: a 5-storey block with balconies and a hipped roof, and a brick block with a long
    gable.

  They're listed in the manifest under `models.<category>.variants`. A stable hash of the OSM id
  picks the base model or a variant (`chooseVariant`), and fit uses that look's footprint. The
  renderer loads each variant as its own instanced mesh.

- **Hand-made models**: a pack can declare its own GLBs (Blender, Kenney, Quaternius…) in
  `assets/models/<pack>/pack.json`, as models or as `variant_of` a category. The generator
  measures them (materials, footprint, height) into the manifest with `"source": "hand"`, and
  regenerating never deletes them. Before this, it deleted every GLB. `test_generator.py` covers
  this.
- **Kit validation (`pnpm test`, in CI)**: every model, variant and prop is checked for:
  - the glTF validator;
  - the triangle budget (≤ 2,000 per model, ≤ 300 per prop);
  - materials matching the manifest and palette;
  - ground and centred origin;
  - plausible metric size;
  - **orientation** (any `door` material must be on the +Z half; 20 of 37 models have doors, all
    pass);
  - a `LICENSES.md` provenance row with CC0 or CC-BY.

  The CI models job also runs the generator tests, regenerates the kit (including `preview.png`),
  fails if the manifest and files disagree, and uploads the regenerated kit and the zip as
  artifacts.

- **`docs/adding-models.md`**: conventions, generating a model, making one in Blender (front on
  -Y, apply transforms, palette-key materials, glTF export), converting Kenney/Quaternius packs,
  the manifest fields, tag rules, regional packs and landmarks, and a checklist.

### Decisions

- **`tower_block` was over budget** (2,628 triangles). Its per-window boxes became one glass band
  per floor per side, bringing it to about 600.
- **Variants are nested in their category's manifest entry**, so the category list (used by
  `tag-map.json` validation) is unchanged. Manifest `version` stays 1: `variants`, `props` and
  `source` are optional additions and the conventions are unchanged.
- **The Vitest projects are listed explicitly** (`packages/core`, `packages/cli`), so the models
  package, which has no tests of its own, isn't picked up.
- **Caught by the new tests:** an edit that should have passed variants into the planning kit had
  silently not applied, so production would never have used variants. The variant tests found
  it.

### Known issues

- The `@toytown` npm scope still needs claiming before phase 7's publish.
- The Unity and Godot notes in the package README are from the engines' documented glTF
  conventions, not tested in those engines.

## Phase 4: Toon rendering and hero models (2026-09-29)

### What was done

- **Renderer rebuilt on a single scene frame** (`SceneFrame`): metres from the data's centre, with
  MapLibre's `mainMatrix` × frame computed in float64 into the three.js camera's projection. This
  lets standard `MeshToonMaterial`, lights, `InstancedMesh` and per-chunk frustum culling work.
  Pitch and bearing come for free from MapLibre's matrix. Details in `docs/rendering.md`.
- **Toon shading**: `MeshToonMaterial` with a 3-step gradient, one sun plus ambient (intensities
  scaled by π for three's Lambert term), and faces towards the sun showing exact palette hex.
- **Ink outlines** in `#2B2D42`: an edge shader on procedural buildings (barycentric edge
  coordinates, quad diagonals skipped, constant pixel width) and inverted hulls on hero models
  (a second `InstancedMesh` sharing instance matrices, with smooth welded normals). Ink and
  windows fade with ground resolution, which fixes phase 3's z16 moiré.
- **Hero models**: GLBs loaded lazily, only for models with a placement in view. Materials are
  resolved by palette key through the theme into vertex colours. One `InstancedMesh` per model.
- **Placement** (`placement.ts`, pure and unit-tested, run in the chunk workers before meshing):
  - `fit`: rectangularity, aspect checked against the frontage, scale tolerance, and the model
    placed at the centroid facing `front`. Fitted buildings are left out of the mesh.
  - `decorate`: props attached by manifest rules.
  - `point`: POI models placed only on free spots.
  - Trees are instanced with hash-based scale and rotation.

  Tolerances are in the theme (`models.fit`).

- **Prop set in the generator**: `awning`, `red_cross`, `spire` and `canopy` in
  `assets/models/props/`, all within 300 triangles. Each records in the manifest which
  categories it decorates and how it attaches. `parseManifest` validates `props`, and the kit
  tests cover them (validator, budget, materials).
- **Globe projection**: 3D draws only once MapLibre's globe-to-mercator transition is complete;
  until then the flat base buildings show. There's an e2e test for this.
- **Examples** load the kit through a small inline Vite plugin (`examples/kit-models.ts`) that
  serves `assets/models` in dev and copies it into the build.
- **build-data**: standalone POIs now carry a street-facing `front`. Datasets were rebuilt.
- **Numbers**: in Waterford, 9,561 of 26,870 buildings fit a hero model. There are 296 awnings,
  27 spires, 12 red crosses, 6 canopies and 3,839 trees.
- Tests: 324 unit tests (placement, scene frame, instance orientation, globe gate, mercator, edge
  flags, props) plus 3 e2e tests (both towns with model-load assertions, and globe). The first
  phase 4 screenshots and docs are in `docs/toon/`.

### Decisions

- **One scene frame instead of per-chunk matrices.** Phase 3's per-chunk custom shader couldn't use
  `MeshToonMaterial`, lights or instancing. Float32 relative to a city-centre origin is precise
  enough, and the frame projection is still combined in float64.
- **Model colours as vertex colours** from the theme, rather than one material per palette key.
  One draw call per model type, and themes still recolour the kit by palette key.
- **Fit aspect is measured against the frontage** (across the front), following the spike's
  finding that models rotated to face the street otherwise got the wrong proportions.
- **Landmarks (`landmark_*`) always fit**, with the scale clamped.
- **Placement and chunk order are fixed** (chunk key, then model name and id). Without this,
  overlapping models drew in whatever order the workers finished, and screenshots differed by 5%
  between runs.
- **Playwright expect timeout raised to 30 s**: software WebGL in the container takes seconds per
  frame for a whole town of instanced models.

### Bugs found and fixed along the way

- **The core imported `maplibre-gl` at runtime** (for `MercatorCoordinate`), which broke plain
  Node, including the CLI. Vitest's interop hid it. The core now computes mercator itself
  (`toMercator`, `mercatorPerMetre`) and imports MapLibre for types only. CI now smoke-tests the
  built core and CLI in Node.
- **`LocalProjection` used 110,574 m per degree of latitude** (the ellipsoid's equatorial value),
  while MapLibre's mercator is spherical (111,319.5 m/°). Meshes would have been squashed 0.67%
  north–south against the base map (up to about 3 m at a chunk edge). It now uses MapLibre's
  sphere, which is also closer to the real meridian degree at 52°N.
- **The kit GLBs have no normals**, so the loader now computes flat ones.
- **GLSL `smoothstep` with equal edges** produced NaNs in the ink shader, turning walls black. The
  edge width is now clamped above 0.
- **Lazy-loading race**: `ready` could resolve before models whose load a `moveend` had already
  started. Each model group now keeps its load promise.

### Known issues

- **Model height isn't checked by fit.** The office hero (24.8 m) can tower over 3-storey
  neighbours. A height tolerance would need better default heights first.
- **Streets of identical hero houses.** Phase 4b adds 2–3 variants per common category.
- **Performance is unmeasured on real hardware.** A single `house` instanced mesh holds 9.5k
  instances (about 2.3M triangles, plus hulls), always drawn. Phase 5 adds LOD, per-chunk
  instancing and the FPS overlay.
- **Picking and click popups** are phase 6.

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

- CI first ran on 2026-09-29 after the push to github.com/bpowerie25/Toytown, and all three jobs
  passed (lint/test/build, Playwright screenshots, generator reproducibility), which meets this
  phase's acceptance criterion.
- Headless Chrome (`--screenshot`) doesn't wait for MapLibre tiles, so phase 0 screenshots were
  taken in a real browser. Playwright screenshot tests (with a wait for `map.idle`) come in phase 1.
- OpenFreeMap's liberty style logs missing-sprite warnings (e.g. `gaelic_games`). These are harmless
  and go away when we switch to our own style in phase 1.
- Examples import `toytown-gl` from `dist/`, so run `pnpm build` before `pnpm dev` in an example.
