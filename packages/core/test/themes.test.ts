import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePackManifest, parseManifest, ManifestError } from '../src/manifest';
import { toytownStyle } from '../src/style';
import { DEFAULT_THEME, NIGHT_THEME, resolveTheme, THEMES } from '../src/themes';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../../../assets/models');
const HEX = /^#[0-9A-F]{6}$/;

/** Every string value that looks like a colour, with its path. */
function colours(v: unknown, path = '', out: [string, string][] = []): [string, string][] {
  if (typeof v === 'string' && v.startsWith('#')) out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => colours(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) colours(x, `${path}.${k}`, out);
  return out;
}

describe('themes', () => {
  it('resolves built-in names, objects and the default', () => {
    expect(resolveTheme()).toBe(DEFAULT_THEME);
    expect(resolveTheme('night')).toBe(NIGHT_THEME);
    expect(resolveTheme(NIGHT_THEME)).toBe(NIGHT_THEME);
    expect(() => resolveTheme('sepia')).toThrow(/unknown theme "sepia"/);
  });

  it.each(Object.entries(THEMES))('%s uses only exact #RRGGBB colours', (_name, theme) => {
    for (const [path, c] of colours(theme)) expect(c, path).toMatch(HEX);
  });

  it('night has the same keys as default everywhere it matters', () => {
    expect(Object.keys(NIGHT_THEME.style).sort()).toEqual(Object.keys(DEFAULT_THEME.style).sort());
    expect(Object.keys(NIGHT_THEME.buildings.walls).sort()).toEqual(
      Object.keys(DEFAULT_THEME.buildings.walls).sort(),
    );
  });

  it('night: #1B2238 background, #FFD166 glowing windows', () => {
    expect(NIGHT_THEME.style.land).toBe('#1B2238');
    expect(NIGHT_THEME.buildings.windows).toBe('#FFD166');
    expect(NIGHT_THEME.buildings.windowGlow).toBe(1);
    expect(NIGHT_THEME.models.glow).toContain('window');
  });

  it('default style palette matches the base style', () => {
    const style = toytownStyle();
    expect((style.metadata as Record<string, unknown>)['toytown:palette']).toEqual(
      DEFAULT_THEME.style,
    );
  });
});

describe('themed base style', () => {
  it('theming with the default theme changes nothing', () => {
    expect(toytownStyle({ theme: 'default' }).layers).toEqual(toytownStyle().layers);
  });

  it('keeps road fills, label halos and casings on their own keys', () => {
    const colors = (toytownStyle().metadata as Record<string, Record<string, string>>)[
      'toytown:colors'
    ]!;
    expect(colors['road-minor/line-color']).toBe('road');
    expect(colors['road-minor-casing/line-color']).toBe('road_casing');
    expect(colors['label-place/text-halo-color']).toBe('label_halo');
    expect(colors['toytown-base-buildings/fill-outline-color']).toBe('building_outline');
  });

  it('recolours every coloured paint property from the theme palette', () => {
    const style = toytownStyle({ theme: 'night' });
    const night = new Set(Object.values(NIGHT_THEME.style));
    const used = colours(style.layers);
    expect(used.length).toBeGreaterThan(20);
    for (const [path, c] of used) expect(night.has(c), `${path} = ${c}`).toBe(true);
    expect(style.layers.find((l) => l.id === 'background')!.paint).toEqual({
      'background-color': '#1B2238',
    });
  });

  it('keeps road casing and building outlines apart even though they share a default colour', () => {
    const custom = {
      ...DEFAULT_THEME,
      style: { ...DEFAULT_THEME.style, road_casing: '#111111', building_outline: '#222222' },
    };
    const style = toytownStyle({ theme: custom });
    const paint = (id: string) =>
      (style.layers.find((l) => l.id === id) as { paint: Record<string, unknown> }).paint;
    expect(paint('road-minor-casing')['line-color']).toBe('#111111');
    expect(paint('toytown-base-buildings')['fill-outline-color']).toBe('#222222');
  });
});

describe('pack manifests', () => {
  const read = (f: string) =>
    JSON.parse(readFileSync(join(ASSETS, f), 'utf8')) as Record<string, unknown>;

  it('the Ireland pack manifest parses and matches the main manifest', () => {
    const pack = parsePackManifest(read('ireland/manifest.json'));
    const main = parseManifest(read('manifest.json'));
    expect(pack.pack).toBe('ireland');
    expect(pack.landmarks).toEqual([{ osm: 'way/46694890', category: 'landmark_metal_man' }]);
    const mm = pack.models.landmark_metal_man!;
    expect(mm.file).toBe('landmark_metal_man.glb');
    expect(mm.footprint_m).toEqual(main.models.landmark_metal_man!.footprint_m);
  });

  it('rejects landmarks without a proper OSM id', () => {
    const bad = {
      ...read('ireland/manifest.json'),
      landmarks: [{ osm: 'The Metal Man', category: 'x' }],
    };
    expect(() => parsePackManifest(bad)).toThrow(ManifestError);
  });
});
