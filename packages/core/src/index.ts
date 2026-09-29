export { parseManifest, parsePackManifest, ManifestError, kitFiles } from './manifest';
export type {
  Manifest,
  PackManifest,
  ModelEntry,
  ModelVariant,
  PropEntry,
  PropAttach,
} from './manifest';
export { toytownStyle, setBaseBuildingsVisible, BASE_BUILDING_LAYER_ID } from './style';
export type { StyleOptions, LayerHost } from './style';
export * from './geometry';
export * from './classify';
export {
  DEFAULT_THEME,
  NIGHT_THEME,
  THEMES,
  resolveTheme,
  wallPalette,
  type Theme,
  type BuildingTheme,
  type LightingTheme,
  type OutlineTheme,
  type ModelsTheme,
  type FitRules,
} from './themes';

export {
  planKit,
  fitModel,
  decorate,
  planBuildings,
  planPoints,
  planTrees,
  chooseVariant,
  type KitModel,
  type Placement,
  type PlanKit,
  type PlannedBuilding,
  type PointFeature,
} from './placement';
export {
  ToyTown,
  splitData,
  toChunks,
  type ToyTownOptions,
  type DataCollection,
  type BuildingInfo,
  type ToyTownClickEvent,
} from './toytown';
export {
  DEFAULT_LOD,
  lodLevel,
  chunkSphere,
  chunksToDispose,
  type LodOptions,
  type LodLevel,
} from './render/lod';
export { DebugOverlay } from './render/overlay';
export {
  ToyTownLayer,
  instanceMatrix,
  shouldDraw3D,
  type ChunkInput,
  type ChunkLoader,
  type PickHit,
} from './render/layer';
export { SceneFrame } from './render/frame';

declare const __VERSION__: string;

/** The toytown-gl version (from package.json, set at build time). */
export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';
