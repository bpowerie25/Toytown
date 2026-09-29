/**
 * Streaming reader for OSM PBF extracts (e.g. Geofabrik), with no dependencies beyond node:zlib.
 * It keeps only what build-data needs inside a bbox, so a country extract can be scanned with a
 * small memory footprint.
 *
 * Format: https://wiki.openstreetmap.org/wiki/PBF_Format
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type { Tags } from 'toytown-gl';
import {
  inBBox,
  isBuildingRelation,
  isPoi,
  isTree,
  isTreeAreaRelation,
  type BBox,
  type OsmData,
  type OsmMember,
} from './osm';
import { ProtoReader, svarint, uvarint } from './protobuf';

const MEMBER_TYPES: OsmMember['type'][] = ['node', 'way', 'relation'];

export interface PbfOptions {
  bbox: BBox;
  /**
   * Extra margin around the bbox, in degrees, for nodes. Ways that straddle the bbox edge need
   * their outside nodes too. Default 0.01° (about 1 km).
   */
  margin?: number;
  log?: (msg: string) => void;
}

interface Block {
  strings: string[];
  granularity: number;
  latOffset: number;
  lonOffset: number;
}

function readBlob(buf: Uint8Array): Uint8Array {
  const r = new ProtoReader(buf);
  let raw: Uint8Array | null = null;
  let zlib: Uint8Array | null = null;
  while (!r.done) {
    const [f, w] = r.tag();
    if (f === 1 && w === 2) {
      const [s, e] = r.bytes();
      raw = buf.subarray(s, e);
    } else if (f === 3 && w === 2) {
      const [s, e] = r.bytes();
      zlib = buf.subarray(s, e);
    } else if (f >= 4 && f <= 7 && w === 2) {
      throw new Error(
        'PBF blob uses LZMA/bzip2/LZ4/zstd compression; only zlib and raw are supported',
      );
    } else r.skip(w);
  }
  if (raw) return raw;
  if (zlib) return inflateSync(zlib);
  throw new Error('PBF blob has no data');
}

function readHeader(buf: Uint8Array): { features: string[]; timestamp?: string } {
  const r = new ProtoReader(buf);
  const features: string[] = [];
  let timestamp: string | undefined;
  while (!r.done) {
    const [f, w] = r.tag();
    if (f === 4 && w === 2) features.push(r.string());
    else if (f === 32 && w === 0)
      timestamp = new Date(r.int() * 1000).toISOString().replace('.000Z', 'Z');
    else r.skip(w);
  }
  return { features, timestamp };
}

function tagsFrom(keys: number[], vals: number[], strings: string[]): Tags | undefined {
  if (keys.length === 0) return undefined;
  const tags: Tags = {};
  for (let i = 0; i < keys.length; i++) tags[strings[keys[i]!]!] = strings[vals[i]!]!;
  return tags;
}

export interface PbfVisitor {
  /** Optional cheap pre-filter on node coordinates, checked before any tag decoding. */
  keepNode?(lon: number, lat: number): boolean;
  node(id: number, lon: number, lat: number, tags: () => Tags | undefined): void;
  way(id: number, refs: number[], tags: () => Tags | undefined): void;
  relation(id: number, members: OsmMember[], tags: () => Tags | undefined): void;
}

