# Implementation Plan: OTLP Log Transport

**Branch**: `007-transport-otlp` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-transport-otlp/spec.md`

## Summary

Add an additive `./transport-otlp` subpath that delivers SafeSignal's
fully-processed `LogEvent`s to any OTLP-compatible logs backend as
**OTLP/HTTP+JSON** `LogRecord`s. It mirrors the shipped `./transport-beacon`
subpath: a small factory (`createOtlpTransport`) returning a `Transport`, with
the same boundary discipline (only a type-only import from `../api/types.js`),
the same fail-safe posture (never throws into the caller), and the same
vendor-neutral bundle guarantee.

**Key technical approach** (resolved in research):

- **Hand-built OTLP/HTTP+JSON, zero-dependency.** The subpath MUST NOT import
  `@opentelemetry/*` or the `src/internal/telemetry/otel/**` seam (both carry
  the `@opentelemetry` runtime, which the subpath bundle-shape test forbids).
  It serializes the OTLP logs JSON shape directly using literal `severityNumber`
  constants. FR-002's "build on the OTel event model" is satisfied by reusing
  the canonical `LogEvent` model and the documented level→severity mapping —
  conceptual reuse, not a runtime import of the dep-bearing seam.
- **Delivery: `fetch` + `keepalive: true`** (POST, explicit `Content-Type:
  application/json`, plus consumer-configured auth headers). No `sendBeacon`
  (it cannot set auth headers). Drops safely (single notice) when `fetch` is
  unavailable.
- **No retry — fire-and-forget.** Attempt once per batch; drop on failure with
  one rate-limited diagnostic notice. Batching follows the beacon shape
  (max batch size / max batch age).
- **Identity → OTLP Resource.** application/module/environment map to standard
  resource attributes (`service.name`, `service.version`,
  `deployment.environment`, plus `module.name`/`module.version`).

## Technical Context

**Language/Version**: TypeScript 5.x, strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), target ES2020, `platform: browser`.

**Primary Dependencies**: **None added.** Zero runtime dependencies preserved —
the OTLP-JSON serializer is hand-written. Build: tsup/esbuild (add one entry).
Lint/format: Biome 2.4.16. Test: Vitest (Node 20 + 22 matrix).

**Storage**: N/A (in-memory bounded batch buffer only; no persistence).

**Testing**: Vitest — contract (`assertTransportContract` + OTLP payload shape),
security/privacy (auth-header non-leak, no event data in URLs, bundle
vendor-neutrality + size), integration (host/module, failure injection),
unit (serializer, severity mapping, endpoint validation), performance
(per-`Logger` constant-cost).

**Target Platform**: Modern browsers; SSR-safe (no ambient reads at import).

**Project Type**: Reusable browser package/library (additive subpath).

**Performance Goals**: Non-blocking emission; constant-cost `Logger` creation/
derivation (no per-instance timer/listener/socket/network); bounded memory
(drop on buffer limit). New `dist/transport-otlp.mjs` gz bundle baseline
recorded; ±1 KiB invariance on existing bundles.

**Constraints**: Browser-safe; privacy-safe (upstream redaction preserved, auth
headers never serialized/leaked); transport-failure tolerant (no throw/reject
to caller); vendor-neutral (no `@opentelemetry/*` in the subpath bundle; works
with any OTLP backend; no `safesignal-server`-preferential path).

**Scale/Scope**: Multi-app + federated-module consumers; one configured
transport instance shared across all loggers; duplicate-package-copy =
**isolated** (each configured instance independent, matching beacon).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **API Stability (I)**: Adds one subpath `./transport-otlp` exposing exactly
  `createOtlpTransport` (value) + `OtlpTransportOptions` (type-only). No change
  to `.`, `./testing`, `./transport-beacon`. Additive + backward compatible; no
  migration. Safe path is the easy path: endpoint required, redaction inherited,
  no "dump everything" affordance. **PASS.**
- **Browser Resilience & Failure Safety (II)**: `send`/`flush`/`shutdown` never
  throw or reject to the caller; only construction-time validation (bad
  endpoint) throws at the consumer's call site, off the hot path. `fetch`
  absence, non-2xx, network reject, oversized payload, and page-unload all
  degrade to a bounded drop + one rate-limited notice. Serialization wrapped
  fail-closed. The internal `SafeTransport` wrapper provides a second failure
  barrier. **PASS.**
- **Neutrality & Portability (III)**: Standard OTLP/HTTP+JSON consumed by any
  conformant backend; no vendor/back-end branch; no `@opentelemetry/*` runtime
  import (kept out of the bundle). Host apps + federated modules use the same
  `TransportFactory` model. **PASS.**
- **Structured Observability (III)**: Emits structured OTLP `LogRecord`s with
  documented shape, bounded depth/size; level→severityNumber mapping is total
  over `debug/info/warn/error`; backend changes need no consumer call-site
  rewrite. **PASS.**
- **Secure by Default (IV)**: Receives only post-redaction events and does not
  re-open them; auth headers sent only on the wire, never serialized into
  events/records/payload/diagnostics/bundle; no event data in URLs (T-S1);
  body-only (T-S2) HTTPS (T-S3); events immutable (T-S4). No env/build/transport
  downgrade. **PASS.**
- **Log Integrity & Monitoring Suitability (VI)**: LogRecords are stable,
  machine-parseable, origin-attributable (identity → Resource). Batching +
  drop-on-failure (no retry, no reorder/dedup/mutate beyond batching) are
  documented. Transport stays the integrity boundary; ingestion remains
  application-owned. **PASS.**
- **Lightweight Logger & Federated Runtime (VII)**: No per-`Logger` init —
  batcher, timers, and connection state live on the single configured transport
  instance; `child()`/`withContext()` stay constant-cost. Host owns the runtime;
  modules don't replace it. Duplicate-copy = **isolated** (documented). **PASS.**
- **Reproducible Verification (VIII)**: Every gate runs through existing `npm`
  scripts identically locally + in CI; tests needing `dist/` declare it
  (`needs: build` in CI; `beforeAll` fails loudly locally). `tests/` held to the
  same standards as `src/` (one tsconfig, Biome, build). No new relaxations
  planned; any required one carries a named, time-bound removal task. **PASS.**
- **Mechanical Enforcement (IX)**: Each documented gate is paired with an
  automated check (table below). No documented gate is left unenforced. **PASS.**
- **Test & Documentation Coverage**: Contract + unit + integration + failure +
  security/privacy tests enumerated in Phase 1; README gains a `./transport-otlp`
  section + protobuf roadmap entry; examples model safe usage. **PASS.**

**Gate result: PASS — no violations. Complexity Tracking left empty.**

### Documented gate → enforcement map (Principle IX)

| Gate | Enforcement mechanism |
|------|----------------------|
| Transport contract T-S1..T-S5 | `tests/contract/transport-otlp.contract.test.ts` (runs `assertTransportContract`) |
| OTLP-JSON payload shape correctness | `tests/contract/transport-otlp.contract.test.ts` (payload-structure assertions) |
| Auth headers never leak into body/records/diagnostics | `tests/security/transport-otlp-privacy.security.test.ts` |
| No event data in delivery URL (T-S1) | same security test + `assertTransportContract` |
| Subpath bundle has no `@opentelemetry/*` / vendor identifiers | `tests/security/transport-otlp-bundle-shape.security.test.ts` (mirror of beacon) |
| Subpath source-import boundary (only type-only `../api/types.js`) | same bundle-shape test (group a) |
| New `dist/transport-otlp.mjs` gz size budget | same bundle-shape test (gzip budget) |
| Existing bundles within ±1 KiB | `scripts/ci/bundle-invariance-check.sh` (extend bundle list) + `transport-beacon-bundle-shape` default-entry lock |
| `exports` map shape (adds `./transport-otlp`) | `tests/contract/declarations-surface.test.ts` / public-API contract test |
| Dependency pins (zero new runtime deps) | `tests/contract/dependency-pins.test.ts` |
| OTel runtime stays out of subpath | bundle-shape test (b) + `internal-import-boundary.test.ts` (unchanged) |
| Lightweight per-`Logger` cost | `tests/performance/*` + integration host/module test |
| DCO sign-off | `dco-check` CI job |

## Project Structure

### Documentation (this feature)

```text
specs/007-transport-otlp/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── transport-otlp-public-api.md
│   └── otlp-payload.md
├── checklists/
│   └── requirements.md  # /speckit-specify output
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── api/
│   └── types.ts                     # (unchanged) Transport, LogEvent, LogContext
├── transport-beacon/                # (unchanged) reference pattern
└── transport-otlp/                  # NEW subpath
    ├── index.ts                     # public entry: createOtlpTransport + OtlpTransportOptions (type)
    ├── otlp-transport.ts            # factory + per-instance state + send/flush/shutdown
    ├── otlp-serializer.ts           # pure LogEvent[] → OTLP/HTTP+JSON (resourceLogs); literal severity nums
    ├── resource.ts                  # LogContext identity → OTLP Resource attributes
    ├── attributes.ts                # AttributeValue → OTLP AnyValue (pure)
    ├── delivery.ts                  # fetch(keepalive) POST; 2xx/partial-success handling
    ├── batcher.ts                   # bounded batch buffer (size/age); may mirror beacon batcher
    ├── endpoint-validation.ts       # HTTPS / allowInsecureLoopback (mirror beacon)
    └── errors.ts                    # typed construction error + failure-class codes

tests/
├── contract/
│   └── transport-otlp.contract.test.ts
├── security/
│   ├── transport-otlp-privacy.security.test.ts
│   └── transport-otlp-bundle-shape.security.test.ts
├── integration/
│   └── transport-otlp-host-module.integration.test.ts
├── unit/
│   └── transport-otlp/
│       ├── otlp-serializer.test.ts
│       ├── resource.test.ts
│       ├── attributes.test.ts
│       └── endpoint-validation.test.ts
└── performance/
    └── transport-otlp-logger-cost.perf.test.ts
```

Build/config touch-points (additive only):
- `tsup.config.ts` — add `'transport-otlp': 'src/transport-otlp/index.ts'`.
- `package.json` — add the `./transport-otlp` `exports` entry (types/import/require).
- `scripts/ci/bundle-invariance-check.sh` — add `transport-otlp` to the bundle list.
- `.gitlab-ci.yml` `dependency-pins` / `release-dependency-pins` — add the new
  bundle-shape test to the gated set (mirrors how `transport-beacon-bundle-shape`
  is listed).
- `README.md` — `./transport-otlp` usage section + protobuf roadmap entry.

**Structure Decision**: Mirror the proven `src/transport-beacon/` layout under a
new sibling `src/transport-otlp/` with the identical boundary discipline (only a
type-only import from `../api/types.js`; no reach into `internal/`, `runtime/`,
`pipeline/`, `config/`, `context/`, `transport/`, or `internal/telemetry/otel/`).
Tests slot into the existing `tests/{contract,security,integration,unit,
performance}/` directories, following the beacon test names so the enforcement
story is symmetric and discoverable.

## Complexity Tracking

> No constitutional violations — section intentionally empty.
