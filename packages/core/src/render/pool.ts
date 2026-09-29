import { meshChunk, type BuildingInputFeature, type ChunkMesh, type LngLat } from '../geometry';
import type { BuildingTheme } from '../themes';
import type { MeshRequest, MeshResponse } from './protocol';

/**
 * Meshes chunks on a small pool of Web Workers. Falls back to the calling thread when Workers
 * aren't available (Node, some sandboxes).
 */
export class MeshPool {
  private workers: Worker[] = [];
  private pending = new Map<
    number,
    { resolve: (m: ChunkMesh) => void; reject: (e: Error) => void }
  >();
  private next = 0;

  constructor(
    size = Math.min(4, Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1)),
  ) {
    if (typeof Worker === 'undefined') return;
    try {
      for (let i = 0; i < size; i++) {
        const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<MeshResponse>) => this.settle(e.data);
        this.workers.push(w);
      }
    } catch {
      this.terminate();
    }
  }

  private settle(r: MeshResponse) {
    const p = this.pending.get(r.id);
    if (!p) return;
    this.pending.delete(r.id);
    if ('mesh' in r) p.resolve(r.mesh);
    else p.reject(new Error(r.error));
  }

  mesh(features: BuildingInputFeature[], origin: LngLat, theme: BuildingTheme): Promise<ChunkMesh> {
    if (!this.workers.length) return Promise.resolve(meshChunk(features, origin, theme));
    const id = this.next++;
    const worker = this.workers[id % this.workers.length]!;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, features, origin, theme } satisfies MeshRequest);
    });
  }

  terminate() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const p of this.pending.values()) p.reject(new Error('mesh pool terminated'));
    this.pending.clear();
  }
}
