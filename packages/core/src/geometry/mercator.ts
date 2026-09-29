import type { LngLat } from './project';

/** Earth circumference at the equator, in metres (WGS84 semi-major axis), as MapLibre uses. */
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137;

/**
 * Web-mercator world coordinates in [0, 1] (x east, y south), matching MapLibre's
 * `MercatorCoordinate`, without importing MapLibre at runtime.
 */
export function toMercator([lng, lat]: LngLat): [number, number] {
  const x = (180 + lng) / 360;
  const y = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;
  return [x, y];
}

/** Mercator units per metre at a latitude (MapLibre's `meterInMercatorCoordinateUnits`). */
export function mercatorPerMetre(lat: number): number {
  return 1 / (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180));
}
