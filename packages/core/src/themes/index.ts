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
  lighting: { ambient: number; sun: number; sunDirection: [number, number, number] };
}

export interface Theme {
  name: string;
  buildings: BuildingTheme;
}

export const DEFAULT_THEME = defaultTheme as unknown as Theme;

export function wallPalette(theme: BuildingTheme, category: string): string[] {
  return theme.walls[category] ?? theme.walls.default!;
}
