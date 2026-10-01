/**
 * The three.js-free part of the core: classification, manifests and footprint geometry. Not a
 * published entry point. `@toytown/cli` bundles it from source in place of `toytown-gl`, so the CLI
 * installs without three.js or MapLibre.
 */
export * from './classify';
export * from './build';
export { parseManifest, parsePackManifest, type Manifest, type ModelEntry } from './manifest';
export { LocalProjection, type LngLat, type XY } from './geometry/project';
export {
  signedArea,
  polygonArea,
  centroid,
  pointInPolygon,
  closestOnSegment,
  type PolygonXY,
} from './geometry/polygon';
export { orientation, snapFront } from './geometry/rect';
export { hash32 } from './geometry/hash';

declare const __VERSION__: string;

/** The toytown-gl version (from package.json, set at build time). */
export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';
