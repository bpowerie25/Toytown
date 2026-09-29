import type { XY } from 'toytown-gl';

export { hash32 } from 'toytown-gl';

/** Uniform grid spatial index over axis-aligned boxes in local metres. */
export class Grid<T> {
  private cells = new Map<string, T[]>();

  constructor(private readonly size: number) {}

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  insert(item: T, minX: number, minY: number, maxX: number, maxY: number): void {
    const s = this.size;
    for (let cx = Math.floor(minX / s); cx <= Math.floor(maxX / s); cx++) {
      for (let cy = Math.floor(minY / s); cy <= Math.floor(maxY / s); cy++) {
        const k = this.key(cx, cy);
        const list = this.cells.get(k);
        if (list) list.push(item);
        else this.cells.set(k, [item]);
      }
    }
  }

  /** Items whose boxes share a cell with the box around `p` of the given radius. May repeat items. */
  *near([x, y]: XY, radius = 0): Generator<T> {
    const s = this.size;
    for (let cx = Math.floor((x - radius) / s); cx <= Math.floor((x + radius) / s); cx++) {
      for (let cy = Math.floor((y - radius) / s); cy <= Math.floor((y + radius) / s); cy++) {
        const list = this.cells.get(this.key(cx, cy));
        if (list) yield* list;
      }
    }
  }
}

export function bounds(points: XY[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; // prettier-ignore
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** Small seeded PRNG (mulberry32) returning floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
