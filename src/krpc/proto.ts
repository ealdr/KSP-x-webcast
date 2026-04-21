/**
 * Minimal Protocol Buffer v3 encoder/decoder for kRPC.
 * Supports the subset of wire types used by kRPC:
 *   0 = varint, 1 = 64-bit, 2 = length-delimited, 5 = 32-bit
 */

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrays) { out.set(a, off); off += a.length }
  return out
}

// ---------------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------------

/** Encode an unsigned integer as a protobuf varint (handles values up to 2^53). */
export function encodeVarint(n: number): Uint8Array {
  const bytes: number[] = []
  while (n > 127) {
    bytes.push((n & 0x7f) | 0x80)
    n = n >>> 7
  }
  bytes.push(n & 0x7f)
  return new Uint8Array(bytes)
}

const tag = (fieldNum: number, wire: number) => encodeVarint((fieldNum << 3) | wire)

/** Wire type 0 — varint field */
export function fVarint(fieldNum: number, value: number): Uint8Array {
  return concat(tag(fieldNum, 0), encodeVarint(value))
}

/** Wire type 2 — length-delimited field (bytes or embedded message) */
export function fBytes(fieldNum: number, data: Uint8Array): Uint8Array {
  return concat(tag(fieldNum, 2), encodeVarint(data.length), data)
}

/** Wire type 2 — string field */
export function fStr(fieldNum: number, s: string): Uint8Array {
  return fBytes(fieldNum, new TextEncoder().encode(s))
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

export interface Field {
  num: number
  wire: number
  /** bytes for wire types 1, 2, 5; number for wire type 0 (varint) */
  raw: Uint8Array | number
}

/** Decode varint from buf at offset. Returns [value, bytesConsumed]. */
export function decodeVarint(buf: Uint8Array, off: number): [number, number] {
  let val = 0, shift = 0, read = 0
  while (true) {
    const b = buf[off + read++]
    val |= (b & 0x7f) << shift
    shift += 7
    if ((b & 0x80) === 0) break
    if (shift > 28) throw new Error('varint too large for safe integer')
  }
  return [val >>> 0, read]
}

/** Parse all wire fields from a protobuf-encoded message. */
export function parseFields(buf: Uint8Array): Field[] {
  const out: Field[] = []
  let off = 0
  while (off < buf.length) {
    const [tagVal, tagLen] = decodeVarint(buf, off); off += tagLen
    const num = tagVal >>> 3
    const wire = tagVal & 7
    if (wire === 0) {
      const [val, len] = decodeVarint(buf, off); off += len
      out.push({ num, wire, raw: val })
    } else if (wire === 1) {
      out.push({ num, wire, raw: buf.slice(off, off + 8) }); off += 8
    } else if (wire === 2) {
      const [len, lenLen] = decodeVarint(buf, off); off += lenLen
      out.push({ num, wire, raw: buf.slice(off, off + len) }); off += len
    } else if (wire === 5) {
      out.push({ num, wire, raw: buf.slice(off, off + 4) }); off += 4
    } else {
      throw new Error(`Unknown protobuf wire type ${wire} at offset ${off}`)
    }
  }
  return out
}

/** First length-delimited field with the given number, or null. */
export function getBytes(fields: Field[], num: number): Uint8Array | null {
  const f = fields.find(f => f.num === num && f.wire === 2)
  return f ? f.raw as Uint8Array : null
}

/** All length-delimited fields with the given number. */
export function getAllBytes(fields: Field[], num: number): Uint8Array[] {
  return fields.filter(f => f.num === num && f.wire === 2).map(f => f.raw as Uint8Array)
}

/** First varint field with the given number, or null. */
export function getVarint(fields: Field[], num: number): number | null {
  const f = fields.find(f => f.num === num && f.wire === 0)
  return f != null ? f.raw as number : null
}

// ---------------------------------------------------------------------------
// Value decoders
// kRPC encodes scalar return values as a single-field message:
//   double  → field 1, wire 1 (64-bit) → tag 0x09 + 8 bytes LE
//   float   → field 1, wire 5 (32-bit) → tag 0x0d + 4 bytes LE
//   int/enum→ field 1, wire 0 (varint)  → tag 0x08 + varint
// ---------------------------------------------------------------------------

export function decodeDouble(v: Uint8Array): number {
  // tag 0x09 (field 1, wire 1) + 8 bytes little-endian
  if (v.length === 9 && v[0] === 0x09) {
    return new DataView(v.buffer, v.byteOffset + 1, 8).getFloat64(0, true)
  }
  // Bare 8 bytes (some versions omit the tag for primitives — unlikely but defensive)
  if (v.length === 8) {
    return new DataView(v.buffer, v.byteOffset, 8).getFloat64(0, true)
  }
  throw new Error(`decodeDouble: unexpected ${v.length} bytes (hex: ${hex(v)})`)
}

export function decodeFloat(v: Uint8Array): number {
  // tag 0x0d (field 1, wire 5) + 4 bytes little-endian
  if (v.length === 5 && v[0] === 0x0d) {
    return new DataView(v.buffer, v.byteOffset + 1, 4).getFloat32(0, true)
  }
  if (v.length === 4) {
    return new DataView(v.buffer, v.byteOffset, 4).getFloat32(0, true)
  }
  throw new Error(`decodeFloat: unexpected ${v.length} bytes (hex: ${hex(v)})`)
}

export function decodeUint32(v: Uint8Array): number {
  // tag 0x08 (field 1, wire 0) + varint
  if (v.length >= 1 && v[0] === 0x08) {
    return decodeVarint(v, 1)[0]
  }
  return decodeVarint(v, 0)[0]
}

/** Debug helper */
export function hex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join(' ')
}
