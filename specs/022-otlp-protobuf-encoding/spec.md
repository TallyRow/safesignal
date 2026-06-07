# Feature Specification: OTLP Protobuf Encoding

**Feature Branch**: `022-otlp-protobuf-encoding`

**Created**: 2026-06-07

**Status**: Draft

**Input**: GitHub issue #20: "feat: ./transport-otlp protobuf encoding (opt-in)" — Opt-in protobuf encoder for `./transport-otlp` (JSON-only today), behind the existing internal encoding seam (FR-015 from Feature 007). Smaller payloads, wider collector compatibility; no public-API change.

## Overview

SafeSignal's `./transport-otlp` subpath (Feature 007) ships a single wire encoding:
OTLP/HTTP+JSON, hand-built with zero runtime dependencies. The encoding sits behind a
documented internal seam (FR-015) so a protobuf encoding can be added later without a
breaking change.

This feature ships that **opt-in OTLP/HTTP+protobuf encoding** — additive, zero new
dependencies, behind the same seam. Consumers toggle it with a single `encoding` option.
JSON remains the default and is unchanged. Protobuf delivers 30–60% smaller payloads and
broader collector compatibility (many OTLP collectors prefer or require protobuf).

The feature is **vendor-neutral**: it targets the open OTLP logs protobuf schema (Apache
2.0) and works with any conformant OTLP backend — no `@opentelemetry/*` import, no
vendor-specific logic.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consumer opts into protobuf encoding (Priority: P1)

A developer integrating SafeSignal with an OTLP collector that prefers protobuf
(smaller wire size, wider compatibility) sets `encoding: 'protobuf'` on their
`createOtlpTransport` options. The transport serializes log events as OTLP protobuf
binary and POSTs them with `Content-Type: application/x-protobuf`. The rest of their
integration — the endpoint, auth headers, batching, failure notices — works identically
to the JSON path. Protobuf is a pure serialization swap.

**Why this priority**: This is the core value proposition — smaller payloads and broader
OTLP compatibility. Without it, the feature delivers nothing.

**Independent Test**: Create a transport with `encoding: 'protobuf'`, send events,
intercept the fetch body as binary, and decode it against the known OTLP logs protobuf
schema — verifying correct field tags, varint encoding, and wire format structure.

**Acceptance Scenarios**:

1. **Given** a transport created with `encoding: 'protobuf'`, **When** a batch of log
   events is delivered, **Then** the POST body is a valid OTLP `LogsData` protobuf
   binary message with `Content-Type: application/x-protobuf`.
2. **Given** a protobuf-encoded batch, **When** decoded by a conformant OTLP receiver,
   **Then** the decoded data matches the same structured event content as the equivalent
   JSON-encoded batch (same log records, same severity mapping, same attributes, same
   trace correlation).
3. **Given** the default `encoding` (omitted), **When** a transport is created, **Then**
   the transport continues to emit `application/json` — the JSON path is unchanged.

---

### User Story 2 - Bundle budget integrity (Priority: P2)

The protobuf encoder adds code to the `./transport-otlp` bundle. The team needs
confidence that the bundle stays within a documented, enforced size budget and that
no `@opentelemetry/*` dependency or vendor identifier leaks into the published bundle.

**Why this priority**: Bundle size and vendor neutrality are hard gates (TO-7, bundle-
shape security test). Without them, the feature cannot ship.

**Independent Test**: Run `npm run build`, measure the gzipped size of
`dist/transport-otlp.mjs`, and confirm it stays within the recorded budget. Run the
bundle-shape security test to confirm no `@opentelemetry/*` or vendor identifier is
present in the built bundle.

**Acceptance Scenarios**:

1. **Given** the protobuf encoder is implemented, **When** `dist/transport-otlp.mjs` is
   built, **Then** its gzipped size is at most the new recorded budget (a small headroom
   over the measured baseline with protobuf included).
2. **Given** the built `dist/transport-otlp.mjs`, **When** scanned for forbidden
   identifiers, **Then** the bundle contains no `@opentelemetry/*` string, no
   `protobufjs` import, and no vendor-specific identifier.
