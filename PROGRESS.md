# PROGRESS.md

Updated at the end of each phase.

| Phase      | Status                | Notes                                                       |
| ---------- | --------------------- | ----------------------------------------------------------- |
| 0 Scaffold | done (CI not yet run) | Workspace, tooling, kit validation, CI, licences, examples. |
| 1 Style    | not started           |                                                             |

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

- **CI has not run yet**: nothing has been pushed and there is no GitHub remote. `pnpm lint`,
  `pnpm build`, `pnpm test` (106 tests) and `pnpm typecheck` all pass locally. The phase's
  acceptance criterion ("passes in CI") is only confirmed after the first push.
- The Python CI job assumes Linux numpy produces the same float output as macOS for the
  reproducibility check. Unverified until CI runs.
- Headless Chrome (`--screenshot`) doesn't wait for MapLibre tiles, so phase 0 screenshots were
  taken in a real browser. Playwright screenshot tests (with a wait for `map.idle`) come in phase 1.
- OpenFreeMap's liberty style logs missing-sprite warnings (e.g. `gaelic_games`). These are harmless
  and go away when we switch to our own style in phase 1.
- Examples import `toytown-gl` from `dist/`, so run `pnpm build` before `pnpm dev` in an example.
