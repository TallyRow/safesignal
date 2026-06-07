# Phase 1 Data Model: OTLP Protobuf Encoding

Pure data shapes for the protobuf encoding behind Feature 022. All entities are
internal to the `./transport-otlp` subpath except `OtlpEncoding` (exposed only
as a field on `OtlpTransportOptions`, not as a standalone export). The JSON
encoding path is unchanged — this document covers only the additive protobuf
path and the seam adaptation that enables it.

## 1. OtlpEncoding (internal, field-only exposure)

A union type governing which wire encoder is used. Not a standalone export —
consumers interact with it solely through the `encoding` field on
`OtlpTransportOptions`.

```text
type OtlpEncoding = 'json' | 'protobuf'
```

The type is intentionally narrow (`'json' | 'protobuf'`, not an open string
union) because there is no extension mechanism and no third encoding is planned
(R2). It is a transport-level configuration, not a per-flush decision.

## 2. OtlpTransportOptions.encoding (public, type-only additive field)

A single new optional field on the existing `OtlpTransportOptions` type. No
other public-API changes.

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `encoding` | `'json' \| 'protobuf'` | — | `'json'` | Wire encoding for the POST body. JSON path is unchanged; protobuf is opt-in. |

**Validation**: Any value other than `'json'` or `'protobuf'` (including
`undefined` at runtime when the field is absent) MUST throw a `TypeError` at
construction time — before any network or timer work — with a message listing
valid values (FR-001). The validation runs in `validateOptions()` alongside
existing option checks and follows the same pattern: throw early at the
consumer call site, never on the hot path.

The `encoding` value is stored in `OtlpTransportState` and consumed by
`flushBatch()` to determine which encoder to call and which `Content-Type` to
pass to `deliver()`.

## 3. Encoding seam: `encode()` signature change

The existing `encode()` function in `otlp-serializer.ts` is the encoding seam
(FR-015 from Feature 007). Its signature widens to accept the `encoding`
parameter and produce either a JSON string or a protobuf binary payload.

**Before** (Feature 007, JSON-only):

```text
function encode(request: OtlpLogsRequest): string
```

**After** (Feature 022, encoding-dispatched):

```text
function encode(request: OtlpLogsRequest, encoding: OtlpEncoding): string | Uint8Array
```

**Dispatch logic** (internal, not a separate export):

| `encoding` | Returns | Implementation |
|---|---|---|
| `'json'` | `string` | `JSON.stringify(request)` — unchanged from Feature 007 |
| `'protobuf'` | `Uint8Array` | `encodeProtobuf(request)` — new pure function in `otlp-protobuf-encoder.ts` |

`serializeBatch()` is **unchanged** — it always produces `OtlpLogsRequest`
regardless of encoding (R2). The encoding seam is the only point where the
encoding parameter is consumed during serialization.

## 4. Protobuf binary payload (`Uint8Array`)

The output of `encode(request, 'protobuf')` — a `Uint8Array` containing a
valid OTLP `LogsData` protobuf binary message conforming to the published
OTLP logs protobuf schema (v1.x).

| Property | Value |
|---|---|
| Base type | `Uint8Array` |
| Schema | OTLP v1.x `LogsData` |
| Lifecycle | Built per-batch; never persisted or reused |
| Construction | Fresh allocation per `encode()` call |
| Wire format | Protobuf binary encoding (proto3) |
| Zero-value handling | Omitted per proto3 conventions |
| Content-Type | `application/x-protobuf` (set by delivery layer) |

The payload is a constructed-once, handed-to-`fetch`, and garbage-collected
value. No buffer pooling, no reuse across batches (see §6).

## 5. Delivery body types

The `deliver()` function's `body` parameter widens from `string` to
`string | Uint8Array`, and a new explicit `contentType` parameter is added
(R3).

**Before** (Feature 007):

```text
function deliver(
  endpoint: string,
  headers: Readonly<Record<string, string>>,
  body: string,
): Promise<DeliveryResult>
```

**After** (Feature 022):

```text
function deliver(
  endpoint: string,
  headers: Readonly<Record<string, string>>,
  body: string | Uint8Array,
  contentType: string,
): Promise<DeliveryResult>
```

**Content-Type mapping** (set by `flushBatch()` based on stored `encoding`):

| `encoding` | `body` type | `Content-Type` header |
|---|---|---|
| `'json'` (or default) | `string` | `application/json` |
| `'protobuf'` | `Uint8Array` | `application/x-protobuf` |

