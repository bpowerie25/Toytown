/**
 * Minimal protobuf wire-format reader for OSM PBF. Values are JS numbers: OSM ids and
 * coordinates fit comfortably below 2^53.
 */
export class ProtoReader {
  pos: number;
  readonly end: number;

  constructor(
    readonly buf: Uint8Array,
    start = 0,
    end = buf.length,
  ) {
    this.pos = start;
    this.end = end;
  }

  get done(): boolean {
    return this.pos >= this.end;
  }

  varint(): number {
    const buf = this.buf;
    let b = buf[this.pos++]!;
    let result = b & 0x7f;
    if (b < 0x80) return result;
    b = buf[this.pos++]!;
    result |= (b & 0x7f) << 7;
    if (b < 0x80) return result;
    b = buf[this.pos++]!;
    result |= (b & 0x7f) << 14;
    if (b < 0x80) return result;
    b = buf[this.pos++]!;
    result |= (b & 0x7f) << 21;
    if (b < 0x80) return result;
    // Beyond 28 bits: bitwise ops would overflow, so continue with multiplication.
    let value = result;
    let mul = 2 ** 28;
    do {
      b = buf[this.pos++]!;
      value += (b & 0x7f) * mul;
      mul *= 128;
    } while (b >= 0x80);
    return value;
  }

  /** Signed zigzag varint (sint32/sint64). */
  svarint(): number {
    const n = this.varint();
    return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
  }

  /** int32/int64 stored as plain varint; negative values use 10 bytes (two's complement). */
  int(): number {
    const n = this.varint();
    return n >= 2 ** 63 ? n - 2 ** 64 : n;
  }

  /** Start/end of a length-delimited field's payload; advances past it. */
  bytes(): [number, number] {
    const len = this.varint();
    const start = this.pos;
    this.pos += len;
    return [start, this.pos];
  }

  sub(): ProtoReader {
    const [s, e] = this.bytes();
    return new ProtoReader(this.buf, s, e);
  }

  string(): string {
    const [s, e] = this.bytes();
    return new TextDecoder().decode(this.buf.subarray(s, e));
  }

  /** Read a tag; returns [fieldNumber, wireType]. */
  tag(): [number, number] {
    const t = this.varint();
    return [t >>> 3, t & 7];
  }

  skip(wireType: number): void {
    if (wireType === 0) this.varint();
    else if (wireType === 1) this.pos += 8;
    else if (wireType === 2) this.bytes();
    else if (wireType === 5) this.pos += 4;
    else throw new Error(`unsupported protobuf wire type ${wireType}`);
  }

  /** Packed repeated varints (or a single unpacked one). */
  packed(wireType: number, read: (r: ProtoReader) => number): number[] {
    if (wireType !== 2) return [read(this)];
    const r = this.sub();
    const out: number[] = [];
    while (!r.done) out.push(read(r));
    return out;
  }
}

export const uvarint = (r: ProtoReader) => r.varint();
export const svarint = (r: ProtoReader) => r.svarint();
