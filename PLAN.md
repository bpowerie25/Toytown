# PLAN.md: toytown-gl build phases

Do one phase per session. Read the project guidelines first and update `PROGRESS.md` at the end of each phase.

## Phase 0: Scaffold

- Check the npm and GitHub name availability for `toytown-gl` and `@toytown/models`, and report back before continuing.
- Set up the pnpm workspace, TypeScript, tsup, Vite, Vitest, ESLint and Prettier, with the repo layout from the project guidelines.
- Confirm `assets/models/manifest.json` loads and all GLBs pass the glTF validator. Run `python assets/generator/generate_models.py` and confirm it reproduces the kit.
- Add the GitHub Actions workflow for lint, test and build, plus LICENSE (MIT), `assets/models/LICENSES.md` (CC0) and a stub README.

Acceptance: `pnpm build && pnpm test` passes in CI.

## Phase 1: Cartoon base style

Create `packages/core/src/style/toytown.json`, a MapLibre style over OpenMapTiles-schema vector tiles:

- Use this palette: land `#F4EBD0`, water `#7EC8E3`, parks/grass `#A8D5A2`, woods `#6BAA5E`, sand/beach `#F6E3B4`, roads `#FFFFFF` with casing `#D9C9A3`, major roads `#FFE8A3` with casing `#E0B85C`, rail `#B8B2A7`, labels `#2B2D42` with halo `#FFFFFF`.
- Round line caps and joins, exaggerated road widths, minimal labels (towns, major roads, water bodies), and a rounded, friendly font (e.g. a Google Font that has a glyph server; document the choice).
- Hide the base style's own building layer when the 3D layer is active.

Acceptance: the example shows Waterford City in the new style, and screenshots go into `docs/`.

## Phase 2: Building data pipeline (`packages/cli`)

`toytown build-data --bbox <w,s,e,n> --out <file>`:

1. Query Overpass for `way["building"]` and `relation["building"]` in the bbox, plus POI nodes (`amenity`, `shop`, `office`, `tourism`, `historic`, `leisure`, `craft`) in the same bbox. Respect Overpass rate limits, cache raw responses in `.cache/`, and support `--source pbf <file>` as an alternative that reads a Geofabrik Ireland extract.
2. Resolve each building to a polygon, including multipolygon relations with holes.
3. **Classify** every building into a category with a documented, data-driven mapping in `tag-map.json`. The rules are:
   - Use the building's own tags first (`building=hospital|church|school|house|terrace|apartments|retail|commercial|office|industrial|warehouse|hotel|...`, `amenity=*`, `shop=*`, `office=*`).
   - Then use any POI node that falls inside the footprint (point-in-polygon).
   - Then use the height and levels heuristics (`building:levels`, `height`).
   - Fall back to `generic`.
4. Categories come **from the model manifest**, not a hard-coded list. Each model in `manifest.json` has an `osm_tags` array of suggested matches. Turn these into a proper rule format in `tag-map.json`, with priority, conditions (e.g. `building:levels>=8`) and footprint-area conditions. Anything unmatched becomes `generic`. Landmark overrides by OSM id live in packs, e.g. `packs/ireland/landmarks.json` maps the Metal Man in Tramore to `landmark_metal_man`. Verify the OSM id via Nominatim rather than trusting names.
5. Compute the height (from `height`, else `building:levels × 3`, else a per-category default) and the orientation (the angle of the longest edge of the minimum rotated rectangle). Also compute the front-facing direction toward the nearest `highway` way.
6. Output compact GeoJSON, plus an optional binary/FlatGeobuf file for large areas, with `{id, category, height, levels, orientation, front, name?}`.
7. Also export trees (`natural=tree`, plus scattered positions inside `leisure=park` / `landuse=grass`, seeded and deterministic).

Bounding boxes to use. These are approximate, so confirm them against Nominatim, adjust to cover the built-up area, and note the final values in the example READMEs:
- Waterford City: roughly `-7.16,52.23,-7.05,52.28`
- Tramore: roughly `-7.17,52.15,-7.12,52.18`

Acceptance: both datasets build; `docs/classification-report.md` lists counts per category for each town and the 30 most common unmapped tag combinations, so the mapping can be improved.

## Phase 2.5: Visual spike (throwaway)

Before building the custom renderer, check that the look works:

- In `examples/spike/`, render the phase 1 style with deck.gl's `ScenegraphLayer` (via `@deck.gl/mapbox` `MapboxOverlay`). Place 20–30 kit models on real classified buildings from the phase 2 Waterford data, around the Quay and city centre.
- Screenshot at zoom 15, 16 and 17, pitch 55, and put the images in `docs/spike/`.
- Note any problems with scale, colour or orientation, and fix them in `generate_models.py` (not by hacking the renderer).

Acceptance: I review the screenshots and approve before phase 3. If phases 3–4 later prove too hard, this spike becomes the v1 renderer fallback.

## Phase 3: Procedural toy buildings for every footprint

This phase covers *every* building, not just ones with hero models. In `packages/core/src/geometry/`:

