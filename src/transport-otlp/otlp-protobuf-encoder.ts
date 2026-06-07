/**
 * Hand-built OTLP/HTTP+protobuf logs encoder (PE-1..PE-7).
 *
 * Pure, synchronous, zero-dependency protobuf wire format encoding for the
 * `OtlpLogsRequest` object model. Called from `encode(request, 'protobuf')`
 * in the encoding seam (FR-015 / R2).
 *
 * Spec: specs/022-otlp-protobuf-encoding/contracts/otlp-protobuf-encoding.md
 *
 * ## Wire format reference
 *
 * Protobuf binary encoding uses field tags of the form
 * `(field_number << 3) | wire_type` encoded as a base-128 varint. Wire types:
 *
 * | Wire type | Value | Used for                                          |
 * |-----------|-------|---------------------------------------------------|
 * | Varint    | 0     | int32, int64, uint32, uint64, bool, enum          |
 * | Fixed64   | 1     | fixed64, double (8 bytes little-endian)           |
 * | LEN       | 2     | string, bytes, nested messages, repeated packed   |
 * | Fixed32   | 5     | fixed32 (4 bytes little-endian)                   |
 *
 * Nested messages are length-delimited: tag, varint byte-length, then the
 * serialized inner message bytes. Repeated message fields repeat the tag for
 * each element — they are NOT packed (proto3 packs only scalar repeateds).
 *
 * Zero-value fields are omitted per proto3 conventions (0 / "" / false / []
 * / undefined are not written to the wire).
 */

import type { AnyValue, KeyValue } from './attributes.js';
import type {
  OtlpLogRecord,
  OtlpLogsRequest,
  OtlpResourceLogs,
  OtlpScopeLogs,
} from './otlp-serializer.js';

// ---------------------------------------------------------------------------
// Wire type constants (protobuf spec §2.3)
// ---------------------------------------------------------------------------

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;

// ---------------------------------------------------------------------------
// ProtobufWriter — resizable buffer for protobuf binary encoding
// ---------------------------------------------------------------------------

/**
 * Low-level protobuf wire-format writer backed by a resizable `Uint8Array`.
 *
 * All numeric writes are little-endian. Varints use unsigned base-128 encoding.
 * The buffer starts at 1024 bytes and doubles on overflow — typical OTLP log
 * batches with 20 records fit in well under 4 KiB.
 */
class ProtobufWriter {
  private buf: Uint8Array;
  private pos: number;

  constructor(initialSize = 1024) {
    this.buf = new Uint8Array(initialSize);
    this.pos = 0;
  }

  // --- Primitive writers ---

  /**
   * Write raw bytes verbatim. Caller is responsible for any length prefix
   * (use `writeString` for length-delimited UTF-8, `writeBytes` for raw
   * byte sequences that already have a length prefix written separately).
   */
  writeRaw(bytes: Uint8Array): void {
    this.ensureCapacity(bytes.length);
    this.buf.set(bytes, this.pos);
    this.pos += bytes.length;
  }

  /**
   * Write an unsigned base-128 varint. Each byte uses the MSB as a
   * continuation bit: MSB=1 means more bytes follow; MSB=0 marks the last
   * byte. The remaining 7 bits carry the value in little-endian order.
   *
   * Used for field tags, message lengths, severity_number, boolValue,
   * and intValue (non-negative).
   */
  writeVarint(n: number): void {
    if (!Number.isInteger(n) || n < 0) {
      // Fail-closed: write zero for invalid input rather than corrupting the
      // buffer. The caller (encode functions) only passes sanitized values.
      this.ensureCapacity(1);
      this.buf[this.pos++] = 0;
      return;
    }
    while (n > 0x7f) {
      this.ensureCapacity(1);
      this.buf[this.pos++] = (n & 0x7f) | 0x80;
      n >>>= 7;
    }
    this.ensureCapacity(1);
    this.buf[this.pos++] = n & 0x7f;
  }

  /**
   * Write a BigInt as an unsigned base-128 varint. Used for negative int64
   * values (intValue field) which must be encoded as their 64-bit two's
   * complement representation (10 bytes for negative values).
   */
  writeVarintBig(n: bigint): void {
    const zero = BigInt(0);
    if (n < zero) {
      this.ensureCapacity(1);
      this.buf[this.pos++] = 0;
      return;
    }
    const sevenF = BigInt(0x7f);
    const eighty = BigInt(0x80);
    const seven = BigInt(7);
    while (n > sevenF) {
      this.ensureCapacity(1);
      this.buf[this.pos++] = Number((n & sevenF) | eighty);
      n >>= seven;
    }
    this.ensureCapacity(1);
    this.buf[this.pos++] = Number(n & sevenF);
  }

