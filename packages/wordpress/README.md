# Toytown Map (WordPress plugin)

The WordPress plugin for [toytown-gl](../../README.md): a **Toytown Map** block and a `[toytown]`
shortcode that show any village or town as a 3D toy town, built from OpenStreetMap in the
visitor's browser. 20 skins, no API keys, no data files for areas up to 12 km².

- `plugin/`: the plugin source, in the WordPress coding style, with no build step for its own code:
  - `toytown-map.php`: settings, shortcode and server-side render;
  - `block/`: `block.json` and the editor script (place search with Nominatim, live preview, "Use
    this view");
  - `public/`: the front-end ES module, CSS and the editor's preview page;
  - `readme.txt`: the WordPress.org listing, including the external services it uses.
- `build.mjs`: assembles `dist/toytown-map/` and `dist/toytown-map.zip`, bundling MapLibre,
  toytown-gl's script-tag build and the model kit. WordPress.org doesn't allow loading code from
  CDNs.
- `.wordpress-org/`: banner, icon and screenshots for the plugin directory.
- `test/`: a throwaway WordPress in Docker, and checks of the front end and the editor.

## Build

```sh
pnpm --filter toytown-gl build && pnpm --filter @toytown/wordpress zip
# → packages/wordpress/dist/toytown-map.zip (Plugins → Add New → Upload Plugin)
# (`build` alone assembles dist/toytown-map/, which the Docker test WordPress mounts)
```

The zip is also attached to each GitHub release.

## Test in a local WordPress

```sh
docker compose -f packages/wordpress/test/docker-compose.yml up -d   # http://localhost:8089
node packages/wordpress/test/setup.mjs       # installs WordPress, activates the plugin, adds 2 pages
node packages/wordpress/test/check.mjs       # front end: shortcode and block pages render, scroll isn't trapped
node packages/wordpress/test/editor.mjs      # editor: live preview, skin picker
node packages/wordpress/test/new-block.mjs   # editor: insert, search a place (one Nominatim query), "Use this view"
docker compose -f packages/wordpress/test/docker-compose.yml exec -T cli wp plugin install plugin-check --activate
docker compose -f packages/wordpress/test/docker-compose.yml exec -T cli wp plugin check toytown-map
```

The admin password is generated per run and written to `.cache/wordpress-test.json`.

## Publishing on WordPress.org

1. With a WordPress.org account, submit `dist/toytown-map.zip` at
   https://wordpress.org/plugins/developers/add/. Review takes a few weeks.
2. Once approved, WordPress.org gives the plugin an SVN repository. Copy `dist/toytown-map/` to
   `trunk/`, `.wordpress-org/` to `assets/`, and tag the version (`tags/0.1.0`).
3. For each release, bump `Version` in `toytown-map.php`, `Stable tag` in `readme.txt` (the build
   checks they match) and the block version, and add a changelog entry.
