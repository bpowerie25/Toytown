import { meshChunk } from '../geometry/mesher';
import { planBuildings } from '../placement';
import type { ChunkRequest, ChunkResult } from './protocol';

/** Plan hero models and props for a chunk, then mesh the buildings that stay procedural. */
export function processChunk({
  buildings,
  origin,
  theme,
  kit,
}: Omit<ChunkRequest, 'id'>): ChunkResult {
  const { meshed, placements } = planBuildings(buildings, kit, theme);
  return { mesh: meshChunk(meshed, origin, theme.buildings), placements };
}