The `contentType` parameter is explicit (not inferred from `typeof body`)
because `typeof new Uint8Array()` is `'object'` — ambiguous with a plain
object. The transport passes the correct `Content-Type` based on its stored
`encoding` option, which is the single source of truth (R3).

All other delivery behavior is unchanged: `keepalive`, `credentials:
'same-origin'`, auth header merging, error mapping (`delivered` /
`unavailable` / `send_failed` / `partial_rejection`), and never-throws
contract. The `fetch()` API supports `Uint8Array` body natively in all
modern browsers.

## 6. Protobuf encoder state

The protobuf encoder is **stateless** — a pure function with no instance
state, no buffer reuse, and no mutable shared data across batches.

| Property | Description |
|---|---|
| Function | `encodeProtobuf(request: OtlpLogsRequest): Uint8Array` |
| Purity | Pure: same input always produces byte-identical output |
| Sync | Synchronous — no `async`, no `Promise` (FR-005) |
| File | `src/transport-otlp/otlp-protobuf-encoder.ts` |
| Dependencies | Zero runtime dependencies — no `@opentelemetry/*`, no `protobufjs`, no regex (R1) |
| Allocation | Fresh `Uint8Array` per call; no buffer pooling |
| Error handling | Total over `OtlpLogsRequest` shape; never throws (fail-closed via `serialize_failed` guard in `flushBatch`) |

Each call to `encode(request, 'protobuf')` produces a fresh `Uint8Array`.
The encoder allocates a new buffer (sized to the computed message length),
writes the protobuf binary into it, and returns it. No buffers are reused
across batches — no `Buffer`, no shared `ArrayBuffer`, no pooling.

## 7. Bundle budget

The `SIZE_LIMIT_BYTES` constant for `dist/transport-otlp.mjs` in
`tests/security/transport-otlp-bundle-shape.security.test.ts` is updated after
the protobuf encoder is implemented. The measured gzipped size is recorded and
a small headroom (~10-15%) is added, following the same pattern as the beacon
transport's budget (R4).

| Aspect | Before (Feature 007) | After (Feature 022) |
|---|---|---|
| Constant location | `tests/security/transport-otlp-bundle-shape.security.test.ts` | Same file |
| Value | `5120` bytes | **Measured** (post-implementation) |
| Headroom | N/A (original baseline) | ~10-15% over measured baseline |
| Enforcement | Bundle-shape security test | Same test, updated constant |
| Other bundles | ±1 KiB baseline enforced by `bundle-invariance-check.sh` | Same check, same threshold |

The budget is adjusted **transparently** — the exact measured value and final
headroom are recorded in the test constant and research document (R4). The
budget's purpose as a regression gate is preserved: it catches unintentional
bloat, not intentional, reviewed additions.

Vendor-neutrality gates (no `@opentelemetry/*` string, no vendor identifier,
no `protobufjs` import) remain unchanged in the same test.

## 8. OTLP protobuf schema field mapping

The encoder implements the OTLP v1.x logs protobuf schema directly. Each
message type maps to a set of field number → wire type → encoding strategy
rules. The field tag is computed as `(field_number << 3) | wire_type`.

### Wire types used

| Wire type | Value | Used for |
|---|---|---|
| Varint | 0 | `int32`, `int64`, `uint32`, `uint64`, `bool`, `enum` |
| Fixed64 | 1 | Not used in OTLP logs schema |
| Length-delimited | 2 | `string`, `bytes`, nested messages, repeated packed fields |
| Fixed32 | 5 | `fixed32` (used for `LogRecord.flags`) |

### Field tag encoding formula

```text
tag_byte = (field_number << 3) | wire_type
```

Encoded as a base-128 varint. For field numbers 1–15, the tag fits in a single
byte; for field numbers 16+, the varint spans multiple bytes.

### LogsData (top-level)

Field 1 is a repeated length-delimited message (wire type 2). The encoder
writes: a varint tag for field 1, a varint byte-length of the serialized
`ResourceLogs` inner bytes, then the serialized `ResourceLogs` message.

| Field | Number | Wire type | Proto type | Encoding |
|---|---|---|---|---|
| `resourceLogs` | 1 | 2 (length-delimited) | `repeated ResourceLogs` | For each element: varint tag, varint length, serialized `ResourceLogs` bytes |

### ResourceLogs

