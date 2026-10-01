import defaultTheme from './default.json';
import nightTheme from './night.json';
import blueprintTheme from './blueprint.json';
import pastelTheme from './pastel.json';
import sitcomTheme from './sitcom.json';
import winterTheme from './winter.json';
import neonTheme from './neon.json';
import vintageTheme from './vintage.json';
import toyboxTheme from './toybox.json';
import retroTheme from './retro.json';
import autumnTheme from './autumn.json';
import sketchTheme from './sketch.json';
import christmasTheme from './christmas.json';
import halloweenTheme from './halloween.json';
import shamrockTheme from './shamrock.json';
import comicTheme from './comic.json';
import handdrawnTheme from './handdrawn.json';
import goldenTheme from './golden.json';
import voxelTheme from './voxel.json';
import chunkyTheme from './chunky.json';

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
  /** Inverted-hull thickness on hero models, in metres (0 for no outline). */
  hullWidth: number;
  /** Edge line width on procedural buildings, in pixels (0 for none). */
  edgeWidth: number;
  /**
   * Edge ink on procedural buildings is the face's own colour times `inkShade` (default 0.45),
   * mixed towards `color` by `inkMix` (default 0.35). `inkMix: 1` draws solid `color` lines.
   */
  inkShade?: number;
  inkMix?: number;
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
  /**
   * A model set that restyles the kit's shapes: a folder next to the kit's `manifest.json` (e.g.
   * `skins/voxel`) holding its own `manifest.json` with models of the same names.
   */
  kit?: string;
  /** Colours for kit palette keys, overriding the manifest palette. */
  palette: Record<string, string>;
  /** Categories that never get hero models. */
  exclude: string[];
  fit: FitRules;
  trees: { minScale: number; maxScale: number };
  /** Palette keys that glow on models (e.g. windows at night): shown at full colour, unlit. */
  glow: string[];
}

/** Open spaces (parks, pitches, playgrounds, racecourses), drawn flat under the roads. */
export interface AreaTheme {
  /** Fill colour per area category (from tag-map.json's `areas` rules); `default` covers the rest. */
  fill: Record<string, string>;
  /** Thin edge around every area except plain grass. */
  outline: string;
  /** Mowing stripes on pitches. */
  stripe: string;
  /** Pitch and court lines. */
  markings: string;
  /** Running rails around racecourses and tracks. */
  rail: string;
  /** The running surface of tracks (athletics, greyhound). */
  trackSurface: string;
  /** The running surface of grass tracks (horse racing). */
  turfTrack: string;
  label: string;
  labelHalo: string;
}

/** Optional finishing effects. All default to off. */
export interface EffectsTheme {
  /** Comic-book dots in the shadows of buildings and models: dot spacing in CSS pixels, strength 0–1. */
  halftone?: { size: number; strength: number };
  /** Hand-drawn ink: building edge lines vary in width along their length (0 = off, 1 = full). */
  wobble?: number;
  /** Paper grain over the whole map, as an opacity (0–1). */
  paper?: number;
  /** Haze towards the horizon, stronger as the map is pitched: colour and opacity (0–1). */
  haze?: { color: string; amount: number };
  /** Falling snow, density 0–1. Off for users who prefer reduced motion. */
  snow?: { density: number };
  /** Block grid on procedural buildings (walls and roofs), block size in metres, for voxel looks. */
  blocks?: number;
}

export interface Theme {
  name: string;
  /** Base map colours by style palette key (land, water, grass, roads, labels…). */
  style: Record<string, string>;
  buildings: BuildingTheme;
  lighting: LightingTheme;
  outline: OutlineTheme;
  models: ModelsTheme;
  /** Optional in custom themes; the default theme's areas are used when missing. */
  areas?: AreaTheme;
  effects?: EffectsTheme;
}

export const DEFAULT_THEME = defaultTheme as unknown as Theme;
export const NIGHT_THEME = nightTheme as unknown as Theme;
/** Flat saturated colours, solid black outlines and hard two-band shading, like a TV cartoon. */
export const SITCOM_THEME = sitcomTheme as unknown as Theme;
/** Soft, light colours with gentle shading and faint tinted edges. */
export const PASTEL_THEME = pastelTheme as unknown as Theme;
/** Snow on the ground and roofs, evergreen trees, cool light and warm glowing windows. */
export const WINTER_THEME = winterTheme as unknown as Theme;
/** An architect's drawing: blue paper, white line work on every edge, flat shading. */
export const BLUEPRINT_THEME = blueprintTheme as unknown as Theme;

/**
 * Built-in themes (skins) by name: `default`, `night`, `sitcom`, `pastel`, `winter`, `blueprint`,
 * `neon`, `vintage`, `toybox`, `retro`, `autumn`, `sketch`, `christmas`, `halloween`, `shamrock`,
 * `comic`, `handdrawn`, `golden`, `voxel`, `chunky`.
 */
export const THEMES: Record<string, Theme> = {
  default: DEFAULT_THEME,
  night: NIGHT_THEME,
  sitcom: SITCOM_THEME,
  pastel: PASTEL_THEME,
  winter: WINTER_THEME,
  blueprint: BLUEPRINT_THEME,
  neon: neonTheme as unknown as Theme,
  vintage: vintageTheme as unknown as Theme,
  toybox: toyboxTheme as unknown as Theme,
  retro: retroTheme as unknown as Theme,
  autumn: autumnTheme as unknown as Theme,
  sketch: sketchTheme as unknown as Theme,
  christmas: christmasTheme as unknown as Theme,
  halloween: halloweenTheme as unknown as Theme,
  shamrock: shamrockTheme as unknown as Theme,
  comic: comicTheme as unknown as Theme,
  handdrawn: handdrawnTheme as unknown as Theme,
  golden: goldenTheme as unknown as Theme,
  voxel: voxelTheme as unknown as Theme,
  chunky: chunkyTheme as unknown as Theme,
};

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
