# Adding models

> Just want your own building on your own map? You don't need to change the kit: see
> [your-own-buildings.md](your-own-buildings.md). This page is for adding models to the shared kit.

The model kit lives in `assets/models/`. `assets/generator/generate_models.py` is the source of
truth for the built-in models, and it writes `manifest.json`. You can add models in three ways:
generate them, make them by hand (e.g. in Blender), or bring them from a CC0 pack such as Kenney
or Quaternius. Whichever way you choose, the model must follow the kit conventions, and the tests
check that it does.

## The conventions

| Rule                                                                                                                                | Why                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Y-up, metres**                                                                                                                    | One unit is one metre, so footprints and heights compare with real buildings.   |
| **Front faces +Z**                                                                                                                  | The door and shopfront side. The renderer turns +Z towards the street.          |
| **Origin at the base centre, no node transforms**                                                                                   | The model sits on the ground at y = 0 and is placed by its centre.              |
| **One material per palette key**, named exactly like a key in `manifest.json` → `palette` (e.g. `wall_cream`, `roof_red`, `window`) | Colours come from the theme by material name, so themes recolour the whole kit. |
| **No textures**                                                                                                                     | Flat colours only; toon shading does the rest.                                  |
| **Triangle budget**: at most 2,000 per model, 300 per prop                                                                          | Many copies are drawn at once (one `InstancedMesh` per model).                  |

`pnpm test` checks every GLB for all of these. It runs the Khronos glTF validator and checks the
triangle budget, that materials match the manifest and the palette, that the model sits on the
ground centred on the origin, plausible metric sizes, that any `door` material is on the +Z half,
and that the file has a row in `LICENSES.md`. If you need a new colour, add it to `PALETTE` in
the generator first.

## 1. Generate it (preferred for the built-in kit)

Add a builder to `generate_models.py`. The generator works Z-up, with the front on **-Y**, and
converts to Y-up / +Z on export:

```python
def kiosk():
    m = Model("kiosk")                                  # pack defaults to "generic"
    m.box(3, 2, 2.6, color="wall_mint")                 # w (x), d (y), h (z), base at z = 0
    m.box(2.4, 0.2, 1.0, 0, -1.05, 1.2, "glass")        # a window on the front (-y) face
    m.gable(3.3, 2.3, 0.9, z=2.6, color="roof_red")
    return m
```

Then register it:

```python
BUILDERS = [
    ...
    (kiosk, ["building=kiosk"]),                        # suggested OSM tag matches
]
VARIANTS = {"house": [house_2, house_3], ...}           # or add it as a variant of a category
```

Run it and check it:

```sh
.venv/bin/python assets/generator/generate_models.py      # rewrites the GLBs, manifest.json and preview.png
.venv/bin/python assets/generator/check_reproducible.py   # what CI runs
pnpm test
```

Add a row for the new file to `assets/models/LICENSES.md`.

## 2. Make it by hand (Blender)

1. Model in **metres**: Scene Properties → Units → Metric, unit scale 1.0.
2. **Put the front on Blender's -Y side.** Blender's Front view (numpad 1) looks at the -Y face.
   The glTF exporter turns Blender's Z-up into Y-up, and -Y becomes glTF's +Z.
3. Put the **origin at the centre of the base**: the base on z = 0, centred on x = 0, y = 0.
   Then **apply all transforms** (Ctrl+A → All Transforms), so no node carries a transform.
4. Use **one material per palette key**, named exactly like the key. Set Base Color to the
   palette colour, so the model looks right in other engines too. Don't use textures.
5. Export **glTF Binary (.glb)** with _+Y Up_ on (the default), _Apply Modifiers_ on, and
   materials exported. Save it as `assets/models/<pack>/<name>.glb`.
6. Declare it in `assets/models/<pack>/pack.json`:

   ```json
   {
     "models": {
       "kiosk": { "file": "mypack/kiosk.glb", "osm_tags": ["building=kiosk"] },
       "house_cottage": { "file": "mypack/house_cottage.glb", "variant_of": "house" }
     }
   }
   ```

   `variant_of` adds the model as another look for an existing category. Otherwise it becomes its
   own model (and category).

7. Run the generator. It reads each `pack.json`, measures the GLB (materials, footprint, height),
   and adds it to `manifest.json` with `"source": "hand"`. Regenerating never deletes hand-made
   files.
8. Add a row to `LICENSES.md`, then run `pnpm test`.

