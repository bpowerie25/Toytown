/**
 * Where hero models, props and trees go. Pure functions: footprints and manifest in, placements
 * out. The renderer turns placements into instances.
 *
 * - fit: the footprint matches a model closely enough, so the model replaces the procedural
 *   building (placed at the centroid, uniformly scaled, facing the building's front).
 * - decorate: otherwise the procedural building stays and gets the category's props.
 * - point: POIs without a footprint get their model if the spot is free.
 */
import {
  LocalProjection,
  centroid,
  cleanRing,
  closestOnSegment,
  hashUnit,
  minRotatedRect,
  pointInPolygon,
  rectangularity,
  roofRise,
  selectRoof,
  type BuildingInputFeature,
  type LngLat,
  type RotatedRect,
  type XY,
} from './geometry';
import type { Manifest, PropEntry } from './manifest';
import type { Theme } from './themes';

export interface PlannedBuilding extends BuildingInputFeature {
  /** Compass bearing the building faces (from build-data), or null. */
  front: number | null;
}

export interface Placement {
  /** OSM id of the building or node this came from. */
  id: string;
  kind: 'model' | 'prop' | 'tree';
  /** Model or prop name in the manifest. */
  name: string;
  position: LngLat;
  /** Base height above ground, in metres. */
  z: number;
  /** Compass bearing the model's front (+Z) faces, degrees. */
  front: number;
  scale: number;
}

/** The parts of the manifest planning needs; small enough to send to workers. */
export interface KitModel {
  footprint_m: [number, number];
  height_m: number;
  /** Other looks for this category: name and size. The base model is always an option too. */
  variants?: { name: string; footprint_m: [number, number]; height_m: number }[];
}

export interface PlanKit {
  models: Record<string, KitModel>;
  props: Record<string, Pick<PropEntry, 'categories' | 'attach' | 'footprint_m' | 'height_m'>>;
}