- Extrude each footprint to its height with slightly bevelled or rounded top edges.
- For roofs, use a gable or hip roof when the footprint is roughly rectangular (fits its minimum rotated rectangle within ~15%) and the category is residential, pub, church, or school. Everything else gets a flat roof with a small parapet. Don't attempt straight-skeleton roofs on complex polygons in v1.
- Add window strips via a procedural shader (UV by wall length and height, not per-window geometry). Windows are `#7EC8E3`. Wall colour comes from a deterministic per-building hash into a category palette. For example, terraces cycle `#F2B5A7`, `#F6D57A`, `#A9CBE8`, `#BFE3C9`, `#F4E9D8` (Irish-town coloured terraces). Roofs are `#D9644A` or `#5B6C8F`.
- Build the geometry in a **Web Worker**, merged per tile or chunk into a few `BufferGeometry` objects. Never create one mesh per building.

## Phase 4: Toon rendering + hero models

- Write a three.js custom layer for MapLibre that shares the WebGL context and uses a correct Mercator-to-world matrix. Handle pitch and bearing, and handle MapLibre v5 globe projection gracefully (disable 3D or fall back to a flat projection at low zoom).
- Use `MeshToonMaterial` with a 3-step gradient map, one directional light plus ambient, and outlines via the inverted-hull method on hero models and an edge shader on procedural buildings. Outline colour is `#2B2D42`.
- Hero models: load the GLBs listed in the manifest. They are Y-up, in metres, with the front facing +Z, the origin at the base centre, and one material per colour named by palette key. Swap each material for a toon material, with the colour resolved **through the active theme**, so themes can recolour the whole kit without new GLBs. Load models lazily, only for categories present in view.
- **Fit strategy.** Real footprints rarely match a model's shape, so each model placement needs a rule:
  - `fit`: if the footprint's minimum rotated rectangle is within a configurable aspect and area tolerance of the model's `footprint_m`, hide the procedural building. Then place the model at the centroid, uniformly scaled (clamped 0.6×–1.6×), rotated to face `front`.
  - `decorate`: otherwise, keep the procedural building and attach category **props** to it, e.g. a red cross sign for hospitals, an awning for shops and cafés, a spire for churches, a canopy for petrol stations. Build these as a small separate prop set in the generator.
  - `point`: for POIs with no footprint (e.g. a café that is just a node), place the model at the node if nothing else occupies the spot.
- Use `InstancedMesh` per model type.
- Use `InstancedMesh` per model type.
- Trees are instanced, with slight random scale and rotation.

## Phase 4b: Model kit as its own distributable

- Publish the kit as a separate npm package (`@toytown/models`) and also as a zip in GitHub releases, so it can be used outside this plugin (three.js, Babylon, Unity, Godot).
- Keep `assets/generator/generate_models.py` as the source of truth for the built-in models. Extend it with the props from phase 4, and add 2–3 variants per common category (house, shop, apartment) selected by a deterministic hash of the OSM id, so streets don't look cloned.
- Validate every GLB in CI: glTF validator, triangle budget (≤ 2,000 per model, ≤ 300 per prop), and correct orientation, units and origin. Regenerate `preview.png` in CI and fail if the manifest and files disagree.
- Write `docs/adding-models.md`, explaining how to add a model (including one made in Blender or taken from Kenney or Quaternius packs), its manifest entry, OSM tag rules, and how to create a regional pack.

## Phase 5: Performance + LOD

- Zoom < 14: base style only.
- Zoom 14–15: plain extruded procedural buildings, no windows, no roofs.
- Zoom ≥ 15: full procedural buildings.
- Zoom ≥ 16: hero models and trees.
- Use frustum culling per chunk, lazily load chunks, and dispose of GPU resources on removal.
- Budget: 60 fps on a mid-range laptop and ≥ 30 fps on a mid-range phone for full Waterford City at zoom 16, pitch 60. Add an FPS/draw-call debug overlay behind a flag, and record the results in `docs/performance.md`.

## Phase 6: Public API, examples, docs

The API should look like this:

```ts
import { ToyTown } from 'toytown-gl';
const map = new maplibregl.Map({ container: 'map', style: ToyTown.style(), center: [-7.11, 52.26], zoom: 16, pitch: 55 });
const toy = new ToyTown({ data: '/data/waterford.geojson', models: '/models/manifest.json', theme: 'default' });
toy.addTo(map);
toy.setCategoryModel('hospital', '/models/my-hospital.glb'); // user overrides
toy.addPack('/packs/ireland/manifest.json');                 // optional regional pack
toy.on('click', (building) => { /* category, name, osm id */ });
```

- Themes are JSON (palette + material settings). Ship `default` and one alternative, e.g. `night` with a background of `#1B2238` and windows of `#FFD166`.
- The examples are full-screen Waterford and Tramore demos with a fly-to between the landmarks and a click popup showing the building category and OSM link.
- Write a README with a GIF, a quick start, "add your own model", "improve the tag mapping", attribution requirements, and a roadmap.
- Include CONTRIBUTING.md, issue templates, and a GitHub Actions workflow for lint, test, and build, plus GitHub Pages deployment of the examples.

## Phase 7: Packaging + release

- Publish `toytown-gl` (ESM and UMD builds, with types) and `@toytown/models` to npm, with provenance enabled. Also attach a models zip to each GitHub release.
- Deploy the examples to GitHub Pages, and produce a 20–30 second demo GIF or MP4 of Waterford and Tramore for the README.
- Use semantic versioning and a changelog (changesets). Tag `v0.1.0`.

Acceptance: `npm i toytown-gl` plus the README quick start works in a fresh Vite project.
