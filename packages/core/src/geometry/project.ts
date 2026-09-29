/** A position as [longitude, latitude] in degrees (GeoJSON order). */
export type LngLat = [number, number];
/** A position in local metres: x east, y north. */
export type XY = [number, number];

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG_EQUATOR = 111_320;

/**
 * Equirectangular projection around an origin. Accurate to well under 1% over a few kilometres,
 * which is plenty for building footprints.
 */
export class LocalProjection {
  private readonly kx: number;

  constructor(readonly origin: LngLat) {
    this.kx = M_PER_DEG_LNG_EQUATOR * Math.cos((origin[1] * Math.PI) / 180);
  }

  toXY([lng, lat]: LngLat): XY {
    return [(lng - this.origin[0]) * this.kx, (lat - this.origin[1]) * M_PER_DEG_LAT];
  }

  toLngLat([x, y]: XY): LngLat {
    return [this.origin[0] + x / this.kx, this.origin[1] + y / M_PER_DEG_LAT];
  }
}
