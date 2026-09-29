/** Deterministic 32-bit string hash (FNV-1a). Used for stable per-building choices. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A stable number in [0, 1) for a key. */
export function hashUnit(s: string): number {
  // Mix again so nearby keys ("way/1", "way/2") spread well.
  let h = hash32(s);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Pick an item from a list by a stable hash of a key. */
export function pick<T>(items: readonly T[], key: string): T {
  return items[Math.floor(hashUnit(key) * items.length)]!;
}
