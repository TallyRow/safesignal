# Phase 0 Research: OTLP Protobuf Encoding

All `/speckit-clarify` decisions are settled (see spec → Edge Cases). This
document records the technical decisions that turn the Feature 022 spec into an
implementable design — an opt-in protobuf encoding behind the existing FR-015
encoding seam, additive to the JSON path with zero new dependencies.

## R1 — Protobuf wire format encoding strategy

**Decision**: Hand-build the OTLP protobuf binary encoder in pure TypeScript
with **zero runtime dependencies**. The encoder implements:

- **Varint encoding**: unsigned 32/64-bit base-128 varints per the protobuf
  spec. A single `encodeVarint(n: number): number[]` function handles all
  varint cases — field tag varints, length-delimited payload sizes, and
  integer-valued `AnyValue` fields.
- **Field tag encoding**: `(field_number << 3) | wire_type`, where wire type 0
  = varint, 1 = fixed64, 2 = length-delimited, and 5 = fixed32. The OTLP logs
  schema uses only wire types 0 (varint), 2 (length-delimited), and
  occasionally 5 (fixed32 for `flags`).
- **Message encoding**: nested messages (e.g., `ResourceLogs` containing
  `ScopeLogs` containing `LogRecord`) are encoded as wire type 2
  (length-delimited). The inner message is serialized to bytes first, then
  prefixed with its byte-length as a varint.
- **Zero-value omission per proto3 conventions**: omitted fields are
  indistinguishable from their zero value — `0` for integers, `""` for
  strings, `[]` for repeated fields, `false` for booleans. The encoder skips
  any field whose value equals its proto3 default.

The encoder lives in a single new file
`src/transport-otlp/otlp-protobuf-encoder.ts` and exports one function:
`encodeProtobuf(request: OtlpLogsRequest): Uint8Array`. It is pure,
synchronous, and total over the `OtlpLogsRequest` shape — no `async`, no
`Promise`, no regex, no intermediate string conversion (FR-005).

**Rationale**: Zero dependencies is a hard constraint consistent with Feature
007's hand-built JSON approach (research D1). The OTLP logs protobuf schema is
stable (v1.x), small enough to encode by hand (7 top-level message types), and
well-documented in the opentelemetry-proto repository. A hand-rolled encoder is
auditable, bundle-minimal, and free of supply-chain risk. It keeps the subpath
fully self-contained — no `@opentelemetry/*`, no external protobuf library, no
new entries in `package.json`.

**Alternatives considered**:

- *Import `@opentelemetry/exporter-logs-otlp-http` or
  `@opentelemetry/otlp-transformer`*: rejected — pulls a multi-package runtime
  dependency into a browser bundle, blows the size budget, violates TO-7
  (vendor-neutrality bundle test), and contradicts the zero-runtime-dep posture.
- *Use `protobufjs`*: rejected — adds an npm dependency (~40 KiB minzipped),
  requires runtime schema compilation or pre-generated code, and introduces a
  supply-chain surface this package deliberately avoids.
- *Use `protobuf-es` from `@bufbuild`*: rejected — adds a dependency, larger
  bundle footprint than a hand-built encoder (~15-20 KiB minzipped for the
  runtime alone), and provides reflection/code-gen features the transport does
  not need.
- *Use the existing JSON encoder and gzip the body*: rejected — does not
  satisfy the interop requirement (many OTLP collectors require protobuf binary,
  not compressed JSON), and adds a compression dependency or browser API
  requirement (`CompressionStream`).

---

## R2 — Encoding seam adaptation

**Decision**: Extend the existing `encode()` function signature from
`(request: OtlpLogsRequest) => string` to
`(request: OtlpLogsRequest, encoding: OtlpEncoding) => string | Uint8Array`.
The `OtlpEncoding` type is `'json' | 'protobuf'`.

The `serializeBatch` function remains **unchanged** — it produces
`OtlpLogsRequest` regardless of encoding. The `flushBatch` function in
`otlp-transport.ts` passes the `encoding` option through to `encode()`,
which dispatches to either `JSON.stringify(request)` or
`encodeProtobuf(request)` based on the encoding parameter.

The `OtlpTransportOptions` type gains a single new optional field:
`encoding?: 'json' | 'protobuf'`. Default is `'json'` (unchanged). The
transport factory stores `encoding` in `OtlpTransportState` and validates
it at construction time — any value other than `'json'` or `'protobuf'`
throws a `TypeError` before any network or timer work (FR-001).

The existing `encode()` function (the JSON-only path) moves to a private
helper or inline dispatch; the exported function signature widens to
accommodate both encodings.