3. **Given** the protobuf encoder is implemented, **When** existing bundles (`index`,
   `transport-beacon`, `testing`) are built, **Then** their gzipped size stays within
   ±1 KiB of the current baseline — protobuf does not bloat unrelated bundles.

---

### User Story 3 - Interoperability with JSON path (Priority: P3)

A host application creates two transports: one with `encoding: 'json'` (default) and one
with `encoding: 'protobuf'`. Both coexist in the same runtime, process the same events,
and produce semantically identical output in their respective encodings. No shared state
leaks between them. Switching a transport's encoding does not require changing any other
configuration — the endpoint, auth headers, batching, and failure handling remain
identical.

**Why this priority**: Ensures the encoding option is a clean, additive switch — not a
fork. Validates that the encoding seam works as designed.

**Independent Test**: Create two transports side-by-side (JSON and protobuf), send
identical events through both, and compare the decoded content — verifying semantic
equivalence of fields, severity mapping, attributes, and trace correlation.

**Acceptance Scenarios**:

1. **Given** two transports (JSON and protobuf) created with the same
   endpoint/headers/batching, **When** identical events are sent through both, **Then**
   the decoded content (log records, severity, attributes, trace context) is
   semantically equivalent.
2. **Given** a protobuf transport, **When** `shutdown()` is called, **Then** the
   transport drains and shuts down identically to the JSON path — no new lifecycle
   behavior.

---

### Edge Cases

- What happens when an invalid `encoding` value (e.g., `'xml'`) is provided? The
  transport MUST throw a `TypeError` at construction time — before any network or timer
  work — with a clear message listing valid values.
- What happens when `encoding: 'protobuf'` is combined with `injectTraceparent: true`?
  Trace correlation works identically — `traceId`/`spanId` are encoded as protobuf bytes
  fields (field 8/9) instead of JSON hex strings. The `traceparent` request header is
  set identically regardless of encoding (it is a delivery concern, not a body concern).
- How does the protobuf encoder handle an empty batch? An `OtlpLogsRequest` with zero
  `logRecords` MUST produce a valid protobuf `LogsData` with an empty `logRecords`
  repeated field (zero-length encoding) — the same semantic as the JSON path.
- What happens when a protobuf-encoded body exceeds the 64 KiB `maxRecordBytes` guard?
  The per-record size guard runs before encoding and uses JSON as the measurement
  baseline (a conservative over-estimate vs. protobuf, which is smaller). An oversized
  record is dropped with an `oversized_event` notice, same as JSON. The measurement
  remains JSON-based so the guard is encoding-agnostic.
- What happens when a consumer's OTLP backend only accepts JSON and they accidentally
  set `encoding: 'protobuf'`? The backend may reject the request with a 4xx. The
  transport handles this identically to any non-2xx — a rate-limited `send_failed`
  notice. The consumer sees the same failure surface regardless of encoding.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: Additive only. A single new optional field
  `encoding?: 'json' | 'protobuf'` on `OtlpTransportOptions`. Default is `'json'`
  (unchanged). The exported surface remains exactly `createOtlpTransport` +
  `OtlpTransportOptions` (TO-1 from Feature 007).

- **Compatibility Impact**: Fully backward compatible. All existing consumers continue
  to emit JSON with no code change. The `encoding` option is additive and optional.

- **Migration Notes**: None required. Consumers who want protobuf add
  `encoding: 'protobuf'` to their options. The endpoint, auth headers, batching, and
  failure handling are unchanged.

- **Deprecation & Migration**: No contract is being deprecated or removed.

- **Host/Module Usage Impact**: None. The `encoding` option is configured at the
  transport level (same as `endpoint` or `headers`). Host apps own the transport
  configuration; federated modules consume the configured transport without knowing
  the wire encoding. Duplicate-package-copy behavior remains **isolated**.

- **Security & Privacy Considerations**: The protobuf encoder serializes the same
  already-sanitized `OtlpLogsRequest` as JSON — no new data exposure. Configured auth
  headers are sent only on the wire and never embedded in the serialized body (TO-6).
  The binary protobuf body is not human-readable, but this is a wire-format property,
  not a security property — the JSON body is equally public over HTTPS. The protobuf
  encoder adds no new path that could leak sensitive data.