  /**
   * Write 8 bytes in little-endian order for a uint64 value (fixed64 wire
   * type). Splits the number into low and high 32-bit words, then writes
   * each word little-endian. Safe for values up to 2^53 (JS Number limit);
   * for larger values precision loss in the high word is accepted — nano
   * timestamps are the primary use case and sub-microsecond precision is
   * not required.
   */
  writeFixed64(n: number): void {
    this.ensureCapacity(8);
    const lo = (n >>> 0) & 0xffffffff;
    const hi = Math.floor(n / 0x100000000) & 0xffffffff;
    this.buf[this.pos++] = lo & 0xff;
    this.buf[this.pos++] = (lo >>> 8) & 0xff;
    this.buf[this.pos++] = (lo >>> 16) & 0xff;
    this.buf[this.pos++] = (lo >>> 24) & 0xff;
    this.buf[this.pos++] = hi & 0xff;
    this.buf[this.pos++] = (hi >>> 8) & 0xff;
    this.buf[this.pos++] = (hi >>> 16) & 0xff;
    this.buf[this.pos++] = (hi >>> 24) & 0xff;
  }

  /**
   * Write 8 bytes in little-endian IEEE 754 double-precision format
   * (fixed64 wire type used for `doubleValue` in AnyValue). Uses a
   * Float64Array + Uint8Array view for correct bit-level encoding
   * regardless of platform endianness.
   */
  writeDouble(n: number): void {
    this.ensureCapacity(8);
    const fa = new Float64Array(1);
    fa[0] = n;
    const bytes = new Uint8Array(fa.buffer);
    // Float64Array uses platform byte order, but we need little-endian.
    // On little-endian platforms (all modern browsers) this is a no-op;
    // the bytes are already in the correct order.
    this.buf.set(bytes, this.pos);
    this.pos += 8;
  }

  /**
   * Write 4 bytes in little-endian order (fixed32 wire type). Used for the
   * `flags` field on LogRecord.
   */
  writeFixed32(n: number): void {
    this.ensureCapacity(4);
    const u = (n >>> 0) & 0xffffffff;
    this.buf[this.pos++] = u & 0xff;
    this.buf[this.pos++] = (u >>> 8) & 0xff;
    this.buf[this.pos++] = (u >>> 16) & 0xff;
    this.buf[this.pos++] = (u >>> 24) & 0xff;
  }

  /**
   * Write a length-delimited byte sequence: varint length prefix followed
   * by the raw bytes. Used for `trace_id` and `span_id` (hex-decoded
   * binary) on LogRecord.
   */
  writeLengthDelimited(bytes: Uint8Array): void {
    this.writeVarint(bytes.length);
    this.writeRaw(bytes);
  }

  /**
   * Write a UTF-8 string in length-delimited wire format: varint byte count
   * of the UTF-8 representation, then the UTF-8 bytes.
   */
  writeString(s: string): void {
    const encoded = new TextEncoder().encode(s);
    this.writeVarint(encoded.length);
    this.writeRaw(encoded);
  }

  // --- Tag + message helpers ---

  /**
   * Write a protobuf field tag: `(field_number << 3) | wire_type` encoded
   * as a varint. All OTLP logs field numbers are < 16, so tags fit in a
   * single byte.
   */
  writeTag(fieldNumber: number, wireType: number): void {
    this.writeVarint((fieldNumber << 3) | wireType);
  }

  /**
   * Write a length-delimited nested message:
   * 1. Write the field tag (field_number, WIRE_LENGTH_DELIMITED).
   * 2. Serialize the inner message to a temporary buffer to measure its
   *    exact byte length.
   * 3. Write the length as a varint, then the inner bytes.
   *
   * Creating a temporary writer per nested message is allocation-heavy but
   * correct and simple. The OTLP log schema has shallow nesting (max depth
   * ~4: LogsData → ResourceLogs → ScopeLogs → LogRecord → AnyValue), so
   * the overhead is bounded.
   */
  writeMessage(
    fieldNumber: number,
    encodeFn: (w: ProtobufWriter) => void,
  ): void {
    const inner = new ProtobufWriter();
    encodeFn(inner);
    const innerBytes = inner.toUint8Array();

    this.writeTag(fieldNumber, WIRE_LENGTH_DELIMITED);
    this.writeVarint(innerBytes.length);
    this.writeRaw(innerBytes);
  }