export function planKit(manifest: Manifest): PlanKit {
  const models: PlanKit['models'] = {};
  for (const [k, m] of Object.entries(manifest.models)) {
    models[k] = { footprint_m: m.footprint_m, height_m: m.height_m };
    if (m.variants?.length) {
      models[k].variants = m.variants.map((v) => ({
        name: v.name,
        footprint_m: v.footprint_m,
        height_m: v.height_m,
      }));
    }
  }
  const props: PlanKit['props'] = {};
  for (const [k, p] of Object.entries(manifest.props ?? {})) {
    props[k] = {
      categories: p.categories,
      attach: p.attach,
      footprint_m: p.footprint_m,
      height_m: p.height_m,
    };
  }
  return { models, props };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * The look for one building or POI: the base model or one of its variants, by a stable hash of
 * the OSM id, so neighbouring houses differ but a building always gets the same one.
 */
export function chooseVariant(
  category: string,
  model: KitModel,
  id: string,
): { name: string; footprint_m: [number, number]; height_m: number } {
  const options = [
    { name: category, footprint_m: model.footprint_m, height_m: model.height_m },
    ...(model.variants ?? []),
  ];
  return options[Math.floor(hashUnit(`${id}:variant`) * options.length)]!;
}
const LANDMARK_PREFIX = 'landmark_';

interface Frame {
  proj: LocalProjection;
  ring: XY[];
  rect: RotatedRect;
  center: XY;
  /** Unit vector the building faces (east, north). */
  d: XY;
  /** Extent across the front, and from front to back, in metres. */
  frontage: number;
  depth: number;
}

/** The building's outer ring, minimum rectangle and front-relative extents. */
function frame(b: PlannedBuilding): Frame | null {
  if (b.front === null || !b.parts.length) return null;
  const proj = new LocalProjection(b.parts[0]![0]![0]!);
  const ring = cleanRing(b.parts[0]![0]!.map((p) => proj.toXY(p)));
  if (!ring) return null;
  const rect = minRotatedRect(ring);
  if (!rect) return null;
  const beta = (b.front * Math.PI) / 180;
  const d: XY = [Math.sin(beta), Math.cos(beta)];
  const p: XY = [Math.cos(beta), -Math.sin(beta)];
  const e: XY = [Math.cos(rect.angle), Math.sin(rect.angle)];
  const f: XY = [-e[1], e[0]];
  const extent = (u: XY) =>
    rect.length * Math.abs(u[0] * e[0] + u[1] * e[1]) +
    rect.width * Math.abs(u[0] * f[0] + u[1] * f[1]);
  return { proj, ring, rect, center: centroid(ring), d, frontage: extent(p), depth: extent(d) };
}

/**
 * Try to fit a hero model to a building. Returns the placement, or null if it doesn't fit.
 * The model is scaled to fit *inside* the footprint (so it never spills onto neighbours), must
 * cover most of it, and its height must be close to the building's. `attached` buildings (that
 * share walls with neighbours) keep their procedural shape when `fit.detachedOnly` is set, so
 * terraces stay consistent. Landmark categories (`landmark_*`) always fit, with the scale clamped.
 */
export function fitModel(
  b: PlannedBuilding,
  kit: PlanKit,
  theme: Theme,
  attached = false,
): Placement | null {
  const model = kit.models[b.category];
  if (!model || theme.models.exclude.includes(b.category)) return null;
  if (b.parts.length !== 1 || b.parts[0]!.length !== 1) return null;
  const fr = frame(b);
  if (!fr) return null;
  const rules = theme.models.fit;
  const look = chooseVariant(b.category, model, b.id);
  const [fw, fd] = look.footprint_m;
  const scale = Math.min(fr.frontage / fw, fr.depth / fd);
  const landmark = b.category.startsWith(LANDMARK_PREFIX);
  if (!landmark) {
    if (attached && rules.detachedOnly) return null;
    if (rectangularity([fr.ring]) < rules.minRectangularity) return null;
    if (Math.abs(Math.log(fr.frontage / fr.depth / (fw / fd))) > rules.aspectTolerance) return null;
    if (scale < rules.minScale || scale > rules.maxScale) return null;
    if ((scale * scale * fw * fd) / (fr.frontage * fr.depth) < rules.minCoverage) return null;
    const heightRatio = (look.height_m * scale) / Math.max(2.5, b.height);
    const heightOk =
      rules.heightExempt.includes(b.category) ||
      Math.abs(Math.log(heightRatio)) <= Math.log(rules.heightTolerance);
    if (!heightOk) return null;
  }
  return {
    id: b.id,
    kind: 'model',
    name: look.name,
    position: fr.proj.toLngLat(fr.center),
    z: 0,
    front: b.front!,
    scale: clamp(scale, rules.minScale, rules.maxScale),
  };
}

/**
 * Ids of buildings that share walls with a neighbour: at least `minShared` metres (or 15% of
 * the perimeter) of their outline runs within 0.5 m of another building's outline.
 */
export function attachedBuildings(buildings: BuildingInputFeature[], minShared = 3): Set<string> {
  const out = new Set<string>();
  if (buildings.length < 2) return out;
  const proj = new LocalProjection(buildings[0]!.parts[0]![0]![0]!);
  const CELL = 20;
  const rings = buildings.map((b) => b.parts.map((p) => p[0]!.map((q) => proj.toXY(q))));
  const grid = new Map<string, { owner: number; a: XY; b: XY }[]>();
  const cells = (a: XY, b: XY) => {
    const keys: string[] = [];
    for (
      let gx = Math.floor(Math.min(a[0], b[0]) / CELL);
      gx <= Math.floor(Math.max(a[0], b[0]) / CELL);
      gx++
    ) {
      for (
        let gy = Math.floor(Math.min(a[1], b[1]) / CELL);
        gy <= Math.floor(Math.max(a[1], b[1]) / CELL);
        gy++
      )
        keys.push(`${gx},${gy}`);
    }
    return keys;
  };
  rings.forEach((parts, owner) => {
    for (const r of parts) {
      for (let i = 0; i + 1 < r.length; i++) {
        const seg = { owner, a: r[i]!, b: r[i + 1]! };
        for (const k of cells(seg.a, seg.b)) {
          const list = grid.get(k);
          if (list) list.push(seg);
          else grid.set(k, [seg]);
        }
      }
    }
  });
  rings.forEach((parts, owner) => {
    let shared = 0;
    let perimeter = 0;
    for (const r of parts) {
      for (let i = 0; i + 1 < r.length; i++) {
        const a = r[i]!;
        const b = r[i + 1]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        perimeter += len;
        const steps = Math.max(1, Math.round(len));
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps;
          const p: XY = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const near = (
            grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? []
          ).some((s) => s.owner !== owner && closestOnSegment(p, s.a, s.b).dist2 < 0.25);
          if (near) shared += len / steps;
        }
      }
    }
    if (shared >= Math.min(minShared, 0.15 * perimeter) && shared > 0.5)
      out.add(buildings[owner]!.id);
  });
  return out;
}

/** Props for a building that keeps its procedural geometry. */
export function decorate(b: PlannedBuilding, kit: PlanKit, theme: Theme): Placement[] {
  const props = Object.entries(kit.props).filter(([, p]) => p.categories.includes(b.category));
  if (!props.length) return [];
  const fr = frame(b);
  if (!fr) return [];

  // Eave height, from the same roof decision the mesher makes.
  const h = Math.max(2.5, b.height);
  const choice = selectRoof(b.id, b.category, [[fr.ring]], theme.buildings);
  const rise =
    choice.kind !== 'flat' && choice.rect ? roofRise(choice.rect.width, h, theme.buildings) : 0;
  const eave = rise > 0 ? h - rise : h - theme.buildings.flat.parapetHeight;

  // The front wall's midpoint: the rectangle centre moved half the depth towards the front.
  const [cx, cy] = fr.rect.center;
  const wall: XY = [cx + (fr.d[0] * fr.depth) / 2, cy + (fr.d[1] * fr.depth) / 2];
  const out: Placement[] = [];
  for (const [name, p] of props) {
    const a = p.attach;
    const offset = a.at === 'front-wall' ? 0.02 : a.at === 'front-ground' ? (a.offset ?? 0) : 0;
    const pos: XY = [wall[0] + fr.d[0] * offset, wall[1] + fr.d[1] * offset];
    const scale = a.fit_frontage
      ? clamp((fr.frontage * a.fit_frontage) / p.footprint_m[0], 0.5, 2)
      : 1;
    const z =
      a.z === 'ground-floor'
        ? 2.4
        : a.z === 'top'
          ? Math.max(2.5, eave - p.height_m * scale - 0.4)
          : 0;
    out.push({
      id: b.id,
      kind: 'prop',
      name,
      position: fr.proj.toLngLat(pos),
      z,
      front: b.front!,
      scale,
    });
  }
  return out;
}

