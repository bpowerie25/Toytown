# Your own buildings

You've designed a building and want it on your toy-town map. You don't need to fork this repo:
the plugin can load your models at runtime. There are four routes. Pick the one that matches what
you want to change:

| You want to…                                                         | Use                                                     | Rebuild data? |
| -------------------------------------------------------------------- | ------------------------------------------------------- | ------------- |
| Replace the look of a whole category (every `hospital`, every `pub`) | [`toy.setCategoryModel()`](#2-replace-a-whole-category) | No            |
| Put your model on one specific building (your town hall)             | [a pack with a landmark](#3-one-specific-building)      | No            |
| Add a new kind of building (every `building=kiosk`)                  | [a tag rule plus a model](#4-a-new-kind-of-building)    | Yes           |
| Share it with everyone in the built-in kit                           | [a pull request](#5-add-it-to-the-shared-kit)           | Yes           |

## 1. Design it

Any 3D tool that exports glTF binary (`.glb`) works; Blender is free and is what these steps
assume. Your model must follow the kit conventions:

- **Y-up, in metres.** A door is about 2 m tall, and a storey about 3 m.
- **The front faces +Z.** That's the door and shopfront side; the plugin turns it towards the
  street. (Blender's glTF exporter converts Blender's Z-up, so model the front facing **-Y** in
  Blender.)
- **The origin is at the centre of the base,** and the model sits on the ground (y = 0). Apply
  all transforms before exporting.
- **Flat colours, no textures.** The toon shading adds the light and dark bands and the ink
  outline.
- **Keep it light**: up to 2,000 triangles (the plugin draws many copies at once).

**Colours.** There are two options, and you can mix them in one model:

- **Themed**: name a material after a palette key (`wall_cream`, `roof_red`, `window`, `door`,
  `glass`… the full list is `palette` in `models/manifest.json`). It takes the theme's colour,
  so it turns into a lit window at night and matches the rest of the kit.
- **Your own**: any other material name keeps the base colour you gave it in Blender.

Export with File → Export → glTF 2.0, format **glTF Binary (.glb)**, with **+Y Up** ticked and
"Apply Modifiers" on. Put the file with your other static files, e.g. `public/models/my/`.

Step-by-step Blender instructions, including converting Kenney or Quaternius models, are in
[adding-models.md](adding-models.md#2-make-it-by-hand-blender).

## 2. Replace a whole category

```ts
await toy.setCategoryModel('hospital', '/models/my/hospital.glb');
```

Every building classified as `hospital` now gets your model instead of the kit's (and its
variants). The categories are the model names in `models/manifest.json`: `house`, `terrace`,
`shop`, `pub`, `church`, `school`, `hospital` and so on. Clicking a building (`toy.on('click', …)`)
tells you its category.

The model's footprint and height are measured from the file. Like the kit's models, it only
replaces a building whose footprint it fits: it's scaled between 0.75× and 1.3×, must cover most
of the footprint, and must be close to the building's height. Other buildings in the category keep
their procedural toy shape. The limits are in the theme's `models.fit` (see
[rendering.md](rendering.md#placement-fit-decorate-point)), so a custom theme can loosen them.

## 3. One specific building

To put your model on one building, such as your town hall, make a small **pack**: a folder with
your GLB and a `manifest.json`, and a **landmark** that assigns the model to the building's OSM
id.

**Find the OSM id.** Click the building on your map (`toy.on('click', (b) => console.log(b.osm))`),
or use "Query features" on [openstreetmap.org](https://www.openstreetmap.org). It looks like
`way/46694890`.

**Write the pack** (`public/models/my-town/manifest.json`):

```json
{
  "version": 1,
  "pack": "my-town",
  "palette": {
    "wall_cream": "#F3E6C8",
    "roof_slate": "#66728C",
    "window": "#8EC5DA",
    "clock_gold": "#E0B040"
  },
  "models": {
    "landmark_town_hall": {
      "file": "town_hall.glb",
      "materials": ["wall_cream", "roof_slate", "window", "clock_gold"],
      "footprint_m": [24, 16],
      "height_m": 18,
      "osm_tags": []
    }
  },
  "landmarks": [{ "osm": "way/123456789", "category": "landmark_town_hall" }]
}
```

- `file` is relative to the pack's `manifest.json`.
- `materials` lists your model's material names, and every one of them must be in the pack's
  `palette` with a hex colour. Keys the kit also has (`window`) still follow the theme; your own
  keys (`clock_gold`) use the colour you give here.
- `footprint_m` is the model's width (x) and depth (z) in metres, and `height_m` its height.
- **Name it `landmark_…`.** Landmark models are always placed on their building, scaled to fit the
  footprint, whatever the fit rules say.

**Load it:**

```ts
await toy.addPack('/models/my-town/manifest.json');
```

A pack can hold as many models and landmarks as you like. The built-in Irish pack
(`models/ireland/manifest.json`, with the Metal Man in Tramore) is a working example.

## 4. A new kind of building

The categories come from the data file, so a new kind of building (a `kiosk` for every
`building=kiosk`) needs a tag rule and a data rebuild with [`@toytown/cli`](../packages/cli/README.md).

1. Copy the kit's `tag-map.json` and `manifest.json` (in `node_modules/@toytown/models/models/`,
   or `assets/models/` in this repo) somewhere of your own.
2. Add your model to your copy of the manifest (an entry like the one above, under `models`) and
   a rule to your copy of the tag map:

   ```json
   { "category": "kiosk", "priority": 60, "when": ["building=kiosk"] }
   ```

   The rule format is in [tag-mapping.md](tag-mapping.md#rule-format).

3. Rebuild your data with them:

   ```sh
   npx @toytown/cli build-data --bbox <w,s,e,n> --out public/data/town.geojson \
     --tag-map my/tag-map.json --manifest my/manifest.json
   ```

4. Load the model at runtime with `toy.setCategoryModel('kiosk', '/models/my/kiosk.glb')`, or
   serve your manifest as the `models` option.

Until a model is loaded, buildings in a new category are drawn as procedural toy buildings.

## 5. Add it to the shared kit

If your model is generic (a fire station, a library, a lighthouse) and you're happy to license it
**CC0** or **CC-BY-4.0**, please contribute it. [adding-models.md](adding-models.md) covers
generating or hand-making it, the tests it must pass, and the licence record, and
[CONTRIBUTING.md](../CONTRIBUTING.md) covers the pull request. Region-specific models and
landmarks go in a regional pack (like `assets/models/ireland/`), so they stay out of the
generic kit.