- **Log Integrity Considerations**: The event model, attribute ordering, severity
  mapping, and trace correlation are identical between JSON and protobuf. The only
  difference is the wire encoding. Downstream monitoring integrity is preserved —
  a protobuf-encoded batch decoded by a conformant OTLP receiver yields the same
  structured data as the JSON-encoded equivalent.

- **Runtime Scale & Federated Deployment Impact**: No per-`Logger` cost. The protobuf
  encoder is a pure function invoked once per batch during `flushBatch` — same call
  site as JSON encode. No new timers, listeners, global patches, or network work.
  Duplicate-package-copy: **isolated** (unchanged from Feature 007).

- **Supply-Chain / Distribution Impact**: No new dependencies. No change to `exports`
  map, `files`, publish path, or CI pipeline structure. Attested publishing, signed
  tags, DCO attribution, and pinned/screened dependencies remain intact. The
  `bundle-invariance` check's budget for `dist/transport-otlp.mjs` is updated.

- **Verification & Enforcement**:
  - `encoding` option validation → `tests/unit/transport-otlp/otlp-transport.test.ts` (construction-time throw)
  - Protobuf wire format correctness → `tests/contract/transport-otlp.contract.test.ts` + `tests/unit/transport-otlp/otlp-protobuf-encoder.test.ts`
  - No `@opentelemetry/*` in bundle → `tests/security/transport-otlp-bundle-shape.security.test.ts` (unchanged gate, verified)
  - Bundle gz budget → `tests/security/transport-otlp-bundle-shape.security.test.ts` (budget constant updated)
  - Existing bundles within ±1 KiB → `scripts/ci/bundle-invariance-check.sh` (extends bundle list if needed)
  - Content-Type correctness → `tests/integration/transport-otlp-protobuf.integration.test.ts`
  - All gates runnable via single entrypoint → `npm run verify` (unchanged script, covers all)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `OtlpTransportOptions` type MUST accept a new optional `encoding`
  field with values `'json'` (default) or `'protobuf'`. Any other value MUST throw a
  `TypeError` at construction time.

- **FR-002**: The protobuf encoder MUST produce valid OTLP `LogsData` protobuf binary
  messages conforming to the published OTLP logs protobuf schema (v1.x). The encoder
  MUST be implemented with zero runtime dependencies — no `@opentelemetry/*`, no
  `protobufjs`, no external protobuf library.

- **FR-003**: The protobuf encoder MUST encode all fields present in the
  `OtlpLogsRequest` object model — `ResourceLogs`, `ScopeLogs`, `LogRecord`, `KeyValue`,
  and `AnyValue` — with correct protobuf field tags, wire types, and varint encoding.
  It MUST omit default/zero-value fields per proto3 conventions.

- **FR-004**: The delivery layer MUST set `Content-Type: application/x-protobuf` when
  `encoding` is `'protobuf'` and `Content-Type: application/json` when `encoding` is
  `'json'` (or default). The body MUST be a `Uint8Array` for protobuf and a `string`
  for JSON.

- **FR-005**: The protobuf encoding MUST be pure and synchronous — no `async`, no
  `Promise`, no regex, no intermediate string conversion. It MUST be total over the
  `OtlpLogsRequest` shape and MUST never throw (fail-closed: an unexpected encoding
  failure is caught by the existing `serialize_failed` guard in `flushBatch`).

- **FR-006**: System MUST preserve browser runtime safety and failure resilience for
  all new behavior, including fail-closed handling when serialization or transport
  delivery fails.

- **FR-007**: System MUST keep consumer-visible behavior framework-neutral and
  implementation details hidden behind the package interface. The protobuf encoder
  is an internal implementation detail behind the existing `encode()` seam.

- **FR-008**: System MUST define structured logging metadata, level behavior, and
  privacy-safe handling expectations for any new or changed logging behavior. The
  protobuf encoding produces the same structured content as JSON — no new metadata.

- **FR-009**: System MUST be secure by default: the protobuf encoding MUST NOT expose
  secrets, credentials, tokens, session identifiers, authorization headers, cookies, or
  unnecessary personal data in the serialized body. The encoder only serializes the
  already-sanitized `OtlpLogsRequest` — same data as JSON.

