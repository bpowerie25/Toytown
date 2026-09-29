import type { ChunkMesh, LngLat } from '../geometry';
import type { Placement, PlanKit, PlannedBuilding } from '../placement';
import type { Theme } from '../themes';

export interface ChunkRequest {
  id: number;
  buildings: PlannedBuilding[];
  origin: LngLat;
  theme: Theme;
  /** Null when no model kit is loaded: everything is meshed. */
  kit: PlanKit | null;
}

/** One chunk's geometry at each level of detail, plus its model and prop placements. */
export interface ChunkResult {
  /** Detailed buildings that keep their procedural geometry at every zoom. */
  full: ChunkMesh;
  /** Detailed buildings that hero models replace; shown only below the model zoom. */
  fitted: ChunkMesh;
  /** Every building as a plain extrusion, for the lowest 3D level. */
  plain: ChunkMesh;
  placements: Placement[];
}

export type ChunkResponse = ({ id: number } & ChunkResult) | { id: number; error: string };

/** Typed arrays in a chunk result, for zero-copy transfer from the worker. */
export function transferables(r: ChunkResult): ArrayBuffer[] {
  return [r.full, r.fitted, r.plain].flatMap((m) =>
    [m.positions, m.normals, m.colors, m.walls, m.buildings, m.edges, m.indices].map(
      (a) => a.buffer as ArrayBuffer,
    ),
  );
}
