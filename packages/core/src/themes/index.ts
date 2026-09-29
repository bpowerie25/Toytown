import defaultTheme from './default.json';

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
  windowSpacing: number;
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
  toonSteps: [number, number, number];
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
}

export interface ModelsTheme {
  /** Colours for kit palette keys, overriding the manifest palette. */
  palette: Record<string, string>;
  /** Categories that never get hero models. */
  exclude: string[];
  fit: FitRules;
  trees: { minScale: number; maxScale: number };
}

export interface Theme {
  name: string;
  buildings: BuildingTheme;
  lighting: LightingTheme;
  outline: OutlineTheme;
  models: ModelsTheme;
}

export const DEFAULT_THEME = defaultTheme as unknown as Theme;

export function wallPalette(theme: BuildingTheme, category: string): string[] {
  return theme.walls[category] ?? theme.walls.default!;
}
