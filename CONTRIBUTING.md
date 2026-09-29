# Contributing

Thanks for helping! toytown-gl has three parts, and contributions to any of them are welcome:
the plugin (`packages/core`), the data pipeline (`packages/cli`), and the model kit
(`assets/models`).

## Setup

```sh
pnpm install
pnpm build && pnpm test && pnpm lint
pnpm test:e2e        # screenshot tests in Docker (the Playwright image CI uses)
```

For the model generator: `python3 -m venv .venv && .venv/bin/pip install -r assets/generator/requirements.txt`.

## Ground rules

- **Nothing place-specific in `packages/core`.** It must work for any bbox with zero config beyond
  a data file. Region-specific content goes in packs (`assets/models/<pack>/`).
- **Behaviour comes from data**, meaning `tag-map.json`, landmark packs and themes, not code edits,
  wherever possible.
- **Colours are exact hex values**, everywhere.
- **Model conventions are fixed**: Y-up, metres, front on +Z, origin at the base centre, one
  material per palette key. Changing them means updating the generator, the manifest version and
  the docs together.
- **Tests**: add unit tests for classification, geometry, placement and roof logic. If a change
  alters the look on purpose, refresh the screenshot baselines with `pnpm test:e2e:update` and
  check the diff.

## Kinds of contribution

- **Tag mapping**: run `pnpm data:build`, read `docs/classification-report.md`, and add or adjust
  rules in `assets/models/tag-map.json`. Include the before-and-after counts in the PR.
- **Models**: follow [docs/adding-models.md](docs/adding-models.md). Contributed models must be
  CC0-1.0 or CC-BY-4.0, with a row in `assets/models/LICENSES.md`.
- **Regional packs**: landmarks keyed by OSM id, verified with Nominatim or the OSM API (say how
  in `verified`).
- **Bugs and performance**: include the browser, GPU, zoom and a screenshot. Open the example with
  `?debug` for the FPS overlay.

## Data and licences

- Code is MIT and models are CC0.
- OSM-derived data is ODbL: never commit Overpass caches or raw OSM extracts (`.cache/` is
  ignored). Generated example datasets may be committed if under 10 MB each.

## Commits and PRs

Keep commits small, with clear messages. CI (lint, unit tests, build, generator reproducibility,
screenshot tests) must pass.