| Field | Number | Wire type | Proto type | Encoding |
|---|---|---|---|---|
| `resource` | 1 | 2 (length-delimited) | `Resource` | Nested: varint tag, varint length, serialized `Resource` bytes. Omitted if `attributes` is empty. |
| `scopeLogs` | 2 | 2 (length-delimited) | `repeated ScopeLogs` | For each element: varint tag, varint length, serialized `ScopeLogs` bytes |

**Resource** (nested in field 1 of `ResourceLogs`):

| Field | Number | Wire type | Proto type | Encoding |
|---|---|---|---|---|
| `attributes` | 1 | 2 (length-delimited) | `repeated KeyValue` | For each `KeyValue`: varint tag, varint length, serialized `KeyValue` bytes |

### ScopeLogs

| Field | Number | Wire type | Proto type | Encoding |
|---|---|---|---|---|
| `scope` | 1 | 2 (length-delimited) | `InstrumentationScope` | Nested: varint tag, varint length, serialized `InstrumentationScope` bytes |
| `logRecords` | 2 | 2 (length-delimited) | `repeated LogRecord` | For each element: varint tag, varint length, serialized `LogRecord` bytes |

**InstrumentationScope** (nested in field 1 of `ScopeLogs`):

| Field | Number | Wire type | Proto type | Encoding |
|---|---|---|---|---|
| `name` | 1 | 2 (length-delimited) | `string` | Varint tag, varint byte-length, UTF-8 bytes. Always present (`'@tallyrow/safesignal'`). |

### LogRecord

| Field | Number | Wire type | Proto type | Encoding |
|---|---|---|---|---|
| `timeUnixNano` | 1 | 0 (varint) | `fixed64` | Encoded as varint of the numeric value (ms × 1e6). Always present. |
| `observedTimeUnixNano` | 2 | 0 (varint) | `fixed64` | Encoded as varint. Always present. |
| `severityNumber` | 4 | 0 (varint) | `SeverityNumber` (enum) | Varint of 5, 9, 13, or 17. Always present. |
| `severityText` | 3 | 2 (length-delimited) | `string` | Varint tag, varint length, UTF-8 bytes. Always present. |
| `body` | 5 | 2 (length-delimited) | `AnyValue` | Nested: varint tag, varint length, serialized `AnyValue` bytes. Always present (`{ stringValue: message }`). |
| `attributes` | 6 | 2 (length-delimited) | `repeated KeyValue` | For each `KeyValue`: varint tag, varint length, serialized `KeyValue` bytes. Omitted if empty. |
| `traceId` | 8 | 2 (length-delimited) | `bytes` | Varint tag, varint length (16), 16 raw bytes (hex-decoded from 32-char string). Omitted if not present. |
| `spanId` | 9 | 2 (length-delimited) | `bytes` | Varint tag, varint length (8), 8 raw bytes (hex-decoded from 16-char string). Omitted if not present. |
| `flags` | 10 | 5 (fixed32) | `fixed32` | Varint tag (wire type 5), 4 bytes little-endian. Omitted if not present or zero. |

**Field number gaps**: Fields 7, 11 are reserved in the OTLP schema
(`droppedAttributesCount`, `body` is at 5 — there is no field 7 in the
canonical schema). The encoder does not emit them.

**traceId / spanId encoding detail (R5)**: The structured trace IDs from
`LogEvent.context.trace` are lowercase-hex strings (validated upstream).
The encoder hex-decodes them to raw bytes: `traceId` (32 hex chars → 16
bytes), `spanId` (16 hex chars → 8 bytes). If an ID is not a valid hex
string of the correct length, the field is omitted (fail-closed — produce
a valid but uncorrelated `LogRecord` rather than an invalid protobuf
message).

### KeyValue

| Field | Number | Wire type | Proto type | Encoding |
|---|---|---|---|---|
| `key` | 1 | 2 (length-delimited) | `string` | Varint tag, varint byte-length, UTF-8 bytes. Always present. |
| `value` | 2 | 2 (length-delimited) | `AnyValue` | Nested: varint tag, varint length, serialized `AnyValue` bytes. Always present. |

### AnyValue

`AnyValue` is a proto3 `oneof` — exactly one field is set per value. The
encoder selects the field based on which discriminator is present on the
TypeScript `AnyValue` object.

