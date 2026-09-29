/** Test helper: a minimal OSM PBF encoder, just enough to exercise the reader. */
import { deflateSync } from 'node:zlib';

class W {
  bytes: number[] = [];
  varint(n: number): this {
    while (n >= 0x80) {
      this.bytes.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.bytes.push(n);
    return this;
  }
  svarint(n: number): this {
    return this.varint(n >= 0 ? n * 2 : -n * 2 - 1);
  }
  tag(field: number, wire: number): this {
    return this.varint(field * 8 + wire);
  }
  field(field: number, n: number): this {
    return this.tag(field, 0).varint(n);
  }
  bytesField(field: number, b: Uint8Array | number[]): this {
    this.tag(field, 2).varint(b.length);
    this.bytes.push(...b);
    return this;
  }
  str(field: number, s: string): this {
    return this.bytesField(field, [...new TextEncoder().encode(s)]);
  }
  packed(field: number, ns: number[], signed = false): this {
    const w = new W();
    for (const n of ns) {
      if (signed) w.svarint(n);
      else w.varint(n);
    }
    return this.bytesField(field, w.bytes);
  }
  get u8(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

const deltas = (xs: number[]) => xs.map((x, i) => x - (i ? xs[i - 1]! : 0));

export interface TestNode {
  id: number;
  lon: number;
  lat: number;
  tags?: Record<string, string>;
}
export interface TestWay {
  id: number;
  refs: number[];
  tags?: Record<string, string>;
}
export interface TestRelation {
  id: number;
  members: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[];
  tags?: Record<string, string>;
}

function blob(type: string, payload: Uint8Array): number[] {
  const b = new W().field(2, payload.length).bytesField(3, [...deflateSync(payload)]).u8;
  const header = new W().str(1, type).field(3, b.length).u8;
  const len = [
    (header.length >>> 24) & 255,
    (header.length >>> 16) & 255,
    (header.length >>> 8) & 255,
    header.length & 255,
  ];
  return [...len, ...header, ...b];
}

export function encodePbf(
  nodes: TestNode[],
  ways: TestWay[],
  relations: TestRelation[],
  timestamp?: number,
): Uint8Array {
  const header = new W().str(4, 'OsmSchema-V0.6').str(4, 'DenseNodes');
  if (timestamp) header.field(32, timestamp);

  const strings = [''];
  const sid = (s: string) => {
    let i = strings.indexOf(s);
    if (i < 0) i = strings.push(s) - 1;
    return i;
  };

  // Dense nodes
  const kv: number[] = [];
  for (const n of nodes) {
    for (const [k, v] of Object.entries(n.tags ?? {})) kv.push(sid(k), sid(v));
    kv.push(0);
  }
  const dense = new W()
    .packed(1, deltas(nodes.map((n) => n.id)), true)
    .packed(8, deltas(nodes.map((n) => Math.round(n.lat * 1e7))), true)
    .packed(9, deltas(nodes.map((n) => Math.round(n.lon * 1e7))), true)
    .packed(10, kv);
  const g1 = new W().bytesField(2, dense.bytes);

  const g2 = new W();
  for (const w of ways) {
    const tags = Object.entries(w.tags ?? {});
    const m = new W().field(1, w.id);
    if (tags.length)
      m.packed(
        2,
        tags.map(([k]) => sid(k)),
      ).packed(
        3,
        tags.map(([, v]) => sid(v)),
      );
    m.packed(8, deltas(w.refs), true);
    g2.bytesField(3, m.bytes);
  }
  const g3 = new W();
  for (const r of relations) {
    const tags = Object.entries(r.tags ?? {});
    const m = new W().field(1, r.id);
    if (tags.length)
      m.packed(
        2,
        tags.map(([k]) => sid(k)),
      ).packed(
        3,
        tags.map(([, v]) => sid(v)),
      );
    m.packed(
      8,
      r.members.map((x) => sid(x.role)),
    )
      .packed(9, deltas(r.members.map((x) => x.ref)), true)
      .packed(
        10,
        r.members.map((x) => ['node', 'way', 'relation'].indexOf(x.type)),
      );
    g3.bytesField(4, m.bytes);
  }

  const st = new W();
  for (const s of strings) st.str(1, s);
  const block = new W()
    .bytesField(1, st.bytes)
    .bytesField(2, g1.bytes)
    .bytesField(2, g2.bytes)
    .bytesField(2, g3.bytes);
  block.field(17, 100);

  return Uint8Array.from([...blob('OSMHeader', header.u8), ...blob('OSMData', block.u8)]);
}