  /**
   * Write a varint-valued field: tag (field_number, WIRE_VARINT) followed
   * by the varint-encoded value. Used for severity_number and boolValue.
   */
  writeVarintField(fieldNumber: number, value: number): void {
    this.writeTag(fieldNumber, WIRE_VARINT);
    this.writeVarint(value);
  }

  /**
   * Write a fixed64-valued field: tag (field_number, WIRE_FIXED64) followed
   * by 8 little-endian bytes. Used for time_unix_nano and
   * observed_time_unix_nano.
   */
  writeFixed64Field(fieldNumber: number, value: number): void {
    this.writeTag(fieldNumber, WIRE_FIXED64);
    this.writeFixed64(value);
  }

  /**
   * Write a fixed32-valued field: tag (field_number, WIRE_FIXED32) followed
   * by 4 little-endian bytes. Used for LogRecord.flags.
   */
  writeFixed32Field(fieldNumber: number, value: number): void {
    this.writeTag(fieldNumber, WIRE_FIXED32);
    this.writeFixed32(value);
  }

  /**
   * Write a length-delimited string field: tag (field_number,
   * WIRE_LENGTH_DELIMITED) followed by varint length and UTF-8 bytes.
   */
  writeStringField(fieldNumber: number, value: string): void {
    this.writeTag(fieldNumber, WIRE_LENGTH_DELIMITED);
    this.writeString(value);
  }

  /**
   * Write a length-delimited bytes field: tag (field_number,
   * WIRE_LENGTH_DELIMITED) followed by varint length and raw bytes.
   */
  writeBytesField(fieldNumber: number, bytes: Uint8Array): void {
    this.writeTag(fieldNumber, WIRE_LENGTH_DELIMITED);
    this.writeLengthDelimited(bytes);
  }

  /** Return the final trimmed buffer containing only written bytes. */
  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }

  // --- Internal ---

  /** Grow the internal buffer if needed to accommodate `extra` more bytes. */
  private ensureCapacity(extra: number): void {
    const needed = this.pos + extra;
    if (needed <= this.buf.length) return;
    let newSize = this.buf.length;
    while (newSize < needed) {
      newSize *= 2;
    }
    const copy = new Uint8Array(newSize);
    copy.set(this.buf);
    this.buf = copy;
  }
}

// ---------------------------------------------------------------------------
// Hex decoding (R5 trace correlation)
// ---------------------------------------------------------------------------

/**
 * Decode a hex string to a byte array of the expected length.
 * Returns `null` if the string is not valid hex or has the wrong length,
 * so callers can omit the field (fail-closed — produce a valid but
 * uncorrelated LogRecord rather than invalid protobuf).
 */
function hexDecode(hex: string, expectedBytes: number): Uint8Array | null {
  if (hex.length !== expectedBytes * 2) return null;
  const bytes = new Uint8Array(expectedBytes);
  for (let i = 0; i < expectedBytes; i++) {
    const hi = hexNibble(hex.charCodeAt(i * 2));
    const lo = hexNibble(hex.charCodeAt(i * 2 + 1));
    if (hi === -1 || lo === -1) return null;
    bytes[i] = (hi << 4) | lo;
  }
  return bytes;
}

/** Convert a single hex character (ASCII code point) to its 4-bit value. */
function hexNibble(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30; // '0'–'9'
  if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10; // 'a'–'f'
  if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10; // 'A'–'F'
  return -1;
}

// ---------------------------------------------------------------------------
// Message encoders (visitor functions — each takes writer + data)
// ---------------------------------------------------------------------------

/**
 * Encode the top-level `LogsData` message.
 *
 * ```
 * LogsData
 *   resource_logs (field 1, repeated ResourceLogs)
 * ```
 *
 * Each ResourceLogs element is a length-delimited nested message. An empty
 * request (resourceLogs = []) produces a valid but minimal `LogsData` — zero
 * bytes on the wire.
 */
function encodeLogsData(w: ProtobufWriter, request: OtlpLogsRequest): void {
  for (const rl of request.resourceLogs) {
    w.writeMessage(1, (inner) => encodeResourceLogs(inner, rl));
  }
}

/**
 * Encode a `ResourceLogs` message.
 *
 * ```
 * ResourceLogs
 *   resource   (field 1, Resource)          — omitted if attributes is empty
 *   scope_logs (field 2, repeated ScopeLogs)
 * ```
 */
