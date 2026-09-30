import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LocalProjection, type LngLat, type XY } from '../src/geometry';
import { parseManifest } from '../src/manifest';
import {
  attachedBuildings,
  chooseVariant,
  decorate,
  fitModel,
  planBuildings,
  planKit,
  planPoints,
  planTrees,
  type PlannedBuilding,
} from '../src/placement';
import { DEFAULT_THEME as theme } from '../src/themes';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../../../assets/models');
const kit = planKit(parseManifest(JSON.parse(readFileSync(join(ASSETS, 'manifest.json'), 'utf8'))));
const ORIGIN: LngLat = [-7.11, 52.26];
const proj = new LocalProjection(ORIGIN);

/** A w (east-west) × d (north-south) rectangle centred at (x, y) metres. */
function building(
  id: string,
  category: string,
  w: number,
  d: number,
  front: number | null,
  x = 0,
  y = 0,
  height = 8,
): PlannedBuilding {
  const ring = ([[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2], [x - w / 2, y - d / 2]] as XY[]).map((p) => proj.toLngLat(p)); // prettier-ignore
  return { id, category, height, parts: [[ring]], front };
}
const xy = (p: LngLat) => proj.toXY(p);
/** An id that hashes to the base house model (not a variant), for tests about fitting rules. */
const BASE_HOUSE = Array.from({ length: 50 }, (_, i) => `way/${i}`).find(
  (i) => chooseVariant('house', kit.models.house!, i).name === 'house',
)!;

describe('fitModel', () => {
  // The house model is 8.6 m wide (frontage) by 7.8 m deep.
  it('fits a house-shaped footprint, at its centroid, facing its front', () => {
    const p = fitModel(building(BASE_HOUSE, 'house', 9, 8, 180), kit, theme)!;
    expect(p).toMatchObject({ kind: 'model', name: 'house', front: 180, z: 0 });
    expect(p.scale).toBeCloseTo(Math.min(9 / 8.6, 8 / 7.8), 6); // fits inside the footprint
    const [x, y] = xy(p.position);
    expect(Math.abs(x)).toBeLessThan(0.01);
    expect(Math.abs(y)).toBeLessThan(0.01);
  });

  it('measures frontage across the front, not along the long side', () => {
    // Terraced model is 16.8 wide × 8.8 deep. A 16×9 footprint facing south fits…
    expect(fitModel(building('way/1', 'terraced_house', 16, 9, 180), kit, theme)).not.toBeNull();
    // …but facing east its frontage is 9 m and depth 16 m, the wrong way round.
    expect(fitModel(building('way/1', 'terraced_house', 16, 9, 90), kit, theme)).toBeNull();
  });

  it('rejects footprints needing too much scaling', () => {
    expect(fitModel(building('way/1', 'house', 4, 3.6, 180), kit, theme)).toBeNull(); // ~0.45×
    expect(fitModel(building('way/1', 'house', 18, 16, 180), kit, theme)).toBeNull(); // ~2.1×
  });

  it('rejects non-rectangular footprints, multipolygons, and buildings without a front', () => {
    const L = ([[0, 0], [9, 0], [9, 3], [3, 3], [3, 8], [0, 8], [0, 0]] as XY[]).map((p) => proj.toLngLat(p)); // prettier-ignore
    expect(
      fitModel({ id: 'way/1', category: 'house', height: 8, parts: [[L]], front: 180 }, kit, theme),
    ).toBeNull();
    const two = building('way/1', 'house', 9, 8, 180);
    two.parts.push(two.parts[0]!);
    expect(fitModel(two, kit, theme)).toBeNull();
    expect(fitModel(building('way/1', 'house', 9, 8, null), kit, theme)).toBeNull();
  });

  it('never fits excluded or model-less categories', () => {
    expect(fitModel(building('way/1', 'generic', 9, 8, 180), kit, theme)).toBeNull();
  });

  it('always places landmarks, clamping the scale', () => {
    const p = fitModel(building('way/46694890', 'landmark_metal_man', 4, 4, 90), kit, theme)!;
    expect(p).toMatchObject({ name: 'landmark_metal_man', scale: theme.models.fit.minScale });
  });
});

