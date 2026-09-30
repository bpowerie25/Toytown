import defaultTheme from './default.json';
import nightTheme from './night.json';

/** Building look: colours, roof rules and window settings. All colours are exact hex. */
export interface BuildingTheme {
  windows: string;
  /** Pitched roof colours; each building picks one by a hash of its id. */
  roofs: string[];
  /** Flat roof deck colour. */
  flatRoof: string;
  /** Wall colours per category; `default` covers categories not listed. */
  walls: Record<string, string[]>;
  pitchedRoofs: {
    /** Only these categories can get gable or hip roofs. */
    categories: string[];
    /** Footprint area ÷ minimum-rectangle area must be at least this (1 = perfect rectangle). */
    minRectangularity: number;
    pitchDeg: number;
    /** Roof height is at most this fraction of the building height… */
    maxRoofHeightRatio: number;
    /** …and at most this many metres. */
    maxRoofHeight: number;
    /** Eaves overhang in metres. */
    overhang: number;
    /** Fraction of pitched roofs that are hips rather than gables, per category (`default` for the rest). */
    hipShare: Record<string, number>;
  };
  flat: { bevel: number; parapetHeight: number; parapetWidth: number };
  /** Categories drawn without windows. */
  windowsOff: string[];
  /** Buildings lower than this get no windows (sheds, garages). */
  minWindowHeight: number;
  floorHeight: number;
  /** 0: windows are lit like walls (day). 1: windows glow at full colour whatever the light (night). */
  windowGlow: number;
  /** Window frames and sills. */
  frame: string;
  /** Front doors on houses. */
  door: string;
  /** Named window styles; see `WindowStyle`. */
  windowStyles: Record<string, WindowStyle>;
  /** Which window style each category uses (`default` for the rest). */
  windowStyleFor: Record<string, string>;
}

/**
 * How windows are drawn on a building's walls (by the shader, not as geometry). Sizes are
 * fractions of the window's cell (width) and of the storey (height).
 */
export interface WindowStyle {
  /** Metres between window centres along a wall. */
  spacing: number;
  width: number;
  /** Fraction of the storey; 0 for `tall` and `strip` styles. */
  height: number;
  /** A light frame and a sill around each window. */
  frame?: boolean;
  /** A front door in the middle of the street-facing wall. */
  door?: boolean;
  /** A glass shopfront with mullions and a fascia on the ground floor of the street-facing wall. */
  shopfront?: boolean;
  /** One tall arched window per bay (churches). */
  tall?: boolean;
  /** A continuous high window strip (warehouses, factories). */
  strip?: boolean;
}

/**
 * Toon lighting: one sun plus ambient. A face's brightness is `ambient + sun × step`, where
 * `step` comes from `toonSteps` (3 bands: facing away, side-on, facing the sun). With the
 * defaults, faces lit by the sun show their exact palette colour.
 */
export interface LightingTheme {
  ambient: number;
  sun: number;
  /** Direction towards the sun in local east-north-up coordinates. */
  sunDirection: [number, number, number];
  /** Brightness steps of the toon ramp, darkest to lightest. */
  toonSteps: number[];
  /** Soft sky/ground fill light, for depth between the toon steps. */
  hemisphere?: { sky: string; ground: string; intensity: number };
}

export interface OutlineTheme {
  color: string;
  /** Inverted-hull thickness on hero models, in metres. */
  hullWidth: number;
  /** Edge line width on procedural buildings, in pixels. */
  edgeWidth: number;
  /** Edges and windows fade out between these ground resolutions (metres per pixel). */
  fadeStart: number;
  fadeEnd: number;
}

export interface FitRules {
  /** A hero model replaces a building only if the uniform scale needed is within [minScale, maxScale]… */
  minScale: number;
  maxScale: number;
  /** …the frontage:depth ratios differ by at most this (natural log of the ratio)… */
  aspectTolerance: number;
  /** …and the footprint fills at least this much of its minimum rectangle. */
  minRectangularity: number;
  /** …the model, scaled to fit inside, covers at least this much of the footprint… */
  minCoverage: number;
  /** …its scaled height is within this factor of the building's… */
  heightTolerance: number;
  /** …and, if set, the building doesn't share walls with a neighbour (terraces stay procedural). */
  detachedOnly: boolean;
  /** Categories whose models are meant to be taller than the building (spires, towers). */
  heightExempt: string[];
}

export interface ModelsTheme {
  /** Colours for kit palette keys, overriding the manifest palette. */
  palette: Record<string, string>;
  /** Categories that never get hero models. */
  exclude: string[];
  fit: FitRules;
  trees: { minScale: number; maxScale: number };
  /** Palette keys that glow on models (e.g. windows at night): shown at full colour, unlit. */
  glow: string[];
}

export interface Theme {
  name: string;
  /** Base map colours by style palette key (land, water, grass, roads, labels…). */
  style: Record<string, string>;
  buildings: BuildingTheme;
  lighting: LightingTheme;
  outline: OutlineTheme;
  models: ModelsTheme;
}

export const DEFAULT_THEME = defaultTheme as unknown as Theme;
export const NIGHT_THEME = nightTheme as unknown as Theme;

/** Built-in themes by name. */
export const THEMES: Record<string, Theme> = { default: DEFAULT_THEME, night: NIGHT_THEME };

/** A theme by name (`default`, `night`) or as an object; undefined means the default theme. */
export function resolveTheme(theme?: string | Theme): Theme {
  if (theme === undefined) return DEFAULT_THEME;
  if (typeof theme !== 'string') return theme;
  const t = THEMES[theme];
  if (!t)
    throw new Error(
      `unknown theme "${theme}" (built-in themes: ${Object.keys(THEMES).join(', ')})`,
    );
  return t;
}

export function wallPalette(theme: BuildingTheme, category: string): string[] {
  return theme.walls[category] ?? theme.walls.default!;
}

export function windowStyle(theme: BuildingTheme, category: string): WindowStyle {
  const name = theme.windowStyleFor[category] ?? theme.windowStyleFor.default ?? 'grid';
  return theme.windowStyles[name] ?? theme.windowStyles.grid!;
}
