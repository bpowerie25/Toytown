export { parseManifest, ManifestError, kitFiles } from './manifest';
export type { Manifest, ModelEntry, ModelVariant, PropEntry, PropAttach } from './manifest';
export { toytownStyle, setBaseBuildingsVisible, BASE_BUILDING_LAYER_ID } from './style';
export type { StyleOptions, LayerHost } from './style';
export * from './geometry';
export * from './classify';
export {
  DEFAULT_THEME,
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
export { ToyTown, splitData, type ToyTownOptions, type DataCollection } from './toytown';
export { ToyTownLayer, instanceMatrix, shouldDraw3D } from './render/layer';
export { SceneFrame } from './render/frame';

export const VERSION = '0.0.0';