describe('variants', () => {
  it('picks the base model or a variant, stably per id and spread evenly', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 900; i++) {
      const name = chooseVariant('house', kit.models.house!, `way/${i}`).name;
      counts[name] = (counts[name] ?? 0) + 1;
      expect(chooseVariant('house', kit.models.house!, `way/${i}`).name).toBe(name);
    }
    expect(Object.keys(counts).sort()).toEqual(['house', 'house_2', 'house_3']);
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(240);
  });

  it('fits using the chosen variant’s footprint and places that variant', () => {
    // Find an id that gets house_3 (7.6 wide × 10.2 deep): a footprint shaped like it fits…
    const id = Array.from({ length: 50 }, (_, i) => `way/${i}`).find(
      (i) => chooseVariant('house', kit.models.house!, i).name === 'house_3',
    )!;
    const p = fitModel({ ...building(id, 'house', 7.6, 10.2, 180) }, kit, theme)!;
    expect(p.name).toBe('house_3');
    expect(p.scale).toBeCloseTo(1, 2);
    // …while the same shape rotated a quarter turn (wide frontage) doesn't.
    expect(fitModel({ ...building(id, 'house', 10.2, 7.6, 180) }, kit, theme)).toBeNull();
  });

  it('categories without variants always get their base model', () => {
    expect(chooseVariant('church', kit.models.church!, 'way/1').name).toBe('church');
  });
});

describe('fit rules that keep models tidy', () => {
  it('rejects a model much taller than the building', () => {
    expect(fitModel(building(BASE_HOUSE, 'house', 9, 8, 180, 0, 0, 3), kit, theme)).toBeNull(); // 3 m shed-height
    expect(fitModel(building(BASE_HOUSE, 'house', 9, 8, 180, 0, 0, 8), kit, theme)).not.toBeNull();
  });

  it('lets spires and towers stand taller than the building', () => {
    expect(
      fitModel(building('way/1', 'church', 10.8, 28.7, 180, 0, 0, 12), kit, theme),
    ).not.toBeNull();
  });

  it('keeps buildings that share walls procedural (terraces stay consistent)', () => {
    const a = building(BASE_HOUSE, 'house', 9, 8, 180, 0);
    const b = building('way/9001', 'house', 9, 8, 180, 9); // shares a 8 m wall with a
    const c = building('way/9002', 'house', 9, 8, 180, 40); // stands alone
    const attached = attachedBuildings([a, b, c]);
    expect([...attached].sort()).toEqual([BASE_HOUSE, 'way/9001'].sort());
    expect(fitModel(a, kit, theme, true)).toBeNull();
    const plan = planBuildings([a, b, c], kit, theme);
    expect(plan.meshed.map((x) => x.id).sort()).toEqual([BASE_HOUSE, 'way/9001'].sort());
  });

  it('does not treat buildings a few metres apart as attached', () => {
    const a = building(BASE_HOUSE, 'house', 9, 8, 180, 0);
    const b = building('way/9001', 'house', 9, 8, 180, 12);
    expect(attachedBuildings([a, b]).size).toBe(0);
  });
});

