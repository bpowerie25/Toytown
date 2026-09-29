import type { BuildingInputFeature, ChunkMesh, LngLat } from '../geometry';
import type { BuildingTheme } from '../themes';

export interface MeshRequest {
  id: number;
  features: BuildingInputFeature[];
  origin: LngLat;
  theme: BuildingTheme;
}

export type MeshResponse = { id: number; mesh: ChunkMesh } | { id: number; error: string };

/** Typed arrays in a mesh, for zero-copy transfer from the worker. */
export function transferables(m: ChunkMesh): ArrayBuffer[] {
  return [m.positions, m.normals, m.colors, m.walls, m.buildings, m.indices].map(
    (a) => a.buffer as ArrayBuffer,
  );
}
