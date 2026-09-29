import { Sphere, Vector3 } from 'three';
import { tileBounds, type LngLat } from '../geometry';
import type { SceneFrame } from './frame';

/** Zoom thresholds for each level of detail. */
export interface LodOptions {
  /** Below this, only the base style (and its flat buildings) is drawn. */
  minZoom: number;
  /** From minZoom: plain extruded buildings. From this: full procedural buildings. */
  fullZoom: number;
  /** From this: hero models, props and trees replace fitted buildings. */
  modelZoom: number;
  /** From this: inverted-hull outlines on models (thinner than a pixel below it). */
  outlineZoom: number;
  /** Free a chunk's GPU memory after it has been out of view this long, in ms. */
  keepMs: number;
}

export const DEFAULT_LOD: LodOptions = {
  minZoom: 14,
  fullZoom: 15,
  modelZoom: 16,
  outlineZoom: 17,
  keepMs: 20_000,
};

/** 0: base style only; 1: plain buildings; 2: full buildings; 3: full buildings + models. */
export type LodLevel = 0 | 1 | 2 | 3;

export function lodLevel(zoom: number, lod: LodOptions): LodLevel {
  if (zoom < lod.minZoom) return 0;
  if (zoom < lod.fullZoom) return 1;
  if (zoom < lod.modelZoom) return 2;
  return 3;
}

/**
 * A bounding sphere in scene metres for a chunk tile, tall enough for its buildings and models,
 * with a margin for buildings anchored in the tile but reaching over its edge.
 */
export function chunkSphere(
  frame: SceneFrame,
  key: [number, number, number],
  height = 60,
  margin = 100,
): Sphere {
  const [w, s, e, n] = tileBounds(key[0], key[1], key[2]);
  const sw = frame.toScene([w, s] as LngLat);
  const ne = frame.toScene([e, n] as LngLat);
  const center = new Vector3((sw.x + ne.x) / 2, (sw.y + ne.y) / 2, height / 2);
  const radius = Math.hypot((ne.x - sw.x) / 2, (ne.y - sw.y) / 2, height / 2) + margin;
  return new Sphere(center, radius);
}

/** Chunks to free: loaded, not visible now, and not seen for longer than `keepMs`. */
export function chunksToDispose(
  chunks: Iterable<{ key: string; state: string; lastSeen: number }>,
  visible: Set<string>,
  now: number,
  keepMs: number,
): string[] {
  const out: string[] = [];
  for (const c of chunks) {
    if (c.state === 'ready' && !visible.has(c.key) && now - c.lastSeen > keepMs) out.push(c.key);
  }
  return out;
}
