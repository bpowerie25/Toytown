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

export interface ChunkResult {
  mesh: ChunkMesh;
  placements: Placement[];
}

export type ChunkResponse = ({ id: number } & ChunkResult) | { id: number; error: string };

/** Typed arrays in a mesh, for zero-copy transfer from the worker. */
export function transferables(m: ChunkMesh): ArrayBuffer[] {
  return [m.positions, m.normals, m.colors, m.walls, m.buildings, m.edges, m.indices].map(
    (a) => a.buffer as ArrayBuffer,
  );
}