/** Decode one PrimitiveBlock and call the visitor for each element. Tags are decoded lazily. */
export function readPrimitiveBlock(buf: Uint8Array, visit: PbfVisitor): void {
  const r = new ProtoReader(buf);
  const block: Block = { strings: [], granularity: 100, latOffset: 0, lonOffset: 0 };
  const groups: [number, number][] = [];
  while (!r.done) {
    const [f, w] = r.tag();
    if (f === 1 && w === 2) {
      const st = r.sub();
      while (!st.done) {
        const [sf, sw] = st.tag();
        if (sf === 1 && sw === 2) block.strings.push(st.string());
        else st.skip(sw);
      }
    } else if (f === 2 && w === 2) groups.push(r.bytes());
    else if (f === 17 && w === 0) block.granularity = r.varint();
    else if (f === 19 && w === 0) block.latOffset = r.int();
    else if (f === 20 && w === 0) block.lonOffset = r.int();
    else r.skip(w);
  }
  const { strings, granularity, latOffset, lonOffset } = block;
  const lat = (v: number) => 1e-9 * (latOffset + granularity * v);
  const lon = (v: number) => 1e-9 * (lonOffset + granularity * v);

  for (const [gs, ge] of groups) {
    const g = new ProtoReader(buf, gs, ge);
    while (!g.done) {
      const [f, w] = g.tag();
      if (w !== 2) {
        g.skip(w);
        continue;
      }
      const m = g.sub();
      if (f === 1) {
        // Node
        let id = 0, la = 0, lo = 0; // prettier-ignore
        let keys: number[] = [];
        let vals: number[] = [];
        while (!m.done) {
          const [nf, nw] = m.tag();
          if (nf === 1) id = m.svarint();
          else if (nf === 2) keys = m.packed(nw, uvarint);
          else if (nf === 3) vals = m.packed(nw, uvarint);
          else if (nf === 8) la = m.svarint();
          else if (nf === 9) lo = m.svarint();
          else m.skip(nw);
        }
        if (visit.keepNode && !visit.keepNode(lon(lo), lat(la))) continue;
        visit.node(id, lon(lo), lat(la), () => tagsFrom(keys, vals, strings));
      } else if (f === 2) {
        // DenseNodes
        let ids: number[] = [];
        let lats: number[] = [];
        let lons: number[] = [];
        let kv: number[] = [];
        while (!m.done) {
          const [nf, nw] = m.tag();
          if (nf === 1) ids = m.packed(nw, svarint);
          else if (nf === 8) lats = m.packed(nw, svarint);
          else if (nf === 9) lons = m.packed(nw, svarint);
          else if (nf === 10) kv = m.packed(nw, uvarint);
          else m.skip(nw);
        }
        let id = 0, la = 0, lo = 0, k = 0; // prettier-ignore
        for (let i = 0; i < ids.length; i++) {
          id += ids[i]!;
          la += lats[i]!;
          lo += lons[i]!;
          const start = k;
          if (kv.length) {
            while (kv[k] !== 0 && k < kv.length) k += 2;
            k++; // skip the 0 delimiter
          }
          const end = k - 1;
          const x = lon(lo);
          const y = lat(la);
          if (visit.keepNode && !visit.keepNode(x, y)) continue;
          visit.node(id, x, y, () => {
            if (end <= start) return undefined;
            const tags: Tags = {};
            for (let j = start; j < end; j += 2) tags[strings[kv[j]!]!] = strings[kv[j + 1]!]!;
            return tags;
          });
        }
      } else if (f === 3) {
        // Way
        let id = 0;
        let keys: number[] = [];
        let vals: number[] = [];
        let refs: number[] = [];
        while (!m.done) {
          const [nf, nw] = m.tag();
          if (nf === 1) id = m.int();
          else if (nf === 2) keys = m.packed(nw, uvarint);
          else if (nf === 3) vals = m.packed(nw, uvarint);
          else if (nf === 8) refs = m.packed(nw, svarint);
          else m.skip(nw);
        }
        for (let i = 1; i < refs.length; i++) refs[i]! += refs[i - 1]!;
        visit.way(id, refs, () => tagsFrom(keys, vals, strings));
      } else if (f === 4) {
        // Relation
        let id = 0;
        let keys: number[] = [];
        let vals: number[] = [];
        let roles: number[] = [];
        let memids: number[] = [];
        let types: number[] = [];
        while (!m.done) {
          const [nf, nw] = m.tag();
          if (nf === 1) id = m.int();
          else if (nf === 2) keys = m.packed(nw, uvarint);
          else if (nf === 3) vals = m.packed(nw, uvarint);
          else if (nf === 8) roles = m.packed(nw, uvarint);
          else if (nf === 9) memids = m.packed(nw, svarint);
          else if (nf === 10) types = m.packed(nw, uvarint);
          else m.skip(nw);
        }
        let ref = 0;
        const members = memids.map((d, i) => {
          ref += d;
          return { type: MEMBER_TYPES[types[i]!]!, ref, role: strings[roles[i]!] ?? '' };
        });
        visit.relation(id, members, () => tagsFrom(keys, vals, strings));
      }
    }
  }
}

