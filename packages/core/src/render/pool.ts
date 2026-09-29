import { processChunk } from './chunk';
import type { ChunkRequest, ChunkResponse, ChunkResult } from './protocol';

/**
 * Processes chunks (plan + mesh) on a small pool of Web Workers. Falls back to the calling thread
 * when Workers aren't available (Node, some sandboxes).
 */
export class ChunkPool {
  private workers: Worker[] = [];
  private pending = new Map<
    number,
    { resolve: (r: ChunkResult) => void; reject: (e: Error) => void }
  >();
  private next = 0;

  constructor(
    size = Math.min(4, Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1)),
  ) {
    if (typeof Worker === 'undefined') return;
    try {
      for (let i = 0; i < size; i++) {
        const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<ChunkResponse>) => this.settle(e.data);
        this.workers.push(w);
      }
    } catch {
      this.terminate();
    }
  }

  private settle(r: ChunkResponse) {
    const p = this.pending.get(r.id);
    if (!p) return;
    this.pending.delete(r.id);
    if ('error' in r) p.reject(new Error(r.error));
    else p.resolve({ mesh: r.mesh, placements: r.placements });
  }

  process(request: Omit<ChunkRequest, 'id'>): Promise<ChunkResult> {
    if (!this.workers.length) return Promise.resolve(processChunk(request));
    const id = this.next++;
    const worker = this.workers[id % this.workers.length]!;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, ...request } satisfies ChunkRequest);
    });
  }

  terminate() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const p of this.pending.values()) p.reject(new Error('chunk pool terminated'));
    this.pending.clear();
  }
}