function encodeResourceLogs(w: ProtobufWriter, rl: OtlpResourceLogs): void {
  // Omit resource if there are no identity attributes (proto3 default).
  if (rl.resource.attributes.length > 0) {
    w.writeMessage(1, (inner) => {
      for (const kv of rl.resource.attributes) {
        inner.writeMessage(1, (inner2) => encodeKeyValue(inner2, kv));
      }
    });
  }

  for (const sl of rl.scopeLogs) {
    w.writeMessage(2, (inner) => encodeScopeLogs(inner, sl));
  }
}

/**
 * Encode a `ScopeLogs` message.
 *
 * ```
 * ScopeLogs
 *   scope       (field 1, InstrumentationScope)
 *   log_records (field 2, repeated LogRecord)  — omitted if empty
 * ```
 *
 * `InstrumentationScope` is encoded inline: only field 1 (name, string)
 * is written.
 */
function encodeScopeLogs(w: ProtobufWriter, sl: OtlpScopeLogs): void {
  // InstrumentationScope: field 1 = name (string).
  w.writeMessage(1, (inner) => {
    inner.writeStringField(1, sl.scope.name);
  });

  for (const record of sl.logRecords) {
    w.writeMessage(2, (inner) => encodeLogRecord(inner, record));
  }
}

/**
 * Encode a `LogRecord` message (PE-3).
 *
 * Field mapping:
 * ```
 * 1  time_unix_nano          fixed64   little-endian uint64 from string
 * 2  severity_number         varint    5=DEBUG, 9=INFO, 13=WARN, 17=ERROR
 * 3  severity_text           LEN       UTF-8 string ("DEBUG"/"INFO"/…)
 * 5  body                    LEN       AnyValue (always { stringValue })
 * 6  attributes              LEN       repeated KeyValue (each own tag)
 * 8  trace_id                LEN       bytes (16-byte hex-decoded) — optional
 * 9  span_id                 LEN       bytes (8-byte hex-decoded)  — optional
 * 10 flags                   fixed32   little-endian uint32        — optional
 * 11 observed_time_unix_nano fixed64   same as time_unix_nano
 * ```
 *
 * Fields 4 and 7 are intentionally skipped — they are not present in the
 * `OtlpLogRecord` object model (PE-3).
 */
function encodeLogRecord(w: ProtobufWriter, record: OtlpLogRecord): void {
  // Field 1: time_unix_nano (fixed64). Always present.
  w.writeFixed64Field(1, Number(record.timeUnixNano));

  // Field 2: severity_number (varint). Always present.
  w.writeVarintField(2, record.severityNumber);

  // Field 3: severity_text (length-delimited UTF-8). Always present.
  w.writeStringField(3, record.severityText);

  // Field 5: body (AnyValue message). Always present — LogRecord.body is
  // always { stringValue: message }.
  w.writeMessage(5, (inner) => encodeAnyValue(inner, record.body));

  // Field 6: attributes (repeated KeyValue). Omitted when empty per proto3.
  for (const kv of record.attributes) {
    w.writeMessage(6, (inner) => encodeKeyValue(inner, kv));
  }

  // Field 8: trace_id (bytes, 16-byte hex-decoded binary). Omitted if
  // traceId is not a valid 32-char hex string (fail-closed).
  if (typeof record.traceId === 'string' && record.traceId.length === 32) {
    const traceBytes = hexDecode(record.traceId, 16);
    if (traceBytes !== null) {
      w.writeBytesField(8, traceBytes);
    }
  }

  // Field 9: span_id (bytes, 8-byte hex-decoded binary). Omitted if spanId
  // is not a valid 16-char hex string (fail-closed).
  if (typeof record.spanId === 'string' && record.spanId.length === 16) {
    const spanBytes = hexDecode(record.spanId, 8);
    if (spanBytes !== null) {
      w.writeBytesField(9, spanBytes);
    }
  }

  // Field 10: flags (fixed32). Omitted if undefined or zero.
  if (record.flags !== undefined && record.flags !== 0) {
    w.writeFixed32Field(10, record.flags);
  }

  // Field 11: observed_time_unix_nano (fixed64). Always present — same value
  // as time_unix_nano (PE-3).
  w.writeFixed64Field(11, Number(record.observedTimeUnixNano));
}

