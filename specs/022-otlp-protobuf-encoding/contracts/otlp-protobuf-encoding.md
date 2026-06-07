# Contract: OTLP/HTTP+Protobuf Logs Encoding

Defines the exact protobuf wire format `./transport-otlp` produces when
`encoding: 'protobuf'` is selected. This contract extends (does not replace) the
existing OP-1 through OP-6 contracts — it documents the protobuf encoding path
while the JSON path remains the default and is unchanged.

The encoder is hand-written with **zero runtime dependencies** — no
`@opentelemetry/*`, no `protobufjs`, no external protobuf library (TO-7). It
targets the published OTLP logs protobuf schema (v1.x) and produces binary
compatible with any conformant OTLP/HTTP logs receiver.

## PE-1 — Request envelope (protobuf)

POST body is a protobuf binary `LogsData` message:

```
Content-Type: application/x-protobuf
```

Wire structure:

```
LogsData
  resource_logs (field 1, repeated ResourceLogs) → exactly 1 entry
    resource (field 1, Resource)
      attributes (field 1, repeated KeyValue) → per PE-2
    scope_logs (field 2, repeated ScopeLogs) → exactly 1 entry
      scope (field 1, InstrumentationScope)
        name (field 1, string) = "@tallyrow/safesignal"
      log_records (field 2, repeated LogRecord) → per PE-3
```

- Exactly one `resource_logs` entry per request (one batch shares one Resource).
- Exactly one `scope_logs` entry; `scope.name` is the constant
  `"@tallyrow/safesignal"`.
- The body is a `Uint8Array` (not a string).

## PE-2 — Resource attributes (identity)

`resource.attributes` is a repeated `KeyValue` message containing only the
present **runtime-global** identity fields. The Resource is derived from the
batch's first event — identical to the JSON path (OP-2).

Each attribute is a `KeyValue` message with field 1 (`key`, string) and field 2
(`value`, `AnyValue` per PE-5):

| Source (`LogEvent.context`) | `key` (field 1) | `value` (field 2, AnyValue) |
|-----------------------------|-----------------|-----------------------------|
| `application.name` | `service.name` | `string_value` |
| `application.version` | `service.version` | `string_value` |
| `environment` | `deployment.environment` | `string_value` |

Absent fields MUST be omitted (no empty-string or zero-length key). Per-logger
identity (`module.name` / `module.version`) is attributed per-`LogRecord` (PE-4),
not on the shared Resource — same as OP-2.

## PE-3 — LogRecord protobuf encoding

For each `LogEvent` in the batch, one `LogRecord` message with the following
field mapping:

| Field # | Field Name | Wire Type | Encoding |
|---------|-----------|-----------|----------|
| 1 | `time_unix_nano` | fixed64 | Little-endian uint64: `Date.parse(event.timestamp) * 1_000_000` |
| 2 | `severity_number` | varint | `5` debug · `9` info · `13` warn · `17` error (per OP-3) |
| 3 | `severity_text` | length-delimited | UTF-8 string: `"DEBUG"` · `"INFO"` · `"WARN"` · `"ERROR"` |
| 5 | `body` | length-delimited | `AnyValue` message (PE-5) wrapping `event.message` as `string_value` |
| 6 | `attributes` | length-delimited | Repeated `KeyValue` messages per PE-4 |
| 8 | `trace_id` | length-delimited | 16-byte binary — hex-decoded from `traceId` string (PE-6) |
| 9 | `span_id` | length-delimited | 8-byte binary — hex-decoded from `spanId` string (PE-6) |
| 10 | `flags` | fixed32 | Little-endian uint32 from `traceFlags` (PE-6) |
| 11 | `observed_time_unix_nano` | fixed64 | Same value as `time_unix_nano` (field 1) |

If `event.timestamp` is unparseable, fall back to a single resolved emit time
(MUST NOT throw) — identical to OP-3.

Field numbers 4 (`severity_number` in older schema drafts) and 7 (`dropped_attributes_count`)
are skipped (not encoded) because they are not present in the `OtlpLogsRequest` object model.

## PE-4 — LogRecord attributes (protobuf)

`attributes` (field 6 on `LogRecord`) is a length-delimited repeated `KeyValue`
field. The attribute ordering is identical to OP-4:

1. `event.attributes`: each entry → `KeyValue { key: string, value: AnyValue }`.
2. `event.context.attributes`: each entry → `KeyValue { key: "context." + k, value: AnyValue }`.
3. Per-logger module identity (if present): `module.name`, `module.version`
   as `{ string_value }` (per-record, not on the Resource — see PE-2).
4. If `event.error` present:
   - `KeyValue { key: "exception.type", value: { string_value: error.name } }`
   - `KeyValue { key: "exception.message", value: { string_value: error.message } }`
   - `KeyValue { key: "exception.stacktrace", value: { string_value: error.stack } }` (only if `stack` present)