| Field | Number | Wire type | Proto type | Encoding |
|---|---|---|---|---|
| `stringValue` | 1 | 2 (length-delimited) | `string` | Varint tag, varint length, UTF-8 bytes |
| `boolValue` | 2 | 0 (varint) | `bool` | Varint tag + single varint byte (`0x00` or `0x01`) |
| `intValue` | 3 | 0 (varint) | `int64` | Varint tag + varint-encoded numeric value (from string representation) |
| `doubleValue` | 4 | 1 (fixed64) | `double` | Varint tag (wire type 1), 8 bytes IEEE 754 little-endian |
| `arrayValue` | 5 | 2 (length-delimited) | `ArrayValue` | Nested: varint tag, varint length, serialized `ArrayValue` bytes. Omitted if `values` is empty. |
| `kvlistValue` | 6 | 2 (length-delimited) | `KeyValueList` | Nested: varint tag, varint length, serialized `KeyValueList` bytes. Omitted if `values` is empty. |
| `bytesValue` | 7 | 2 (length-delimited) | `bytes` | Varint tag, varint length, raw bytes. Not currently emitted by the serializer (no `bytesValue` in the object model). |
| *(empty object)* | — | — | *(unset)* | No field emitted — valid proto3 `oneof` with no field set |

**ArrayValue** (nested in field 5 of `AnyValue`):

| Field | Number | Wire type | Proto type | Encoding |
|---|---|---|---|---|
| `values` | 1 | 2 (length-delimited) | `repeated AnyValue` | For each element: varint tag, varint length, serialized `AnyValue` bytes |

**KeyValueList** (nested in field 6 of `AnyValue`):

| Field | Number | Wire type | Proto type | Encoding |
|---|---|---|---|---|
| `values` | 1 | 2 (length-delimited) | `repeated KeyValue` | For each element: varint tag, varint length, serialized `KeyValue` bytes |

### Varint encoding detail (R1)

Base-128 varint encoding, used for field tags, message lengths, and integer
`AnyValue` fields:

| Value range | Varint bytes |
|---|---|
| 0–127 | 1 byte |
| 128–16383 | 2 bytes |
| 16384–2097151 | 3 bytes |
| … | … |

Each byte uses the MSB as a continuation bit: MSB=1 means more bytes follow;
MSB=0 means last byte. The remaining 7 bits carry the value in
little-endian order.

## Relationships

```text
createOtlpTransport(OtlpTransportOptions)
     │
     │  validates options (including encoding) — same validateOptions() as JSON
     │  stores encoding → OtlpTransportState
     ▼
OtlpTransportState.encoding ── 'json' or 'protobuf'
     │
     │  flushBatch(events)
     ▼
serializeBatch(events) ──> OtlpLogsRequest (unchanged, encoding-agnostic)
     │
     ▼
encode(request, encoding)
     ├── encoding === 'json'    → JSON.stringify(request)         → string
     └── encoding === 'protobuf' → encodeProtobuf(request)        → Uint8Array
     │
     ▼
deliver(endpoint, headers, body, contentType)
     ├── contentType === 'application/json'        → fetch(body: string)
     └── contentType === 'application/x-protobuf'  → fetch(body: Uint8Array)
```

## Invariants

- **No per-Logger cost (VII)**: The protobuf encoder is stateless — no
  per-`Logger` allocation, no init, no timers/listeners/global patches.
  Duplicate-package-copy behavior remains **isolated**.
- **JSON path unchanged**: When `encoding` is `'json'` (or default), the
  code path is byte-identical to Feature 007 — same `JSON.stringify(request)`,
  same `Content-Type`, same `deliver()` body type.
- **Pure encoder**: `encodeProtobuf()` is a pure function — same input always
  produces byte-identical output. No randomness, no timestamps, no external
  state.
- **Fail-closed**: The protobuf encoder is total over `OtlpLogsRequest` and
  never throws. Any unexpected failure is caught by the `serialize_failed`
  guard in `flushBatch()` and the batch is dropped.
- **Zero dependencies**: No `@opentelemetry/*`, no `protobufjs`, no `protobuf-es`,
  no `Buffer`, no regex, no `TextDecoder` in the encoder (R1).
- **Vendor neutral**: The protobuf encoder encodes to the open OTLP schema.
  No vendor-specific fields, no vendor identifier in the binary output.
- **Bundle integrity**: Protobuf encoder code lives in
  `src/transport-otlp/otlp-protobuf-encoder.ts` and is tree-shaken when
  consumers import from subpaths that do not include the OTLP transport.