**Rationale**: Minimal change to the existing seam (FR-015). The JSON path is
preserved exactly as-is — same `JSON.stringify(request)` call, same output.
Protobuf is a pure serialization swap behind the same function signature.
`serializeBatch` is encoding-agnostic by design (it builds the object model,
not the wire format) and requires no change. The `OtlpEncoding` type is
intentionally narrow (`'json' | 'protobuf'`) — it is not an open string union
because there is no extension mechanism and no third encoding is planned.

**Alternatives considered**:

- *Separate `encodeJson` / `encodeProtobuf` exports*: rejected — complicates
  the flush path with a conditional at every call site rather than once at
  transport construction. The encoding seam (FR-015) was designed for a single
  `encode()` dispatch point.
- *A `Serializer` interface with JSON and protobuf implementations*: rejected —
  over-abstracted for two encodings. A simple union type and function dispatch
  is clearer, more auditable, and adds zero indirection cost.
- *Make `encoding` a parameter of `flush()` instead of a transport option*:
  rejected — encoding is a transport-level configuration (same as `endpoint`
  or `headers`), not a per-flush decision. Tying it to the transport
  constructor enforces consistency across all batches.

---

## R3 — Delivery Content-Type adaptation

**Decision**: Parameterize `deliver()` to accept `string | Uint8Array` body
and set `Content-Type` dynamically:

- `application/json` when `encoding` is `'json'` (or default)
- `application/x-protobuf` when `encoding` is `'protobuf'`

The function signature changes from
`deliver(endpoint: string, headers: Record<string, string>, body: string): Promise<DeliveryResult>`
to
`deliver(endpoint: string, headers: Record<string, string>, body: string | Uint8Array, contentType: string): Promise<DeliveryResult>`.

The `contentType` parameter is explicit (not inferred from `typeof body`)
because `typeof new Uint8Array()` is `'object'` — ambiguous with a plain
object. The transport passes the correct `Content-Type` based on its stored
`encoding` option, which is a single source of truth.

The `fetch()` API supports `Uint8Array` body natively in all modern browsers
(Chrome 42+, Firefox 39+, Safari 14+, Edge 79+). No polyfill, no transform,
no base64 encoding. The delivery primitive's `keepalive`, auth header merging,
error mapping, and partial-success rejection reading are unchanged — only the
body type and `Content-Type` header change.

**Rationale**: No new delivery primitive needed. The existing `deliver()`
already handles auth headers, `keepalive`, `credentials: 'same-origin'`, error
mapping (`delivered` / `unavailable` / `send_failed` / `partial_rejection`),
and never-throws semantics (research D6). Parameterizing `body` and
`contentType` is the smallest possible change. The explicit `contentType`
parameter keeps the function honest — it does not sniff or guess.

**Alternatives considered**:

- *A separate `deliverProtobuf()` function*: rejected — duplicates the auth
  header merging, `keepalive`, error mapping, `readRejectedCount()`, and
  never-throws contract. A single function with a body-type union is simpler
  and keeps the delivery surface small.
- *Infer Content-Type from `typeof body`*: rejected — `typeof new Uint8Array()`
  is `'object'`, which is ambiguous. The transport already knows the encoding
  and can pass the correct Content-Type explicitly.
- *Use `navigator.sendBeacon` with a `Blob` for protobuf*: rejected — same
  limitation as the JSON path (cannot set auth headers), and `sendBeacon` is
  already rejected for OTLP delivery (research D6).

---

## R4 — Bundle budget adjustment

**Decision**: Record the measured gzipped size of `dist/transport-otlp.mjs`
after the protobuf encoder is implemented, add a small headroom (~10-15%,
beacon-style), and update the `SIZE_LIMIT_BYTES` constant in
`tests/security/transport-otlp-bundle-shape.security.test.ts`. The existing
budget is 5120 bytes; the new budget is determined by measurement, not
prediction.

Existing bundles (`dist/index.mjs`, `dist/index.cjs`, `dist/transport-beacon.mjs`,
`dist/transport-beacon.cjs`, `dist/testing.mjs`, `dist/testing.cjs`) must stay
within ±1 KiB of their current baselines — verified by
`scripts/ci/bundle-invariance-check.sh`. The protobuf encoder is internal to
`src/transport-otlp/` and must not bloat unrelated bundles.

The bundle-shape security test's vendor-neutrality gates (no `@opentelemetry/*`
string, no vendor identifier, no `protobufjs` import) remain unchanged and are
verified on the built artifact.

