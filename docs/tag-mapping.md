# Tag mapping

Every OSM building is given a **category**. Categories are the model names in
`assets/models/manifest.json` (`house`, `pub`, `church`...), plus the fallback `generic`. The
mapping is data, not code: it lives in `assets/models/tag-map.json` and in landmark packs such as
`assets/models/ireland/landmarks.json`. `parseTagMap()` rejects any rule whose category isn't in
the manifest.

## Order of evaluation

For each building footprint, the classifier (`createClassifier()` in `toytown-gl`) takes the first
of these that gives an answer:

1. **Landmark override** by OSM id, from packs (e.g. `way/46694890` → `landmark_metal_man`).
2. **Strong rules** on the building's own tags (e.g. `building=church`, `amenity=pub`).
3. **POI nodes inside the footprint** (point-in-polygon), matched against the same rules. If there
   are several POIs, the highest-priority rule wins.
4. **Weak rules** on the building's own tags. These are vague building types such as
   `building=retail` or `commercial`, which a POI inside should be allowed to refine. A
   `building=retail` containing a pharmacy becomes `pharmacy`; with no POI it becomes `shop`.
5. **Heuristics** on levels, height and footprint area (e.g. a small untagged building is
   probably a `house`).
6. The **fallback**, `generic`.

Within a stage, the highest `priority` wins. On a tie, the rule listed first wins.

## Rule format

```json
{
  "category": "tower_block",
  "priority": 85,
  "when": ["building=apartments|flats|residential", "@levels>=8"],
  "weak": false,
  "note": "optional explanation"
}
```

Every condition in `when` must hold. The condition syntax:

| Condition                  | Meaning                                            |
| -------------------------- | -------------------------------------------------- |
| `building=house`           | tag equals the value                               |
| `building=house\|detached` | tag equals any of the values                       |
| `shop=*`                   | tag is present (and not `no`)                      |
| `building!=roof\|garage`   | tag is absent, or none of the values               |
| `!historic`                | tag is absent (or `no`)                            |
| `building:levels>=8`       | numeric comparison on a tag (`>=`, `<=`, `>`, `<`) |
| `@area>=2500`              | footprint area in m²                               |
| `@levels<=2`               | levels: `building:levels`, else height ÷ 3 m       |
| `@height>20`               | metres: `height`, else levels × 3 m                |

Multi-valued tags (`shop=bakery;cafe`) match if any value matches. A condition on an unknown
measure never matches: `@levels<=2` is false for a building with no levels or height.

## Open spaces

Parks, pitches, playgrounds, racecourses and other open spaces are classified by the separate
`areas` rules in the same file. They use the same rule format, but their categories are area
categories, not models: `racecourse`, `track`, `pitch_gaa`, `pitch_soccer`, `pitch_court`,
`pitch`, `playground`, `golf_course`, `sports_ground`, `garden`, `park`, `cemetery` and `grass`.
The highest priority wins, so a `leisure=pitch` with `sport=hurling` is `pitch_gaa`, not `pitch`.
Areas that match no rule are left out.

`areaTrees` gives the tree density per area category, in m² per tree (e.g. `"park": 350`). Areas
whose category isn't listed get no scattered trees, so pitches and playgrounds stay clear.

The plugin colours each category from the theme's `areas.fill`. Pitches get stripes and markings,
tracks a running surface between two rails, and named areas a label. Kit props whose
`categories` are area categories (goals, posts, a playset) are placed on them; see
[adding-models.md](adding-models.md#the-manifest-entry).

## Heights

`height` (or `building:height`) is used if present. Otherwise it's `building:levels` ×
`level_height_m` (3 m). Otherwise it's the category's `default_height_m`. Levels are
`building:levels`, else height ÷ 3 m rounded, with a minimum of 1.

## Landmark packs

Packs hold region-specific overrides, keyed by OSM element:

```json
{
  "pack": "ireland",
  "landmarks": [
    {
      "osm": "way/46694890",
      "category": "landmark_metal_man",
      "name": "The Metal Man",
      "verified": "..."
    }
  ]
}
```

Verify ids against Nominatim or the OSM API rather than trusting names, and record how in
`verified`. The CLI loads the bundled packs by default. Add more with `--pack`, or turn the
defaults off with `--no-default-packs`.

## Improving the mapping

Run `pnpm data:build` and read `docs/classification-report.md`. It lists the most common tag
combinations that fell through to `generic`, including tags of POIs inside those buildings
(prefixed `poi:`). Add or adjust rules in `tag-map.json`, re-run, and check the counts. The unit
tests in `packages/core/test/classify.test.ts` pin the intended behaviour of the main rules.
