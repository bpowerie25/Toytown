# `toytown build-data`

Fetches OSM buildings for a bbox, classifies them, and writes a compact data file for the plugin.

```sh
pnpm --filter toytown-gl --filter @toytown/cli build
node packages/cli/dist/index.js build-data --bbox -7.18,52.135,-7.12,52.18 --out tramore.geojson
```

## Sources

- **Overpass (default).** One query per bbox fetches building ways and multipolygon relations,
  highways, open spaces (the `leisure` and `landuse` values in `AREA_LEISURE` and
  `AREA_LANDUSE`, `amenity=grave_yard`, and `highway=raceway`), and POI nodes (`amenity`, `shop`, `office`, `tourism`, `historic`,
  `leisure`, `craft`, plus `healthcare` and `railway=station|halt`, which the tag map uses) and
  trees. Before querying it checks `/api/status` and waits for a free slot. It retries 429, 503
  and 504 responses with backoff (15 s, 30 s, 60 s, 120 s). Raw responses are cached in
  `.cache/overpass/`, keyed by endpoint and query; `--refresh` bypasses the cache. The cache is
  git-ignored and must never be committed.
- **PBF extract**: `--source pbf <file.osm.pbf>`, e.g. Geofabrik's
  `ireland-and-northern-ireland-latest.osm.pbf`. It uses a streaming reader with no dependencies
  (zlib and raw blobs only). It keeps nodes within the bbox plus 0.01°, ways touching them, and
  building and open-space multipolygons. The whole Ireland extract (414 MB) scans in about 11 s
  with about 250 MB of memory. For Tramore it produces the same features and classifications as
  Overpass; coordinates agree to within 1e-6°.

## Pipeline

1. **Polygons**: closed building ways, plus `type=multipolygon` building relations. Split member
   ways are joined into rings, and holes are assigned to the smallest outer ring that contains
   them. An outer way that is also tagged `building` is skipped, so old-style multipolygons aren't
   drawn twice. A building is kept if the centroid of its largest part is inside the bbox, so
   adjacent bboxes never share a building.
2. **POIs**: each POI node is assigned to the smallest building containing it.
3. **Classification**: see [tag-mapping.md](tag-mapping.md).
4. **Orientation**: the compass bearing (degrees clockwise from north, in [0, 180)) of the long
   side of the footprint's minimum rotated rectangle, computed by rotating calipers on the convex
   hull.
5. **Front**: the bearing from the footprint centroid to the nearest highway within 100 m,
   snapped to the nearest of the four rectangle sides so models face squarely out of one side.
   Streets are preferred; footways, paths, cycleways, steps, tracks and service roads are only
   used when no street is in range. It is `null` if nothing is in range.
6. **Standalone POIs**: POI nodes outside every building, which map to a model by their own tags,
   are written as points (for phase 4's `point` placement).
7. **Open spaces**: closed ways and multipolygons touching the bbox are classified by the tag
   map's `areas` rules (parks, pitches, playgrounds, racecourses…; see
   [tag-mapping.md](tag-mapping.md#open-spaces)) and written as `kind: "area"` polygons.
   Unclosed `leisure=track` and `highway=raceway` ways are written as `kind: "track"` lines.
8. **Trees**: `natural=tree` nodes, plus seeded scatter inside areas whose category has a density
   in the tag map's `areaTrees` (parks 1 per 350 m², grass 1 per 900 m²…), at most 300 per area. Scattered trees are kept off buildings,
   more than 4 m from any highway, and at least 5 m apart. The random stream is seeded from
   `--seed` and the area's OSM id, so output is deterministic and independent of the bbox.

## Output

A single GeoJSON FeatureCollection, written on one line with coordinates rounded to 6 decimals
(about 0.1 m). Polygons follow RFC 7946 winding.

| Geometry                                   | Properties                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Polygon / MultiPolygon: buildings          | `id` (`way/…`/`relation/…`), `category`, `height` (m), `levels`, `orientation` (0–180° or null), `front` (0–360° or null), `name?` |
| Point, `category: "tree"`                  | `id` (`node/…` or `scatter/…`), `height?` (m, if tagged)                                                                           |
| Point, any other category: standalone POIs | `id` (`node/…`), `category`, `height`, `name?`                                                                                     |
| Polygon / MultiPolygon, `kind: "area"`     | `id`, `category` (an area category, e.g. `park`, `pitch_gaa`), `name?`, `sport?`                                                   |
| LineString, `kind: "track"`                | `id`, `category: "track"`, `name?`, `sport?`                                                                                       |

The collection carries `bbox` and a `toytown` member:
`{ version: 1, osm_timestamp, attribution: "© OpenStreetMap contributors", license: "ODbL-1.0" }`.

`--fgb <file>` also writes FlatGeobuf (via the `flatgeobuf` package) with the same features. It
has a fixed column schema and no nulls: unknown numbers are `-1` and a missing name is `""`.

`--stats <file.json>` writes classification counts. `toytown report Name=stats.json… --out
report.md` turns them into the markdown report.

## Licence

The output is derived from OpenStreetMap, so it is a derivative database under the **ODbL**. Show
"© OpenStreetMap contributors", and share any dataset you publish under the ODbL.
