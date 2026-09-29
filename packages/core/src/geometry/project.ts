/** A position as [longitude, latitude] in degrees (GeoJSON order). */
export type LngLat = [number, number];
/** A position in local metres: x east, y north. */
export type XY = [number, number];

/**
 * Metres per degree on MapLibre's spherical mercator earth (circumference 2π × 6378137 m / 360).
 * Using the same sphere as MapLibre keeps meshes aligned with the base map; it's also within about
 * 0.1% of the real meridian degree at mid-latitudes (the ellipsoid's equatorial 110,574 m/° was
 * 0.67% short north–south at 52°N).
 */
const M_PER_DEG = (2 * Math.PI * 6378137) / 360;

/**
 * Equirectangular projection around an origin, on MapLibre's sphere. Accurate to well under 0.1%
 * over a few kilometres, which is plenty for building footprints.
 */
export class LocalProjection {
  private readonly kx: number;

  constructor(readonly origin: LngLat) {
    this.kx = M_PER_DEG * Math.cos((origin[1] * Math.PI) / 180);
  }

  toXY([lng, lat]: LngLat): XY {
    return [(lng - this.origin[0]) * this.kx, (lat - this.origin[1]) * M_PER_DEG];
  }

  toLngLat([x, y]: XY): LngLat {
    return [this.origin[0] + x / this.kx, this.origin[1] + y / M_PER_DEG];
  }
}
