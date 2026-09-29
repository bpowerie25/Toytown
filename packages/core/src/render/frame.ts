import { Matrix4, Vector3 } from 'three';
import { mercatorPerMetre, toMercator, type LngLat } from '../geometry';

/**
 * The three.js scene frame: metres east/north/up from a fixed origin (the data's centre), measured
 * at the origin's latitude. Float32 keeps about 1 mm of precision across a whole city in this
 * frame. MapLibre's mercator matrix is combined with the frame on the CPU, in float64.
 */
export class SceneFrame {
  readonly merc: [number, number];
  /** Mercator units per metre at the origin. */
  readonly scale: number;
  private readonly toMercatorMatrix: Matrix4;

  constructor(readonly origin: LngLat) {
    this.merc = toMercator(origin);
    this.scale = mercatorPerMetre(origin[1]);
    const s = this.scale;
    // y flips: scene y points north, mercator y points south.
    this.toMercatorMatrix = new Matrix4()
      .makeTranslation(this.merc[0], this.merc[1], 0)
      .scale(new Vector3(s, -s, s));
  }

  /** A position in scene metres. `z` is metres above ground at that latitude. */
  toScene(p: LngLat, z = 0, out = new Vector3()): Vector3 {
    const [x, y] = toMercator(p);
    const k = this.localScale(p[1]);
    return out.set((x - this.merc[0]) / this.scale, -(y - this.merc[1]) / this.scale, z * k);
  }

  /** Scene metres per real metre at a latitude (≈1 near the origin). */
  localScale(lat: number): number {
    return mercatorPerMetre(lat) / this.scale;
  }

  /** Clip-space matrix for scene metres: MapLibre's mercator matrix × scene → mercator. */
  projection(mercatorToClip: ArrayLike<number>, out = new Matrix4()): Matrix4 {
    return out.fromArray(mercatorToClip as number[]).multiply(this.toMercatorMatrix);
  }
}