## 3. From Kenney, Quaternius and other packs

[Kenney](https://kenney.nl/assets) and [Quaternius](https://quaternius.com) publish CC0 building
packs that are a good starting point. Contributed models must be **CC0-1.0 or CC-BY-4.0**. For
CC-BY, credit the author in `LICENSES.md`; nothing else is accepted.

1. Import the model into Blender (File → Import → glTF, FBX or OBJ).
2. **Check the scale.** A door should be about 2 m tall. Pack models are often in arbitrary
   units; scale the object, then apply the scale.
3. **Replace the materials.** Kenney's city kits colour everything from one texture atlas, so
   select the faces of each colour and assign palette-key materials instead (step 4 above).
   Remove any leftover textures and unused materials.
4. Check the triangle count (the Statistics overlay) is at most 2,000, and decimate if not.
5. Continue from step 2 of the Blender section: front on -Y, origin, apply transforms, export,
   `pack.json`, generator, `LICENSES.md` with the source URL and author, then `pnpm test`.

## The manifest entry

The generator writes the entry, so you never edit `manifest.json` by hand:

| Field         | Meaning                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `file`        | Path relative to `assets/models/`.                                                          |
| `pack`        | `generic` for the built-in kit, otherwise the regional pack folder.                         |
| `osm_tags`    | Suggested OSM matches, for people reading the manifest. Classification uses `tag-map.json`. |
| `materials`   | Palette keys used by the model.                                                             |
| `footprint_m` | Width (x) × depth (z) in metres. The renderer fits models to building footprints with this. |
| `height_m`    | Height in metres.                                                                           |
| `variants`    | Other looks for the category, picked per building by a hash of its OSM id.                  |
| `source`      | `"hand"` for hand-made models; absent for generated ones.                                   |

### Props

Props live under `props` in the manifest, with `categories` and an `attach` rule instead of
`osm_tags`. Building props (`awning`, `red_cross`, `spire`, `canopy`) decorate procedural
buildings of those categories: `at` is `front-wall`, `front-edge` or `front-ground`. Open-space
props name area categories from `tag-map.json`'s `areas` instead: `at: "pitch-ends"` puts one at
each end of a pitch, facing in (`goal_soccer`, `posts_gaa`); `at: "area-centre"` puts one in the
middle (`playset`). Their front faces into the pitch or area.

## OSM tag rules

A model is only used if some buildings are classified into its category. Add or adjust rules in
`assets/models/tag-map.json` (see [tag-mapping.md](tag-mapping.md)):

```json
{ "category": "kiosk", "priority": 60, "when": ["building=kiosk"] }
```

`parseTagMap` rejects rules whose category isn't a model in the manifest. Run `pnpm data:build`
and check `docs/classification-report.md` to see how many buildings now use your model. Whether a
building gets the model or keeps its procedural shape with props is decided by the fit rules in
the theme (`models.fit`; see [rendering.md](rendering.md)).

## Regional packs

A pack is a folder under `assets/models/` for region-specific content, such as `ireland/`:

- **`pack.json`**: hand-made models for the pack, as above.
- **`landmarks.json`**: overrides by OSM id. For example, the Metal Man in Tramore:

  ```json
  {
    "pack": "ireland",
    "landmarks": [{ "osm": "way/46694890", "category": "landmark_metal_man", "verified": "…" }]
  }
  ```

  Look the id up with Nominatim or the OSM API rather than trusting names, and note how you
  checked it in `verified`. Name landmark models `landmark_*`: they are always placed, whatever
  the footprint's shape.

- **Generated landmark models**: give the builder a pack, e.g. `Model("landmark_metal_man",
pack="ireland")`.
- **Use a pack** when building data with `toytown build-data … --pack assets/models/<pack>/landmarks.json`.
  The Ireland pack is loaded by default.

Everything in `assets/models/`, packs included, ships in the `@toytown/models` npm package and
in the models zip on each GitHub release.

## Checklist

- [ ] The model follows the conventions: Y-up, metres, +Z front, base-centre origin, no
      transforms, palette-key materials, within budget.
- [ ] It's generated, or declared in a `pack.json`.
- [ ] The generator has been run, and `manifest.json` and `preview.png` are updated.
- [ ] There's a row in `LICENSES.md` (CC0-1.0 or CC-BY-4.0, with the source).
- [ ] If it's a new category, there's a tag rule in `tag-map.json`.
- [ ] `pnpm test` passes, and `check_reproducible.py` passes.
