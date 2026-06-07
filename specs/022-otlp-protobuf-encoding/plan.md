# Implementation Plan: OTLP Protobuf Encoding

**Branch**: `022-otlp-protobuf-encoding` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-otlp-protobuf-encoding/spec.md`

**Parent**: Feature 007 (`specs/007-transport-otlp/plan.md`) — the OTLP transport whose
encoding seam (FR-015) this feature extends.

## Summary

Add an **opt-in OTLP/HTTP+protobuf binary encoding** to the `./transport-otlp`
subpath, slotting behind the existing documented internal encoding seam (FR-015 from
Feature 007). Consumers toggle it via a single `encoding: 'protobuf'` option on
`OtlpTransportOptions`. JSON remains the default and is unchanged.

**Key technical approach** (resolved in spec clarify section):

- **Hand-built protobuf encoder, zero-dependency.** The encoder produces valid OTLP
  `LogsData` protobuf binary messages conforming to the published OTLP logs protobuf
  schema (v1.x). It is implemented with zero runtime dependencies — no
  `@opentelemetry/*`, no `protobufjs`, no external protobuf library. Wire types,
  varint encoding, and proto3 default-value omission are coded directly.
- **Encoding seam extension.** The existing `encode()` function in
  `otlp-serializer.ts` currently returns `string` (JSON). This feature widens the
  seam to `string | Uint8Array`, dispatches on `encoding` option, and changes
  nothing in the `serializeBatch()` → `OtlpLogsRequest` object model.
- **Delivery adaptation.** `deliver()` currently accepts `body: string` and sets
  `Content-Type: application/json`. This feature adds a `Uint8Array` body path
  with `Content-Type: application/x-protobuf`, controlled by the `encoding` option.
- **Encoding option validation.** `encoding?: 'json' | 'protobuf'` on
  `OtlpTransportOptions`, default `'json'`. Invalid values throw `TypeError` at
  construction time — before any network or timer work (FR-001).
- Protobuf delivers 30–60% smaller payloads (SC-001) and broader collector
  compatibility while preserving semantic equivalence with the JSON path.

## Technical Context

**Language/Version**: TypeScript 5.x, strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), target ES2022, `platform: browser`, ESM. The
protobuf encoder uses `DataView` + `Uint8Array` for binary output (zero-copy,
synchronous).

**Primary Dependencies**: **None added.** Zero runtime dependencies preserved —
the protobuf encoder is hand-written with no imports beyond the existing subpath
types. Build: tsup/esbuild (no new entry — `transport-otlp` entry unchanged).
Lint/format: Biome 2.4.16. Test: Vitest (Node 20 + 22 matrix).

**Storage**: N/A (in-memory bounded batch buffer only; no persistence).

**Testing**: Vitest — contract (protobuf wire format correctness vs OTLP logs
schema, semantic-equivalence comparison with JSON path), security/privacy
(bundle-shape update — new budget ceiling, vendor-neutrality re-verified,
no `@opentelemetry/*` / `protobufjs` in bundle), integration
(encoding-option round-trip, JSON+protobuf coexistence, `Content-Type`
correctness, failure-safety), unit (protobuf encoder — field tags, varint,
length-delimited, proto3 zero-value omission, `AnyValue` encoding, empty batch,
`OtlpLogsRequest` full coverage).

**Target Platform**: Modern browsers; SSR-safe (no ambient reads at import).
`Uint8Array` / `DataView` / `TextEncoder` are universally available in the target
browser range.

**Project Type**: Reusable browser package/library (additive encoding behind
existing seam).

**Performance Goals**: Pure, synchronous encode — no `async`, no `Promise`, no
regex, no intermediate string conversion (FR-005). Non-blocking emission;
constant-cost `Logger` creation/derivation unchanged. Protobuf is more compact
than JSON (30–60% smaller) so memory and wire pressure improve.

**Constraints**: Browser-safe; privacy-safe (upstream redaction preserved, auth
headers never serialized/leaked — unchanged from Feature 007, FR-009);
transport-failure tolerant (no throw/reject to caller — FR-006);
vendor-neutral (no `@opentelemetry/*`, no `protobufjs`, no vendor identifiers
in bundle — FR-002); encoding is pure and synchronous (FR-005); existing
`maxRecordBytes` guard continues to use JSON as the conservative measurement
baseline (encoding-agnostic).

**Scale/Scope**: Multi-app + federated-module consumers; one configured
transport instance shared across all loggers; duplicate-package-copy =
**isolated** (unchanged from Feature 007). The `encoding` option is
transport-level configuration only — no per-`Logger` cost.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec-Driven Development (I, NON-NEGOTIABLE)**: This work originates from a
  completed spec at `specs/022-otlp-protobuf-encoding/spec.md` (Issue #20), with
  clarification research encoded in the spec. This plan precedes any production
  code and follows the Spec Kit lifecycle (specify → clarify → plan → tasks →
  implement). Concrete source, stack, dependency, and scope choices are justified
  below. **PASS.**

- **API Stability (II)**: Adds a single optional field `encoding?: 'json' |
  'protobuf'` on `OtlpTransportOptions`, default `'json'` (unchanged). No change
  to `.`, `./testing`, `./transport-beacon`, or the `./transport-otlp` public
  surface shape (`createOtlpTransport` + `OtlpTransportOptions` — TO-1 from
  Feature 007, unchanged). Fully backward compatible: all existing consumers
  continue to emit JSON with zero code change. The protobuf encoder is an
  internal implementation detail behind the existing `encode()` seam (FR-007).
  No deprecation or migration required. Safe path remains the easy path: JSON is
  the default. **PASS.**

- **Browser Resilience & Failure Safety (III)**: The protobuf encoder is pure
  and synchronous — never throws, never rejects (FR-005). Any unexpected
  encoding failure is caught by the existing `serialize_failed` guard in
  `flushBatch` (fail-closed: drop batch + rate-limited notice). `send`/`flush`/
  `shutdown` never throw or reject to the caller — only construction-time
  validation (bad `encoding` value) throws at the consumer's call site, off the
  hot path. The existing `SafeTransport` wrapper remains the second failure
  barrier. `fetch` with `Uint8Array` body is supported in all browsers that
  support `fetch`. **PASS.**

- **Neutrality & Portability (IV)**: Targets the open OTLP logs protobuf schema
  (Apache 2.0, v1.x) — vendor-neutral, works with any conformant OTLP backend.
  No `@opentelemetry/*` import, no `protobufjs`, no vendor identifier in the
  bundle (FR-002). Host apps + federated modules use the same `TransportFactory`
  model. The `encoding` option is a pure serialization swap — no backend-specific
  branch. **PASS.**

- **Structured Observability (V)**: The protobuf encoder produces the same
  structured content as JSON — same `OtlpLogsRequest` object model, same
  `ResourceLogs` / `ScopeLogs` / `LogRecord` shape, same `KeyValue` / `AnyValue`
  attributes. Severity mapping, trace correlation, and attribute encoding are
  semantically identical (SC-003). Conforms to the published OTLP logs protobuf
  specification v1.x (open interchange standard), which is documented as the
  target version. Protobuf is an additive option — it does not displace the
  standards-based JSON path (Principle V interop clause). **PASS.**

- **Secure by Default (VI)**: Receives only post-redaction events and does not
  re-open them (FR-009). Auth headers sent only on the wire, never serialized
  into the protobuf body/diagnostics/bundle — unchanged from Feature 007 (TO-6).
  No event data in URLs (T-S1), body-only (T-S2), HTTPS (T-S3), events
  immutable (T-S4). The protobuf encoder adds no new path that could leak
  secrets, credentials, tokens, session identifiers, or unnecessary personal
  data. No env/build/transport downgrade. Binary protobuf is not human-readable,
  but this is a wire-format property, not a security property — JSON is equally
  public over HTTPS. **PASS.**

- **Log Integrity & Monitoring Suitability (VII)**: Protobuf-encoded events
  remain stable, machine-parseable (per the OTLP protobuf spec), and
  origin-attributable (identity → Resource). Batching + drop-on-failure (no
  retry, no reorder/dedup/mutate beyond batching) are identical to the JSON
  path and already documented (FR-010). The transport abstraction remains the
  integrity boundary. **PASS.**

- **Lightweight Logger & Federated Runtime (VIII)**: No per-`Logger` init —
  the `encoding` option is transport-level configuration only. Batcher, timers,
  connection state live on the single configured transport instance;
  `child()`/`withContext()` stay constant-cost. Host owns the runtime; modules
  don't replace it (FR-011). Duplicate-package-copy = **isolated** (unchanged
  from Feature 007). **PASS.**

- **Reproducible Verification (IX)**: Every gate runs through existing `npm`
  scripts identically locally + in CI; tests needing `dist/` declare it
  (`beforeAll` fails loudly). `tests/` held to the same TypeScript, Biome, and
  import-resolution standards as `src/` — one tsconfig, no relaxations planned.
  All new gates runnable via `npm run verify`. **PASS.**

- **Mechanical Enforcement (X)**: Each documented gate is paired with an
  automated check (table below). No documented gate is left unenforced.
  Bundle budget constant updated in the existing security test; bundle-invariance
  CI check extended. **PASS.**

- **Supply-Chain Integrity & Provenance (XI)**: No new dependencies. No change
  to `exports` map, `files`, publish path, or CI pipeline structure. Attested
  publishing, signed tags, DCO attribution, and pinned/screened dependencies
  remain intact. The `bundle-invariance` check's budget for
  `dist/transport-otlp.mjs` is updated — the enforcement mechanism is the
  existing bundle-shape security test. **PASS.**

**Gate result: PASS — no violations. Complexity Tracking left empty.**

### Documented gate → enforcement map (Principle X)

| Gate | Enforcement mechanism |
|------|----------------------|
| `encoding` option validation (FR-001) — invalid value throws `TypeError` at construction | `tests/unit/transport-otlp/otlp-transport.test.ts` (construction-time throw assertions) |
| Protobuf wire format correctness — field tags, varint, wire types, length-delimited, proto3 zero-value omission (FR-002, FR-003) | `tests/unit/transport-otlp/otlp-protobuf-encoder.test.ts` (binary decoding assertions against known schema) |
| Protobuf → conformant OTLP receiver semantic equivalence (SC-003) | `tests/contract/transport-otlp.contract.test.ts` (decode + compare JSON vs protobuf) |
| `Content-Type: application/x-protobuf` for protobuf path (FR-004) | `tests/integration/transport-otlp-protobuf.integration.test.ts` (fetch-body header assertions) |
| Encoder is pure, synchronous, never throws (FR-005) | `tests/unit/transport-otlp/otlp-protobuf-encoder.test.ts` (no async/regex/string-intermediate assertions; full coverage of `OtlpLogsRequest` shape) |
| Fail-closed: `serialize_failed` notice on unexpected encode failure (FR-006, SC-006) | `tests/integration/transport-otlp-protobuf.integration.test.ts` (failure-injection path) |
| Zero runtime dependencies — no `@opentelemetry/*`, no `protobufjs`, no vendor identifiers in bundle (FR-002) | `tests/security/transport-otlp-bundle-shape.security.test.ts` (group b — vendor-neutrality re-verified; extend `VENDOR_PACKAGE_NAMES`/`VENDOR_IDENTIFIERS` if needed) |
| `dist/transport-otlp.mjs` gz budget (updated ceiling with protobuf included) (SC-002) | `tests/security/transport-otlp-bundle-shape.security.test.ts` (group d — `SIZE_LIMIT_BYTES` constant updated) |
| Existing bundles within ±1 KiB of baseline (SC-002) | `scripts/ci/bundle-invariance-check.sh` (no change needed — existing bundles already tracked) |
| No `@opentelemetry/*` / `protobufjs` string in built bundle | `tests/security/transport-otlp-bundle-shape.security.test.ts` (group b — extend forbidden strings) |
| Transport contract T-S1..T-S5 preserved | `tests/contract/transport-otlp.contract.test.ts` (runs `assertTransportContract`) |
| Auth headers never leak into protobuf body/diagnostics (FR-009) | `tests/security/transport-otlp-privacy.security.test.ts` (unchanged gate, re-verified) |
| No event data in delivery URL (T-S1) | same security test + `assertTransportContract` |
| Source-import boundary — only type-only `../api/types.js` (TO-7) | `tests/security/transport-otlp-bundle-shape.security.test.ts` (group a — extend `walkTs` scan to new `.ts` files) |
| Dependency pins — zero new runtime deps (SC-004) | `tests/contract/dependency-pins.test.ts` (unchanged gate) |
| Lightweight per-`Logger` cost — `encoding` option is transport-level only (FR-011) | `tests/performance/transport-otlp-logger-cost.perf.test.ts` (unchanged gate, re-verified) |
| DCO sign-off | `dco-check` CI job |
| Semantic equivalence of JSON and protobuf paths (SC-003, SC-005) | `tests/contract/transport-otlp.contract.test.ts` (decode-both-and-compare assertions) |
| Empty batch produces valid protobuf (edge case) | `tests/unit/transport-otlp/otlp-protobuf-encoder.test.ts` (zero-records input) |
| `maxRecordBytes` guard is encoding-agnostic (edge case) | `tests/unit/transport-otlp/otlp-transport.test.ts` (unchanged gate, re-verified) |
| `traceparent` injection works identically with protobuf (edge case) | `tests/contract/transport-otlp-traceparent.contract.test.ts` (extend with protobuf-encoding variant) |

## Project Structure

### Documentation (this feature)

```text
specs/022-otlp-protobuf-encoding/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── otlp-protobuf-encoding.md
│   └── otlp-encoding-option-api.md
├── checklists/
│   └── requirements.md  # /speckit-specify output
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── api/
│   └── types.ts                           # (unchanged) Transport, LogEvent, LogContext, …
├── transport-beacon/                      # (unchanged)
└── transport-otlp/                        # EXISTING subpath — files modified or added
    ├── index.ts                           # MODIFIED — export `OtlpEncoding` type if needed
    ├── otlp-transport.ts                  # MODIFIED — `OtlpTransportOptions.encoding`, dispatch in `flushBatch`
    ├── otlp-serializer.ts                 # MODIFIED — `encode()` seam widened to `string | Uint8Array`
    ├── otlp-protobuf-encoder.ts           # NEW — hand-built OTLP protobuf binary encoder
    ├── delivery.ts                        # MODIFIED — `deliver()` accepts `string | Uint8Array`, sets Content-Type accordingly
    ├── resource.ts                        # (unchanged)
    ├── attributes.ts                      # (unchanged) — `AnyValue` / `KeyValue` types reused by protobuf encoder
    ├── batcher.ts                         # (unchanged)
    ├── endpoint-validation.ts             # (unchanged)
    ├── traceparent-header.ts              # (unchanged)
    └── errors.ts                          # (unchanged) — failure codes unchanged

tests/
├── contract/
│   ├── transport-otlp.contract.test.ts    # MODIFIED — protobuf decode + semantic-equivalence assertions
│   └── transport-otlp-traceparent.contract.test.ts  # MODIFIED — extend with protobuf-encoding variant
├── security/
│   ├── transport-otlp-privacy.security.test.ts       # (unchanged gate, re-verified)
│   └── transport-otlp-bundle-shape.security.test.ts  # MODIFIED — updated SIZE_LIMIT_BYTES, extended forbidden-strings
├── integration/
│   ├── transport-otlp-protobuf.integration.test.ts   # NEW — encoding option, Content-Type, failure-safety, JSON+protobuf coexistence
│   ├── transport-otlp-host-module.integration.test.ts  # (unchanged gate, re-verified)
│   ├── transport-otlp-failure-safety.integration.test.ts # (unchanged gate, re-verified)
│   └── transport-otlp-traceparent-failure-safety.integration.test.ts # (unchanged gate, re-verified)
├── unit/
│   └── transport-otlp/
│       ├── otlp-protobuf-encoder.test.ts  # NEW — full unit coverage: field tags, varint, wire types, AnyValue, empty batch, proto3 omission
│       ├── otlp-serializer.test.ts        # (unchanged — JSON path unchanged)
│       ├── otlp-transport.test.ts         # MODIFIED — encoding validation, dispatch assertions
│       ├── resource.test.ts               # (unchanged)
│       ├── attributes.test.ts             # (unchanged)
│       └── endpoint-validation.test.ts    # (unchanged)
└── performance/
    └── transport-otlp-logger-cost.perf.test.ts  # (unchanged gate, re-verified)
```

Build/config touch-points (additive only):

- `tsup.config.ts` — no change needed (`transport-otlp` entry unchanged; new
  `.ts` file is imported transitively by `otlp-serializer.ts` or
  `otlp-transport.ts`).
- `package.json` — no change to `exports` map (existing `./transport-otlp`
  entry covers the subpath).
- `scripts/ci/bundle-invariance-check.sh` — no new bundle added; existing
  `transport-otlp` entry already tracked.
- `README.md` — update `./transport-otlp` section with `encoding` option usage
  example; mark protobuf roadmap entry as shipped (SC-007).

**Structure Decision**: The protobuf encoder is a single new file
(`src/transport-otlp/otlp-protobuf-encoder.ts`) within the existing
`src/transport-otlp/` subpath, following the same boundary discipline (only a
type-only import from `../api/types.js`; no reach into `internal/`, `runtime/`,
`pipeline/`, `config/`, `context/`, `transport/`, or
`internal/telemetry/otel/`). The encoding seam modification (`encode()` return
type widening) is a surgical change in `otlp-serializer.ts` — the
`OtlpLogsRequest` object model and `serializeBatch()` are untouched. Delivery
adaptation (`deliver()` accepting `Uint8Array`) is a narrow change that adds a
branch on body type — the `fetch` call site is the same. Tests slot into the
existing `tests/{contract,security,integration,unit,performance}/` directories,
following the Feature 007 naming conventions so the enforcement story is
symmetric and discoverable.

## Complexity Tracking

> No constitutional violations — section intentionally empty.