/**
 * Plan one chunk: which buildings become hero models (and are left out of the mesh), and which
 * keep their procedural geometry and get props.
 */
export function planBuildings(
  buildings: PlannedBuilding[],
  kit: PlanKit | null,
  theme: Theme,
): { meshed: BuildingInputFeature[]; placements: Placement[] } {
  if (!kit) return { meshed: buildings, placements: [] };
  const meshed: BuildingInputFeature[] = [];
  const placements: Placement[] = [];
  const attached = theme.models.fit.detachedOnly ? attachedBuildings(buildings) : new Set<string>();
  for (const b of buildings) {
    const fit = fitModel(b, kit, theme, attached.has(b.id));
    if (fit) {
      placements.push(fit);
    } else {
      meshed.push(b);
      placements.push(...decorate(b, kit, theme));
    }
  }
  return { meshed, placements };
}

export interface PointFeature {
  id: string;
  category: string;
  position: LngLat;
  front?: number | null;
}

/**
 * Models for POIs with no footprint, where nothing else occupies the spot: the model's
 * footprint circle must be clear of every building and of other point models.
 */
export function planPoints(
  points: PointFeature[],
  buildings: BuildingInputFeature[],
  kit: PlanKit,
  theme: Theme,
): Placement[] {
  const candidates = points.filter(
    (p) => kit.models[p.category] && !theme.models.exclude.includes(p.category),
  );
  if (!candidates.length) return [];
  const proj = new LocalProjection(candidates[0]!.position);
  const CELL = 50;
  const grid = new Map<string, XY[][]>();
  for (const b of buildings) {
    for (const part of b.parts) {
      const ring = part[0]!.map((p) => proj.toXY(p));
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      for (
        let gx = Math.floor(Math.min(...xs) / CELL);
        gx <= Math.floor(Math.max(...xs) / CELL);
        gx++
      ) {
        for (
          let gy = Math.floor(Math.min(...ys) / CELL);
          gy <= Math.floor(Math.max(...ys) / CELL);
          gy++
        ) {
          const k = `${gx},${gy}`;
          const list = grid.get(k);
          if (list) list.push(ring);
          else grid.set(k, [ring]);
        }
      }
    }
  }
  const occupied = (p: XY) =>
    (grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? []).some((r) =>
      pointInPolygon(p, [r]),
    );

  const placed: { p: XY; r: number }[] = [];
  const out: Placement[] = [];
  for (const pt of candidates) {
    const look = chooseVariant(pt.category, kit.models[pt.category]!, pt.id);
    const [fw, fd] = look.footprint_m;
    const r = Math.max(fw, fd) / 2;
    const c = proj.toXY(pt.position);
    const probes: XY[] = [
      c,
      ...Array.from(
        { length: 8 },
        (_, i) =>
          [c[0] + r * Math.cos((i * Math.PI) / 4), c[1] + r * Math.sin((i * Math.PI) / 4)] as XY,
      ),
    ];
    if (probes.some(occupied)) continue;
    if (placed.some((q) => Math.hypot(q.p[0] - c[0], q.p[1] - c[1]) < q.r + r)) continue;
    placed.push({ p: c, r });
    out.push({
      id: pt.id,
      kind: 'model',
      name: look.name,
      position: pt.position,
      z: 0,
      front: pt.front ?? 180,
      scale: 1,
    });
  }
  return out;
}

/** Trees with a stable random size and rotation per id (or a size from a tagged height). */
export function planTrees(
  trees: { id: string; position: LngLat; height?: number }[],
  kit: PlanKit,
  theme: Theme,
): Placement[] {
  const model = kit.models.tree;
  if (!model) return [];
  const { minScale, maxScale } = theme.models.trees;
  return trees.map((t) => ({
    id: t.id,
    kind: 'tree',
    name: 'tree',
    position: t.position,
    z: 0,
    front: hashUnit(`${t.id}:yaw`) * 360,
    scale: t.height
      ? clamp(t.height / model.height_m, 0.6, 2)
      : minScale + hashUnit(`${t.id}:size`) * (maxScale - minScale),
  }));
}