- **FR-010**: System MUST preserve log integrity and monitoring suitability: protobuf-
  encoded events remain structured, machine-parseable (per the OTLP protobuf spec),
  origin-attributable, and the drop/sample/batch/transform behavior is identical to
  the JSON path and already documented.

- **FR-011**: System MUST keep `Logger` instance creation lightweight and
  side-effect-free. The `encoding` option is a transport-level configuration — no
  per-`Logger` init, no new timers/listeners/global patches. Duplicate-package-copy
  behavior remains **isolated**.

- **FR-012**: System MUST pair every quality gate this feature documents (protobuf wire
  format correctness, bundle budget, vendor neutrality, `encoding` option validation)
  with a machine-executable enforcement mechanism — test file, CI job, or publish-time
  hook — that fails closed when the gate is violated. All verification MUST produce
  identical outcomes between CI and local invocations via `npm run verify`.

### Key Entities *(include if feature involves data)*

- **OtlpEncoding**: A union type `'json' | 'protobuf'` governing which wire encoder is
  used. Exposed only on the options type; not a standalone export.
- **Protobuf binary payload**: The output of the protobuf encoder — a `Uint8Array`
  containing a valid OTLP `LogsData` message. Not persisted; built per-batch and handed
  to `fetch` for delivery.
- **Encoding seam** (existing from Feature 007, FR-015): The internal `encode()` function
  that accepts `OtlpLogsRequest` and produces the wire body. Extended from
  `string`-only to `string | Uint8Array`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A protobuf-encoded batch of 20 typical log events is 30–60% smaller in
  byte size than the equivalent JSON-encoded batch (verified by a contract test that
  measures both encodings for identical input).
- **SC-002**: The `dist/transport-otlp.mjs` gzipped size stays within the recorded
  budget (a small headroom over the measured baseline with protobuf included), and
  existing bundle baselines stay within ±1 KiB — verified by the bundle-shape
  security test and bundle-invariance CI check.
- **SC-003**: A conformant OTLP receiver can decode a protobuf-encoded batch and
  extract the same structured event data (log records, severity, attributes, trace
  context) as the equivalent JSON-encoded batch — verified by a contract test that
  decodes both encodings and compares the results.
- **SC-004**: The protobuf encoder contributes zero new runtime dependencies to the
  package — verified by `tests/contract/dependency-pins.test.ts`.
- **SC-005**: Consumer-facing API behavior is verified by automated contract tests
  covering encoding option validation, content-type correctness, and semantic
  equivalence between JSON and protobuf paths.
- **SC-006**: Runtime failures in protobuf encoding degrade safely — a `serialize_failed`
  notice is emitted (rate-limited, one per instance per session) and the batch is
  dropped, without throwing or rejecting to the caller — verified by unit tests.
- **SC-007**: Documentation and examples remain accurate for host-app and module-based
  integration paths, including the new `encoding` option — README updated with a usage
  example and the roadmap protobuf entry marked as shipped.

## Assumptions

- Target OTLP collectors support `application/x-protobuf` Content-Type and the OTLP logs
  protobuf wire format (v1.x). This is the standard for OTLP/HTTP — any conformant
  OTLP receiver supports it.
- The OTLP logs protobuf schema is stable. The encoder targets the published v1.x schema
  and does not attempt to be forward-compatible with unreleased schema versions.
- `Uint8Array` is universally available in the target browser range (all modern
  browsers). The `deliver()` function uses `fetch` with a `Uint8Array` body, which is
  supported in all browsers that support `fetch`.
- The existing `OtlpLogsRequest` object model (from Feature 007) is a faithful
  representation of the OTLP logs data model — the protobuf encoder is a mechanical
  translation from that object model to protobuf binary, not a re-interpretation.
- The per-record `maxRecordBytes` guard continues to use JSON measurement as a
  conservative over-estimate. Protobuf is always smaller than JSON for the same data,
  so a record that passes the JSON-based guard will always fit as protobuf.
- The `bundle-invariance` CI check and bundle-shape security test are the enforcement
  mechanism for the new gz budget. No new CI job is required.
