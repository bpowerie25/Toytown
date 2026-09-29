/**
 * The model kit manifest (`assets/models/manifest.json`).
 *
 * Conventions are fixed: Y-up, metres, front faces +Z, origin at base centre,
 * one material per palette key.
 */
/** Another look for the same category; picked per building by a hash of its OSM id. */
export interface ModelVariant {
  name: string;
  file: string;
  materials: string[];
  footprint_m: [number, number];
  height_m: number;
  /** "hand" for hand-made GLBs declared in a pack's pack.json; absent for generated ones. */
  source?: 'hand';
}

export interface ModelEntry {
  /** Path to the GLB, relative to the manifest. */
  file: string;
  /** `generic` for the core kit, otherwise the regional pack name. */
  pack: string;
  /** Suggested OSM tag matches. Turned into proper rules in `tag-map.json`. */
  osm_tags: string[];
  /** Material names; each is a key into `palette`. */
  materials: string[];
  /** Footprint width (x) and depth (z) in metres. */
  footprint_m: [number, number];
  height_m: number;
  variants?: ModelVariant[];
  source?: 'hand';
}

/** How a prop attaches to a procedural building's front. */
export interface PropAttach {
  /** `front-wall`: on the front wall; `front-edge`: centred on the front wall line, from the ground; `front-ground`: in front of the building. */
  at: 'front-wall' | 'front-edge' | 'front-ground';
  /** Mounting height: `ground`, `ground-floor` (2.4 m) or `top` (just under the eaves). */
  z: 'ground' | 'ground-floor' | 'top';
  /** Metres out from the front wall (front-ground). */
  offset?: number;
  /** Scale the prop so its width is this fraction of the frontage. */
  fit_frontage?: number;
}

/** A prop: a small part attached to a procedural building when no hero model fits. */
export interface PropEntry {
  file: string;
  /** Building categories this prop decorates. */
  categories: string[];
  attach: PropAttach;
  materials: string[];
  footprint_m: [number, number];
  height_m: number;
}

export interface Manifest {
  version: number;
  units: 'metres';
  up: '+Y';
  front: '+Z';
  /** Palette key to exact hex colour, e.g. `"roof_red": "#D9644A"`. */
  palette: Record<string, string>;
  models: Record<string, ModelEntry>;
  props?: Record<string, PropEntry>;
}

export class ManifestError extends Error {
  override name = 'ManifestError';
}

const SUPPORTED_VERSION = 1;
const HEX = /^#[0-9A-F]{6}$/i;