Each `KeyValue` message:

```
KeyValue
  key   (field 1, string)
  value (field 2, AnyValue per PE-5)
```

## PE-5 — AnyValue protobuf encoding

Mapping from the `AttributeValue` union to protobuf `AnyValue` oneof fields:

| `AttributeValue` | `AnyValue` field # | Wire Type | Encoding |
|------------------|---------------------|-----------|----------|
| `string` | 1 (`string_value`) | length-delimited | UTF-8 bytes |
| `boolean` | 2 (`bool_value`) | varint | `0` or `1` |
| `number`, `Number.isInteger` | 3 (`int_value`) | varint | Signed varint |
| `number`, non-integer | 4 (`double_value`) | fixed64 | IEEE 754 little-endian |
| `null` | *(unset)* | — | Empty `AnyValue` (zero fields encoded) |
| `AttributeValue[]` | 5 (`array_value`) | length-delimited | `ArrayValue` message |
| `{[k]: AttributeValue}` | 6 (`kvlist_value`) | length-delimited | `KeyValueList` message |

`ArrayValue` and `KeyValueList` are nested messages:

```
ArrayValue
  values (field 1, repeated AnyValue)

KeyValueList
  values (field 1, repeated KeyValue)
    key   (field 1, string)
    value (field 2, AnyValue)
```

Encoding is total over the `AttributeValue` union and never throws; it does not
re-walk beyond the already-sanitized union (depth/size bounded upstream) —
identical constraint to OP-5.

## PE-6 — Trace correlation (protobuf)

When trace context is present on a `LogEvent`, it is encoded in the `LogRecord`
as follows:

| Source | Encoding | Protobuf Field |
|--------|----------|----------------|
| `traceId` (hex string, e.g. `"0af7…"`) | Hex-decode to 16-byte binary | Field 8 (`trace_id`, bytes) |
| `spanId` (hex string, e.g. `"1b3c…"`) | Hex-decode to 8-byte binary | Field 9 (`span_id`, bytes) |
| `traceFlags` (number) | Cast to uint32, little-endian fixed32 | Field 10 (`flags`, fixed32) |

- When trace context is **absent** (no `traceId` / `spanId`), fields 8, 9, and
  10 are **omitted** (not encoded) — per proto3 conventions, zero-value fields
  are absent from the wire.
- The `traceparent` request header (Feature 009, `injectTraceparent`) is set
  identically regardless of body encoding — it is a delivery concern, not a body
  concern. The header value is the same W3C `traceparent` format for both JSON
  and protobuf paths.

## PE-7 — Validity & safety invariants

- The protobuf payload MUST be valid protobuf binary parseable by any conformant
  OTLP logs receiver (v1.x schema).
- The encoder MUST NOT mutate the input `OtlpLogsRequest` (same as OP-6 / T-S4).
- The encoder MUST NOT embed any configured header/secret value (same as OP-6 /
  FR-009).
- The encoder MUST NOT import `@opentelemetry/*` or any protobuf library (TO-7).
- The encoder MUST be total over the `OtlpLogsRequest` shape and MUST never throw
  (fail-closed: an unexpected encoding failure is caught by the existing
  `serialize_failed` guard in `flushBatch`).
- Zero/empty/undefined fields MUST be omitted per proto3 conventions (default
  values are not encoded on the wire).
- Zero-length repeated fields (empty batch) MUST be valid — a `LogsData` message
  with zero bytes for the `log_records` repeated field encodes correctly and is
  accepted by a conformant receiver.

## PE-8 — Encoding option validation

- The `encoding` option on `OtlpTransportOptions` accepts `'json'` | `'protobuf'`.
- Default is `'json'` (backward compatible — all existing consumers unchanged).
- Any other value throws `TypeError` at construction time with a message listing
  valid values (e.g., `"Invalid encoding: expected 'json' or 'protobuf', got 'xml'"`).
- Validation is synchronous, at the call site — before any network, timer, or
  listener work (same constraint as TO-2).

---

*Enforcement*:
- `tests/contract/transport-otlp.contract.test.ts` — wire format correctness
  (protobuf binary decodes to expected structure), encoding option validation
  (construction-time throw on invalid value), Content-Type correctness.
- `tests/unit/transport-otlp/otlp-protobuf-encoder.test.ts` — varint encoding,
  field tag encoding, message boundary encoding, per-field correctness for
  each `LogRecord` field.
- `tests/security/transport-otlp-bundle-shape.security.test.ts` — gzipped bundle
  budget, no `@opentelemetry/*` or vendor identifiers in the built bundle.
- `tests/integration/transport-otlp-protobuf.integration.test.ts` — end-to-end
  delivery with `Content-Type: application/x-protobuf`, semantic equivalence
  with JSON path.