**Rationale**: The protobuf encoder adds binary encoding logic (varint, field
tag, AnyValue mapping) that the JSON path does not need — the bundle will grow.
The budget is adjusted **transparently** (recorded in the test constant and
this research document), not silently. A ~10-15% headroom over the measured
baseline follows the same pattern as the beacon transport's budget (which was
set at 5120 bytes with headroom over its measured size). Transparent adjustment
preserves the budget's purpose as a regression gate — it should catch
unintentional bloat, not penalize intentional, reviewed additions.

**Alternatives considered**:

- *Keep the 5120-byte budget unchanged*: rejected — the protobuf encoder will
  exceed this. A budget that blocks the feature it governs is not useful.
- *Remove the budget for this subpath*: rejected — contradicts Principle VIII
  (lightweight) and removes a hard regression gate. The budget is a documented
  contract, not a suggestion.
- *Split the protobuf encoder into a separate subpath*: rejected — violates
  FR-015 (the encoding seam is internal to `./transport-otlp`). A separate
  subpath would mean duplicating the batching, delivery, endpoint validation,
  and error-notice infrastructure — a larger total bundle across two subpaths.

---

## R5 — Trace correlation in protobuf

**Decision**: Encode `traceId` and `spanId` as protobuf `bytes` fields
(field numbers 8 and 9 in the `LogRecord` message). The OTLP protobuf schema
uses `bytes` for trace/span IDs (not strings like JSON). Each ID is a
hex-decoded binary value: `traceId` is exactly 16 bytes (32 hex chars),
`spanId` is exactly 8 bytes (16 hex chars).

The encoder decodes from hex string to `Uint8Array` using a hand-rolled hex
decoder (zero dependencies, pure arithmetic — no `Buffer.from(id, 'hex')`,
no `TextDecoder`). If a trace ID or span ID is not a valid hex string of the
correct length, the field is omitted (fail-closed — produce a valid but
uncorrelated LogRecord rather than an invalid protobuf message).

The `traceparent` request header injection (Feature 009) works identically
regardless of body encoding. It reads from `event.context.trace` (the
structured trace IDs, not the serialized body) and injects the `traceparent`
and `tracestate` request headers. The delivery path sets headers before the
body is handed to `fetch()` — the body encoding does not affect header
injection.

**Rationale**: OTLP protobuf schema uses `bytes` for trace/span IDs — this is
the correct wire type. The structured trace IDs from `LogEvent.context.trace`
are already validated lowercase-hex strings (per the upstream `TraceContext`
type). Hex decoding to binary is a mechanical transform, not a semantic change.
Header injection is orthogonal to body encoding — the `buildRequestHeaders()`
function consumes `LogEvent[]`, not the serialized body.

**Alternatives considered**:

- *Encode trace/span IDs as protobuf strings*: rejected — incorrect per the
  OTLP protobuf schema (`bytes`, not `string`). Would produce invalid
  protobuf that conformant receivers reject.
- *Use `TextEncoder` to encode hex strings to bytes*: rejected —
  `TextEncoder.encode('a1b2c3...')` produces the UTF-8 bytes of the hex
  string (e.g., 32 bytes for a 32-char hex string), not the decoded 16-byte
  binary value. This is a common protobuf pitfall.
- *Require trace IDs to already be binary*: rejected — the `LogEvent` model
  uses hex strings (validated upstream). Consumers should not need to
  pre-decode trace IDs for a specific encoding.

---

## R6 — Per-record size guard strategy

**Decision**: Keep the `maxRecordBytes` guard using JSON measurement as a
conservative over-estimate. The guard in `otlp-transport.ts` `send()` measures
`byteLength(JSON.stringify(record))` — a `LogRecord` serialized to JSON —
regardless of the configured `encoding`. A record that passes the JSON-based
guard will always fit as protobuf, because protobuf is strictly smaller than
JSON for the same structured data (no field name repetition, varint integers,
binary trace IDs).

No separate protobuf size guard is introduced. No new measurement path. The
guard remains encoding-agnostic by being conservatively JSON-based.

**Rationale**: Encoding-agnostic guard. Simpler — one measurement, one
threshold, consistent `oversized_event` notices regardless of encoding.
Protobuf is always smaller than JSON for equivalent data: field names are
replaced by integer tags, integers are varint-encoded (1-5 bytes vs. string
digits), and `bytes` fields (trace/span IDs) are raw binary (16/8 bytes vs.
32/16 hex chars). A record that fits within 64 KiB as JSON will always fit as
protobuf — the converse is not guaranteed, but the guard catches oversized
records before they reach the encoder.

**Alternatives considered**:

- *Measure protobuf size for the guard when encoding is protobuf*: rejected —
  requires encoding each record eagerly (before the batch is built), which
  duplicates work (the record is encoded again during batch serialization) and
  adds a measurement path that is encoding-dependent. The JSON-based guard is
  simpler and safe.
