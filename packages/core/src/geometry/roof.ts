import type { BuildingTheme } from '../themes';
import { hashUnit } from './hash';
import type { PolygonXY } from './polygon';
import { minRotatedRect, rectangularity, type RotatedRect } from './rect';

export type RoofKind = 'flat' | 'gable' | 'hip';

export interface RoofChoice {
  kind: RoofKind;
  /** The minimum rotated rectangle, for pitched roofs. */
  rect?: RotatedRect;
}

/**
 * Choose a roof. Gable or hip only when the category allows pitched roofs, the footprint is a
 * single part without holes, and it fills at least `minRectangularity` of its minimum rotated
 * rectangle. Gable vs hip is a stable per-building choice using the category's `hipShare`.
 */
export function selectRoof(
  id: string,
  category: string,
  parts: PolygonXY[],
  theme: BuildingTheme,
): RoofChoice {
  const p = theme.pitchedRoofs;
  if (!p.categories.includes(category)) return { kind: 'flat' };
  if (parts.length !== 1 || parts[0]!.length !== 1) return { kind: 'flat' };
  if (rectangularity(parts[0]!) < p.minRectangularity) return { kind: 'flat' };
  const rect = minRotatedRect(parts[0]![0]!);
  if (!rect) return { kind: 'flat' };
  const share = p.hipShare[category] ?? p.hipShare.default ?? 0;
  return { kind: hashUnit(`${id}:roof`) < share ? 'hip' : 'gable', rect };
}

/** Roof rise in metres for a pitched roof over a rectangle of the given width. 0 means "use flat". */
export function roofRise(width: number, height: number, theme: BuildingTheme): number {
  const p = theme.pitchedRoofs;
  const rise = Math.min(
    (width / 2) * Math.tan((p.pitchDeg * Math.PI) / 180),
    p.maxRoofHeightRatio * height,
    p.maxRoofHeight,
    height - 2.2, // keep at least a storey of wall
  );
  return rise >= 1 ? rise : 0;
}
