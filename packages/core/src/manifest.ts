/**
 * The model kit manifest (`assets/models/manifest.json`).
 *
 * Conventions are fixed: Y-up, metres, front faces +Z, origin at base centre,
 * one material per palette key.
 */
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
}

export interface Manifest {
  version: number;
  units: 'metres';
  up: '+Y';
  front: '+Z';
  /** Palette key to exact hex colour, e.g. `"roof_red": "#D9644A"`. */
  palette: Record<string, string>;
  models: Record<string, ModelEntry>;
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
  }

  return input as unknown as Manifest;
}
