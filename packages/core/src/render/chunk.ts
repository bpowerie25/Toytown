import { meshChunk, meshChunkPlain } from '../geometry/mesher';
import { planBuildings } from '../placement';
import type { ChunkRequest, ChunkResult } from './protocol';

/**
 * Plan hero models and props for a chunk, then mesh it at each level of detail: the buildings
 * that stay procedural, the ones hero models replace (for zooms below the models), and a plain
 * version of everything.
 */
export function processChunk({
  buildings,
  origin,
  theme,
  kit,
}: Omit<ChunkRequest, 'id'>): ChunkResult {
  const { meshed, placements } = planBuildings(buildings, kit, theme);
  const kept = new Set(meshed);
  return {
    full: meshChunk(meshed, origin, theme.buildings),
    fitted: meshChunk(
      buildings.filter((b) => !kept.has(b)),
      origin,
      theme.buildings,
    ),
    plain: meshChunkPlain(buildings, origin, theme.buildings),
    placements,
  };
}
