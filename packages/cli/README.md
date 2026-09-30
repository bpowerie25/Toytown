# @toytown/cli

Build the data file for [toytown-gl](https://github.com/bpowerie25/Toytown), the MapLibre plugin
that turns OpenStreetMap into a toy town, for **any area in the world**.

```sh
npx @toytown/cli build-data --bbox -8.845,52.155,-8.805,52.178 --out public/data/town.geojson
```

`--bbox` is `west,south,east,north` in degrees. Pick one on
[bboxfinder.com](http://bboxfinder.com) or from the export tab on openstreetmap.org. The
command:

1. fetches buildings, streets, POIs, trees and open spaces from Overpass (or a `.osm.pbf` extract
   with `--source pbf <file>`);
2. classifies every building (`house`, `pub`, `church`, `school`…) and open space (`park`,
   `pitch_gaa`, `playground`, `racecourse`…) with the bundled tag map;
3. works out which way each building faces, and scatters trees in parks;
4. writes one GeoJSON file for `new ToyTown({ data: '/data/town.geojson' })`.

A small town takes a few seconds. Overpass responses are cached in `.cache/`, so a rerun is
instant (`--refresh` refetches). Node 20 or later.

## Options

```text
--source overpass            fetch from Overpass (default)
--source pbf <file.osm.pbf>  read a PBF extract instead (e.g. from Geofabrik)
--overpass-url <url>         Overpass interpreter URL (default overpass-api.de)
--refresh                    ignore the Overpass cache
--fgb <file.fgb>             also write FlatGeobuf
--stats <file.json>          write classification stats (input for "toytown report")
--manifest <file>            model manifest (default: the bundled kit's)
--tag-map <file>             tag rules (default: the bundled tag-map.json)
--pack <landmarks.json>      add a landmark pack (repeatable)
--no-default-packs           don't load the bundled packs (Ireland)
--cache-dir <dir>            default .cache
--seed <int>                 seed for scattered trees (default 1)
```

Your own tag rules and models (a new kind of building, for example) go in `--tag-map` and
`--manifest`; see
[your-own-buildings.md](https://github.com/bpowerie25/Toytown/blob/main/docs/your-own-buildings.md#4-a-new-kind-of-building).
The pipeline and the output format are documented in
[build-data.md](https://github.com/bpowerie25/Toytown/blob/main/docs/build-data.md).

## Licence

The CLI is MIT. **The data it writes is derived from OpenStreetMap**, so it's under the
[ODbL](https://opendatacommons.org/licenses/odbl/): show "© OpenStreetMap contributors" on your
map (the toytown-gl style does), and share any dataset you publish under the ODbL.