function fail(msg: string): never {
  throw new ManifestError(msg);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPositive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Validate an already-parsed manifest object and return it typed. Throws `ManifestError`. */
export function parseManifest(input: unknown): Manifest {
  if (!isRecord(input)) fail('manifest must be an object');
  if (input.version !== SUPPORTED_VERSION) {
    fail(`unsupported manifest version ${String(input.version)} (expected ${SUPPORTED_VERSION})`);
  }
  if (input.units !== 'metres') fail(`units must be "metres", got ${String(input.units)}`);
  if (input.up !== '+Y') fail(`up must be "+Y", got ${String(input.up)}`);
  if (input.front !== '+Z') fail(`front must be "+Z", got ${String(input.front)}`);

  const { palette, models } = input;
  if (!isRecord(palette)) fail('palette must be an object');
  for (const [key, hex] of Object.entries(palette)) {
    if (typeof hex !== 'string' || !HEX.test(hex))
      fail(`palette.${key} is not a #RRGGBB hex colour`);
  }
  if (!isRecord(models)) fail('models must be an object');

  for (const [name, m] of Object.entries(models)) {
    const at = `models.${name}`;
    if (!isRecord(m)) fail(`${at} must be an object`);
    if (typeof m.file !== 'string' || !m.file.endsWith('.glb'))
      fail(`${at}.file must be a .glb path`);
    if (typeof m.pack !== 'string' || !m.pack) fail(`${at}.pack must be a non-empty string`);
    if (!Array.isArray(m.osm_tags) || !m.osm_tags.every((t) => typeof t === 'string')) {
      fail(`${at}.osm_tags must be an array of strings`);
    }
    if (!Array.isArray(m.materials) || m.materials.length === 0) {
      fail(`${at}.materials must be a non-empty array`);
    }
    for (const mat of m.materials) {
      if (typeof mat !== 'string' || !(mat in palette)) {
        fail(`${at}.materials: "${String(mat)}" is not a palette key`);
      }
    }
    const fp = m.footprint_m;
    if (!Array.isArray(fp) || fp.length !== 2 || !fp.every(isPositive)) {
      fail(`${at}.footprint_m must be [width, depth] in metres`);
    }
    if (!isPositive(m.height_m)) fail(`${at}.height_m must be a positive number`);
    if (m.variants !== undefined) {
      if (!Array.isArray(m.variants)) fail(`${at}.variants must be an array`);
      m.variants.forEach((v: unknown, i: number) => {
        const vat = `${at}.variants[${i}]`;
        if (!isRecord(v) || typeof v.name !== 'string' || !v.name)
          fail(`${vat}.name must be a string`);
        if (v.name in models) fail(`${vat}: "${v.name}" clashes with a model name`);
        if (typeof v.file !== 'string' || !v.file.endsWith('.glb'))
          fail(`${vat}.file must be a .glb path`);
        if (
          !Array.isArray(v.materials) ||
          !v.materials.every((x) => typeof x === 'string' && x in palette)
        ) {
          fail(`${vat}.materials must be palette keys`);
        }
        const vfp = v.footprint_m;
        if (!Array.isArray(vfp) || vfp.length !== 2 || !vfp.every(isPositive))
          fail(`${vat}.footprint_m must be [width, depth]`);
        if (!isPositive(v.height_m)) fail(`${vat}.height_m must be a positive number`);
      });
    }
  }

  if (input.props !== undefined) {
    if (!isRecord(input.props)) fail('props must be an object');
    for (const [name, p] of Object.entries(input.props)) {
      const at = `props.${name}`;
      if (!isRecord(p)) fail(`${at} must be an object`);
      if (typeof p.file !== 'string' || !p.file.endsWith('.glb'))
        fail(`${at}.file must be a .glb path`);
      if (!Array.isArray(p.categories) || !p.categories.every((c) => typeof c === 'string')) {
        fail(`${at}.categories must be an array of strings`);
      }
      const a = p.attach;
      if (!isRecord(a) || !['front-wall', 'front-edge', 'front-ground'].includes(a.at as string)) {
        fail(`${at}.attach.at must be front-wall, front-edge or front-ground`);
      }
      if (!['ground', 'ground-floor', 'top'].includes(a.z as string))
        fail(`${at}.attach.z must be ground, ground-floor or top`);
      if (
        !Array.isArray(p.materials) ||
        !p.materials.every((m) => typeof m === 'string' && m in palette)
      ) {
        fail(`${at}.materials must be palette keys`);
      }
      const fp = p.footprint_m;
      if (!Array.isArray(fp) || fp.length !== 2 || !fp.every(isPositive))
        fail(`${at}.footprint_m must be [width, depth]`);
      if (!isPositive(p.height_m)) fail(`${at}.height_m must be a positive number`);
    }
  }

  return input as unknown as Manifest;
}

/** Every loadable model, variant and prop by name, with its file and size. */
export function kitFiles(
  manifest: Manifest,
): Map<string, { file: string; footprint_m: [number, number]; height_m: number }> {
  const out = new Map<string, { file: string; footprint_m: [number, number]; height_m: number }>();
  for (const [name, m] of Object.entries(manifest.models)) {
    out.set(name, m);
    for (const v of m.variants ?? []) out.set(v.name, v);
  }
  for (const [name, p] of Object.entries(manifest.props ?? {})) out.set(name, p);
  return out;
}

/** A regional pack's own manifest (`<pack>/manifest.json`), for `ToyTown.addPack`. */
export interface PackManifest {
  version: 1;
  pack: string;
  palette: Record<string, string>;
  /** Models with file paths relative to the pack manifest. */
  models: Record<string, ModelEntry>;
  /** Landmark overrides: this OSM element uses this model, whatever its tags. */
  landmarks: { osm: string; category: string }[];
}

/** Validate a pack manifest. Its models use the same checks as the main manifest. */
export function parsePackManifest(input: unknown): PackManifest {
  if (!isRecord(input)) fail('pack manifest must be an object');
  if (typeof input.pack !== 'string' || !input.pack) fail('pack manifest needs a "pack" name');
  // Reuse the model checks by validating it as a main manifest. Pack models don't repeat the
  // pack name, so fill it in.
  const models = isRecord(input.models)
    ? Object.fromEntries(
        Object.entries(input.models).map(([k, m]) => [k, { ...(m as object), pack: input.pack }]),
      )
    : input.models;
  parseManifest({ ...input, models, units: 'metres', up: '+Y', front: '+Z', props: undefined });
  const landmarks = input.landmarks ?? [];
  if (!Array.isArray(landmarks)) fail('landmarks must be an array');
  for (const l of landmarks) {
    if (!isRecord(l) || typeof l.osm !== 'string' || !/^(node|way|relation)\/\d+$/.test(l.osm)) {
      fail(`landmark ${JSON.stringify(l)}: "osm" must look like "way/123"`);
    }
    if (typeof l.category !== 'string') fail(`landmark ${l.osm}: "category" must be a string`);
  }
  return {
    ...(input as unknown as PackManifest),
    landmarks: landmarks as PackManifest['landmarks'],
  };
}