/** Iterate over the raw blobs of a PBF file: [type, decompressed data]. */
export function* pbfBlobs(path: string): Generator<[string, Uint8Array, number, number]> {
  const fd = openSync(path, 'r');
  const size = statSync(path).size;
  try {
    let pos = 0;
    const lenBuf = new Uint8Array(4);
    while (pos < size) {
      readSync(fd, lenBuf, 0, 4, pos);
      const headerLen = new DataView(lenBuf.buffer).getUint32(0, false);
      pos += 4;
      const header = new Uint8Array(headerLen);
      readSync(fd, header, 0, headerLen, pos);
      pos += headerLen;
      const hr = new ProtoReader(header);
      let type = '';
      let dataSize = 0;
      while (!hr.done) {
        const [f, w] = hr.tag();
        if (f === 1 && w === 2) type = hr.string();
        else if (f === 3 && w === 0) dataSize = hr.varint();
        else hr.skip(w);
      }
      const blob = new Uint8Array(dataSize);
      readSync(fd, blob, 0, dataSize, pos);
      pos += dataSize;
      yield [type, readBlob(blob), pos, size];
    }
  } finally {
    closeSync(fd);
  }
}

/**
 * Read the elements build-data needs from a PBF file:
 * - nodes inside bbox+margin (coordinates; tags only for POIs and trees),
 * - ways with at least one of those nodes (all ways, since multipolygon members may be untagged),
 * - building and park/grass multipolygon relations with a member way in range.
 * Ways that are neither needed directly nor relation members are dropped at the end.
 */
export function readPbf(path: string, opts: PbfOptions): OsmData {
  const margin = opts.margin ?? 0.01;
  const [w, s, e, n] = opts.bbox;
  const outer: BBox = [w - margin, s - margin, e + margin, n + margin];
  const log = opts.log ?? (() => {});
  const data: OsmData = { nodes: new Map(), ways: new Map(), relations: new Map() };
  let lastLog = 0;

  const visitor: PbfVisitor = {
    keepNode: (lon, lat) => inBBox(lon, lat, outer),
    node(id, lon, lat, tags) {
      const t = tags();
      data.nodes.set(id, t && (isPoi(t) || isTree(t)) ? { lon, lat, tags: t } : { lon, lat });
    },
    way(id, refs, tags) {
      if (!refs.some((r) => data.nodes.has(r))) return;
      data.ways.set(id, { refs, tags: tags() });
    },
    relation(id, members, tags) {
      const t = tags();
      if (!(isBuildingRelation(t) || isTreeAreaRelation(t))) return;
      if (!members.some((m) => m.type === 'way' && data.ways.has(m.ref))) return;
      data.relations.set(id, { members, tags: t });
    },
  };

  for (const [type, blob, pos, size] of pbfBlobs(path)) {
    if (type === 'OSMHeader') {
      const h = readHeader(blob);
      const unsupported = h.features.filter((f) => !['OsmSchema-V0.6', 'DenseNodes'].includes(f));
      if (unsupported.length)
        throw new Error(`PBF needs unsupported features: ${unsupported.join(', ')}`);
      if (h.timestamp) data.timestamp = h.timestamp;
    } else if (type === 'OSMData') {
      readPrimitiveBlock(blob, visitor);
    }
    const now = Date.now();
    if (now - lastLog > 5000) {
      log(
        `pbf: ${((pos / size) * 100).toFixed(0)}% (${data.nodes.size} nodes, ${data.ways.size} ways kept)`,
      );
      lastLog = now;
    }
  }
  log(
    `pbf: done (${data.nodes.size} nodes, ${data.ways.size} ways, ${data.relations.size} relations kept)`,
  );
  return data;
}
