# Castlemagner example

A village in north County Cork, near Kanturk.

```sh
pnpm build
pnpm --filter @toytown/example-castlemagner dev
```

## Points of interest (prototype)

The numbered pins, popups and tour list come from `public/data/pois.geojson`, handled by the
shared demo's `examples/shared/pois.ts` (`startDemo({ pois })`). Nothing in the code is specific to Castlemagner: edit the file to change the places.

- **Pins** pulse (CSS only, so the map doesn't redraw for them). Their colour comes from `group`:
  `history` #c8553d, `faith` #3b6ea5, `community` #2a9d8f, anything else #6c757d.
- **Popups** show `kind`, `period`, the `text` paragraphs, `sources` and the OSM link, with
  previous and next buttons for a tour.
- **`osm`** links a place to an element in the town's data file. Clicking that building opens the
  place's popup instead of the default one, and its footprint is outlined in #ff8c42 (dashed for
  flat areas such as graveyards).
- **`access: "private"`** adds a "Private land: ask the landowner's permission" warning to the
  popup (`accessNote` overrides the wording) and a ⚠ in the list. `"public"` says it's open to
  visitors.
- **`notice`** at the top of the file is a banner shown on first visit. It's dismissed per browser
  and can be reopened from "Visiting? Read this first".
- **`approximate: true`** labels a position as a best guess, for places that aren't mapped yet.
  Every Castlemagner place is now an OSM element: the castle is the ruin `way/1375689442` and
  the holy well is `node/12737520715` (mapped as Sunday Well), which matches the published
  position of the well (N 52° 10' 00.9", W 8° 48' 47.7"), checked 2026-10-02.

The popup text is plain text (it's escaped), so the file can't inject HTML.

## Data

`public/data/castlemagner.geojson` is generated with:

```sh
node packages/cli/dist/index.js build-data --bbox=-8.845,52.155,-8.805,52.178 \
  --out examples/castlemagner/public/data/castlemagner.geojson
```

- **bbox (w,s,e,n):** `-8.845,52.155,-8.805,52.178`

The village place relation (14597374) spans -8.8306,52.1644,-8.8219,52.1682. The bbox adds about
1 km around it for the surrounding farms, and gives 190 buildings. Checked against Nominatim on
2026-09-29.

The data is © OpenStreetMap contributors and licensed under the
[ODbL](https://opendatacommons.org/licenses/odbl/).