- *Remove the per-record guard for protobuf*: rejected — the guard protects
  against memory growth from a single pathological event (e.g., a 1 MiB
  attribute). Dropping the guard for one encoding creates asymmetry and a
  potential memory vector.
- *Use a smaller threshold for protobuf*: rejected — the threshold is about
  bounding memory, not optimizing wire size. A single threshold is easier to
  document, configure, and test. The 64 KiB default is already generous.

---

## R7 — Verification strategy

**Decision**: Verify protobuf wire format correctness by **round-tripping
against known OTLP binary payloads** (golden files). The strategy has three
layers:

1. **Golden-file contract tests** (`tests/contract/transport-otlp.contract.test.ts`):
   Pre-built binary payloads representing valid OTLP `LogsData` messages are
   checked into `tests/contract/fixtures/otlp-protobuf/`. The contract test
   encodes the same `OtlpLogsRequest` object with `encodeProtobuf()` and
   asserts byte-for-byte equality with the golden file. Golden files are
   generated once (by a reference OTLP encoder such as the OpenTelemetry
   Collector's own serializer or a hand-crafted hex dump validated against
   the schema) and checked into the repository.

2. **Unit tests** (`tests/unit/transport-otlp/otlp-protobuf-encoder.test.ts`):
   Isolated tests for varint encoding (edge cases: 0, 127, 128, 16383,
   2^32-1), field tag encoding (all wire types used by the schema), and
   `AnyValue` protobuf mapping (string → field 1, bool → field 2, int → field
   3, double → field 4, array → field 5, kvlist → field 6, null → omitted).
   Each unit test encodes a single value or small message and asserts the
   exact byte sequence.

3. **Integration tests** (`tests/integration/transport-otlp-protobuf.integration.test.ts`):
   Creates a transport with `encoding: 'protobuf'`, sends events, intercepts
   the `fetch` body, and verifies: (a) `Content-Type: application/x-protobuf`,
   (b) the body is a `Uint8Array`, (c) the body decodes to a valid `LogsData`
   message with the expected structure. Uses the protobuf encoder itself as
   the decoder (round-trip) — encode known input, decode output, compare
   structures.

The existing bundle-shape security test
(`tests/security/transport-otlp-bundle-shape.security.test.ts`) remains the
enforcement mechanism for the vendor-neutrality gate and the gzipped-size
budget — no new CI job is required.

All verification is machine-executable and produces identical outcomes
locally and in CI via `npm run verify` (FR-012).

**Rationale**: Reproducible verification without requiring an OTLP collector
in CI. Golden files are deterministic, checked into the repository, and
version-controlled — they serve as a regression safety net for the wire format.
Unit tests for varint/field-tag encoding catch off-by-one and endianness bugs
in isolation. Integration tests verify the end-to-end path from `send()` to
`fetch()` interception. No network dependency, no collector container, no flaky
external service.

**Alternatives considered**:

- *Spin up an OTLP collector in CI and send real protobuf payloads*: rejected —
  adds a Docker dependency to CI, slows down the verification loop, and
  introduces flakiness risk (collector startup, port conflicts). Golden files
  achieve the same confidence with zero infrastructure.
- *Use `protobufjs` or `protobuf-es` as a decoder in tests to verify the
  encoder*: rejected — introduces a test dependency on an external protobuf
  library, which could have its own bugs or schema mismatches. Self-round-tripping
  (encode → decode with the same code) catches many bug classes without
  external validation. Golden files catch the remaining class (systematic
  encoder bugs) because they are generated by a separate, trusted tool.
- *Only unit-test the encoder*: rejected — unit tests alone cannot verify that
  the full `OtlpLogsRequest` → protobuf pipeline produces schema-conformant
  output. Golden files test the full message structure end-to-end.

---

## Open items deferred to implementation (detail, not ambiguity)

- Final `SIZE_LIMIT_BYTES` constant for `dist/transport-otlp.mjs` (measure
  after protobuf encoder is implemented; apply ~10-15% headroom per R4).
- Exact contents of golden files in `tests/contract/fixtures/otlp-protobuf/`
  (generate from a reference OTLP encoder or hand-craft from the protobuf
  schema).
- Whether `readRejectedCount()` in `deliver()` needs to handle protobuf
  response bodies (currently parses JSON for `partialSuccess.rejectedLogRecords`;
  protobuf backends may return the same structure as JSON or as protobuf —
  defer decision until interop testing; in the worst case, a non-JSON response
  body is treated as "no rejection" per the existing `catch { return 0 }` path).
