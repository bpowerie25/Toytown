import { describe, expect, it } from 'vitest';
import { roofRise, selectRoof, type PolygonXY, type XY } from '../src/geometry';
import { DEFAULT_THEME } from '../src/themes';

const t = DEFAULT_THEME.buildings;
const rect = (w: number, h: number): XY[] => [[0, 0], [w, 0], [w, h], [0, h]]; // prettier-ignore
const L: XY[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]; // prettier-ignore
const one = (ring: XY[]): PolygonXY[] => [[ring]];

describe('selectRoof', () => {
  it('gives pitched roofs to rectangular residential, pub, church and school footprints', () => {
    for (const c of [
      'house',
      'terraced_house',
      'semi_detached',
      'bungalow',
      'apartment',
      'pub',
      'church',
      'school',
    ]) {
      expect(selectRoof('way/1', c, one(rect(10, 8)), t).kind, c).not.toBe('flat');
    }
  });

  it('gives flat roofs to other categories', () => {
    for (const c of ['shop', 'office', 'warehouse', 'tower_block', 'generic', 'hospital']) {
      expect(selectRoof('way/1', c, one(rect(10, 8)), t).kind, c).toBe('flat');
    }
  });

  it('requires the footprint to fill its minimum rectangle within ~15%', () => {
    expect(selectRoof('way/1', 'house', one(L), t).kind).toBe('flat'); // fills 64%
    // A rectangle with one corner clipped by 10% of the area still counts.
    const clipped: XY[] = [[0, 0], [10, 0], [10, 8], [2.5, 8], [0, 5.6]]; // prettier-ignore
    expect(selectRoof('way/1', 'house', one(clipped), t).kind).not.toBe('flat');
  });

  it('keeps footprints with holes or several parts flat', () => {
    expect(
      selectRoof(
        'way/1',
        'house',
        [[rect(10, 8), rect(2, 2).map(([x, y]) => [x + 4, y + 3] as XY)]],
        t,
      ).kind,
    ).toBe('flat');
    expect(selectRoof('way/1', 'house', [[rect(10, 8)], [rect(3, 3)]], t).kind).toBe('flat');
  });

  it('picks gable or hip stably per building, following hipShare', () => {
    const kinds = (c: string) =>
      Array.from({ length: 400 }, (_, i) => selectRoof(`way/${i}`, c, one(rect(10, 8)), t).kind);
    expect(new Set(kinds('church'))).toEqual(new Set(['gable']));
    expect(new Set(kinds('school'))).toEqual(new Set(['hip']));
    const hips = kinds('house').filter((k) => k === 'hip').length / 400;
    expect(hips).toBeGreaterThan(0.3);
    expect(hips).toBeLessThan(0.5);
    expect(kinds('house')).toEqual(kinds('house'));
  });

  it('returns the fitted rectangle for pitched roofs', () => {
    const r = selectRoof('way/1', 'house', one(rect(10, 8)), t);
    expect(r.rect).toMatchObject({ length: 10, width: 8 });
  });
});

describe('roofRise', () => {
  it('uses the pitch for small houses', () => {
    expect(roofRise(8, 9, t)).toBeCloseTo(4 * Math.tan((35 * Math.PI) / 180));
  });
  it('is capped by building height and absolute height', () => {
    expect(roofRise(30, 10, t)).toBeCloseTo(4.5); // 45% of 10 m
    expect(roofRise(60, 40, t)).toBe(8);
  });
  it('is 0 (flat) when too little wall would remain', () => {
    expect(roofRise(8, 2.8, t)).toBe(0);
  });
});