/**
 * Encode a `KeyValue` message.
 *
 * ```
 * KeyValue
 *   key   (field 1, string)
 *   value (field 2, AnyValue)
 * ```
 *
 * Both fields are always written. Even a null AnyValue (empty object)
 * produces a valid encoding: tag 2 + varint 0 (zero-length message).
 */
function encodeKeyValue(w: ProtobufWriter, kv: KeyValue): void {
  w.writeStringField(1, kv.key);
  w.writeMessage(2, (inner) => encodeAnyValue(inner, kv.value));
}

/**
 * Encode an `AnyValue` message (PE-5).
 *
 * `AnyValue` is a proto3 `oneof`. Exactly one field is set based on which
 * discriminator property is present on the TypeScript object:
 *
 * | Discriminator    | Field # | Wire type | Encoding                    |
 * |------------------|---------|-----------|-----------------------------|
 * | `stringValue`    | 1       | LEN       | UTF-8 string                |
 * | `boolValue`      | 2       | Varint    | 0 or 1                      |
 * | `intValue`       | 3       | Varint    | Signed varint from string   |
 * | `doubleValue`    | 4       | Fixed64   | IEEE 754 little-endian      |
 * | `arrayValue`     | 5       | LEN       | ArrayValue message          |
 * | `kvlistValue`    | 6       | LEN       | KeyValueList message        |
 * | *(empty object)* | —       | —         | No fields — valid protobuf  |
 *
 * The encoder selects the first matching discriminator. If multiple are
 * present (shouldn't happen — the serializer guarantees exactly one), the
 * first match wins per the order above.
 */
function encodeAnyValue(w: ProtobufWriter, av: AnyValue): void {
  if ('stringValue' in av && av.stringValue !== undefined) {
    w.writeStringField(1, av.stringValue);
  } else if ('boolValue' in av && av.boolValue !== undefined) {
    w.writeVarintField(2, av.boolValue ? 1 : 0);
  } else if ('intValue' in av && av.intValue !== undefined) {
    // intValue is a string representation of an int64 (e.g. "42" or "-7").
    // Parse to Number for non-negative values (fits in 1–5 varint bytes).
    // For negative values, compute the 64-bit two's complement as BigInt
    // and write the full 10-byte varint.
    const parsed = Number(av.intValue);
    if (Number.isNaN(parsed)) return; // Fail-closed: omit invalid value.
    w.writeTag(3, WIRE_VARINT);
    if (parsed >= 0) {
      w.writeVarint(parsed);
    } else {
      // Two's complement: 2^64 + parsed (parsed is negative, so this subtracts).
      const mask = BigInt('0xffffffffffffffff');
      const big = BigInt(av.intValue) & mask;
      w.writeVarintBig(big);
    }
  } else if ('doubleValue' in av && av.doubleValue !== undefined) {
    w.writeTag(4, WIRE_FIXED64);
    w.writeDouble(av.doubleValue);
  } else if ('arrayValue' in av && av.arrayValue !== undefined) {
    const values = av.arrayValue.values;
    if (values.length === 0) return; // Omit empty array per proto3.
    w.writeMessage(5, (inner) => {
      for (const elem of values) {
        inner.writeMessage(1, (inner2) => encodeAnyValue(inner2, elem));
      }
    });
  } else if ('kvlistValue' in av && av.kvlistValue !== undefined) {
    const values = av.kvlistValue.values;
    if (values.length === 0) return; // Omit empty kvlist per proto3.
    w.writeMessage(6, (inner) => {
      for (const kv of values) {
        inner.writeMessage(1, (inner2) => encodeKeyValue(inner2, kv));
      }
    });
  }
  // Else: empty object {} — no fields written. Valid proto3 oneof unset.
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode an `OtlpLogsRequest` as an OTLP protobuf binary `LogsData` message.
 *
 * Pure, synchronous, and total over the input shape — never throws (PE-7).
 * Returns a fresh `Uint8Array` containing a valid protobuf binary payload
 * conforming to the OTLP v1.x logs schema.
 *
 * @example
 * ```ts
 * const request = serializeBatch(events, Date.now());
 * const body = encodeProtobuf(request);
 * // POST to collector with Content-Type: application/x-protobuf
 * ```
 */
export function encodeProtobuf(request: OtlpLogsRequest): Uint8Array {
  const writer = new ProtobufWriter();
  try {
    encodeLogsData(writer, request);
  } catch {
    // Fail-closed: return an empty but valid Uint8Array. The caller's
    // `serialize_failed` guard will catch and drop the batch (PE-7).
    return new Uint8Array(0);
  }
  return writer.toUint8Array();
}
