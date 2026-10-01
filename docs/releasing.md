# Releasing

`toytown-gl`, `@toytown/models` and `@toytown/cli` are versioned with
[changesets](https://github.com/changesets/changesets), following semver. The examples are
private and not published.

## Day to day

Every PR with a user-facing change adds a changeset:

```sh
pnpm changeset   # pick the packages and bump (patch / minor / major), then describe the change
```

## Cutting a release

```sh
pnpm version-packages          # applies the changesets: bumps versions, writes CHANGELOG.md
git commit -am "Release v0.2.0"
git tag v0.2.0 && git push && git push origin v0.2.0
```

Pushing the tag runs `.github/workflows/release.yml`. It:

1. builds the release notes from the changelogs of the packages at the tag's version (packages
   at another version, like an unchanged CLI, aren't in the release), failing if there are none;
2. lints, builds and tests;
3. publishes `toytown-gl`, `@toytown/models` and `@toytown/cli` to npm with provenance
   (`pnpm -r publish`, which skips private packages and already-published versions);
4. creates a GitHub release with `toytown-models-<version>.zip` attached.

## One-time setup

- **npm scope**: create the `toytown` organisation on npmjs.com, so `@toytown/models` can be
  published. `toytown-gl` is unscoped.
- **Auth**: either add an npm automation token as the `NPM_TOKEN` repository secret, or configure
  npm _trusted publishing_ for this repository and `release.yml`, which needs no token.
- **Provenance**: npm only generates provenance for **public** repositories. While the repository
  is private, remove `NPM_CONFIG_PROVENANCE` from the workflow and `publishConfig.provenance`
  from the three package.json files, or make the repository public first.

## Before tagging

`node scripts/acceptance.mjs` (also a CI job) packs the three packages, creates a fresh Vite
project, installs the tarballs with npm, runs `npx toytown build-data` against a canned Overpass
response, runs the package README's quick start verbatim, builds it, and
checks the town renders in Chrome. That's the "`npm i toytown-gl` works" check, run without
publishing anything.

## What's published

- **`toytown-gl`**:
  - `dist/index.js`: ESM, with `three` and `maplibre-gl` as dependencies and `dist/worker.js`
    loaded via `import.meta.url`;
  - `dist/index.d.ts`: types;
  - `dist/toytown-gl.umd.js`: a self-contained UMD / script-tag build (global `ToyTownGL`, three
    bundled, worker inlined), also the `unpkg` / `jsdelivr` / `require` entry.
- **`@toytown/models`**: `models/` (GLBs, manifest, packs, preview, licences). The same content is
  in the release zip.
- **`@toytown/cli`**: `dist/index.js` (bin `toytown`), one ESM file with the core's
  classification and geometry bundled in (no three.js or MapLibre), and `dist/defaults/` (the
  kit's tag map, manifest and landmark packs). Its only dependency is `flatgeobuf`.
