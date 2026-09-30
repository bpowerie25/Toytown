# Castlemagner example

A village in north County Cork, near Kanturk.

```sh
pnpm build
pnpm --filter @toytown/example-castlemagner dev
```

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