describe('decorate', () => {
  it('puts an awning on a shop’s front wall at ground-floor height, sized to the frontage', () => {
    // 30×12 shop facing south: too big for the shop model, so it's decorated.
    const b = building('way/1', 'shop', 30, 12, 180);
    expect(fitModel(b, kit, theme)).toBeNull();
    const [awning] = decorate(b, kit, theme);
    expect(awning).toMatchObject({ kind: 'prop', name: 'awning', z: 2.4, front: 180, scale: 2 });
    const [x, y] = xy(awning!.position);
    expect(x).toBeCloseTo(0, 1);
    expect(y).toBeCloseTo(-6.02, 1); // on the south wall
  });

  it('puts a spire tower on a church’s front edge, from the ground', () => {
    const [spire] = decorate(building('way/1', 'church', 14, 40, 0), kit, theme);
    expect(spire).toMatchObject({ name: 'spire', z: 0, scale: 1 });
    expect(xy(spire!.position)[1]).toBeCloseTo(20, 1); // north wall
  });

  it('puts a canopy in front of a petrol station', () => {
    const [canopy] = decorate(building('way/1', 'petrol_station', 12, 10, 90), kit, theme);
    expect(canopy!.name).toBe('canopy');
    expect(xy(canopy!.position)[0]).toBeCloseTo(6 + 6, 1); // east wall + 6 m
  });

  it('mounts the red cross under the eaves', () => {
    const [cross] = decorate(building('way/1', 'hospital', 60, 40, 180, 0, 0, 15), kit, theme);
    expect(cross!.name).toBe('red_cross');
    expect(cross!.z).toBeCloseTo(15 - 0.6 - 2.2 - 0.4, 5);
  });

  it('gives no props to categories without any', () => {
    expect(decorate(building('way/1', 'office', 30, 20, 180), kit, theme)).toEqual([]);
  });
});

describe('planBuildings', () => {
  it('leaves fitted buildings out of the mesh and decorates the rest', () => {
    const fits = building(BASE_HOUSE, 'house', 9, 8, 180);
    const big = building('way/9002', 'cafe', 30, 12, 180, 50);
    const plain = building('way/9003', 'generic', 10, 10, 180, 100);
    const plan = planBuildings([fits, big, plain], kit, theme);
    expect(plan.meshed.map((b) => b.id)).toEqual(['way/9002', 'way/9003']);
    expect(plan.placements.map((p) => [p.id, p.kind, p.name])).toEqual([
      [BASE_HOUSE, 'model', 'house'],
      ['way/9002', 'prop', 'awning'],
    ]);
  });

  it('meshes everything when no model kit is loaded', () => {
    const b = building('way/1', 'house', 9, 8, 180);
    expect(planBuildings([b], null, theme)).toEqual({ meshed: [b], placements: [] });
  });
});

describe('planPoints', () => {
  const house = building('way/1', 'house', 10, 10, 180);
  it('places a POI model only where the spot is free', () => {
    const inside = { id: 'node/1', category: 'cafe', position: proj.toLngLat([0, 0]), front: 0 };
    const touching = { id: 'node/2', category: 'cafe', position: proj.toLngLat([9, 0]), front: 0 };
    const free = { id: 'node/3', category: 'cafe', position: proj.toLngLat([40, 0]), front: 90 };
    const crowded = { id: 'node/4', category: 'pub', position: proj.toLngLat([45, 0]) };
    const out = planPoints([inside, touching, free, crowded], [house], kit, theme);
    expect(out.map((p) => [p.id, p.name, p.front])).toEqual([['node/3', 'cafe', 90]]);
  });

  it('skips categories without models or excluded ones', () => {
    expect(
      planPoints([{ id: 'node/1', category: 'generic', position: ORIGIN }], [], kit, theme),
    ).toEqual([]);
  });
});

describe('planTrees', () => {
  it('varies scale and rotation stably per tree, or uses a tagged height', () => {
    const trees = Array.from({ length: 50 }, (_, i) => ({ id: `node/${i}`, position: ORIGIN }));
    const a = planTrees(trees, kit, theme);
    expect(planTrees(trees, kit, theme)).toEqual(a);
    for (const t of a) {
      expect(t.scale).toBeGreaterThanOrEqual(0.8);
      expect(t.scale).toBeLessThanOrEqual(1.25);
    }
    expect(new Set(a.map((t) => Math.round(t.front))).size).toBeGreaterThan(40);
    const [tall] = planTrees([{ id: 'node/x', position: ORIGIN, height: 12.8 }], kit, theme);
    expect(tall!.scale).toBeCloseTo(2, 5);
  });
});
