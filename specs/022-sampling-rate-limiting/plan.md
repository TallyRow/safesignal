# Implementation Plan: Opt-In Sampling / Rate-Limiting

**Branch**: `022-sampling-rate-limiting` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-sampling-rate-limiting/spec.md`

## Summary

Add opt-in sampling and rate-limiting to SafeSignal as `Transport` wrappers —
following the existing `SafeTransport` wrapper pattern. A `sampling` config
section on `LoggerConfig` makes the safe path the easy path (set once, applies
to all transports). Head-based sampling uses `Math.random()` for statistical
pass/drop decisions. Rate-limiting uses a token bucket with `performance.now()`
for monotonic time accounting. Samplers fail open (broken sampler = event passes
through), respect the never-throw boundary, and require an `onDrop` callback so
no drops are ever silent (Principle VII).

## Technical Context

**Language/Version**: TypeScript 5.x (matching existing codebase)

**Primary Dependencies**: None — zero new dependencies. Samplers use only
`Math.random()`, `performance.now()`, and the existing `Transport` interface,
`PackageError`, `safeNotify`, and `wrapAsPackageError` from `internal/errors`.

**Storage**: Browser memory only — token bucket state (`tokens`, `lastRefill`)
is per-sampler-instance, allocated once at `configureLogging()` time.

**Testing**: Vitest (existing). `vi.useFakeTimers()` for rate-limit clock
mocking. `assertTransportContract` for Transport interface compliance.

**Target Platform**: Modern browsers (ES2020, matching existing target).
`performance.now()` and `Math.random()` are universally available.

**Project Type**: Reusable frontend package/library.

**Performance Goals**: O(1) per-event overhead for both sampler types.
Sampling OFF: single branch in config normalization, zero per-event overhead.
Sampling ON: one `Math.random()` call (head) or elapsed-time calculation +
token consume (rate-limit). Bundle-size increase ≤ 2 KB gzipped over baseline.

**Constraints**: Browser-safe, privacy-safe, fail-open on sampler errors,
never-throw boundary preserved, no new sensitive-data paths.

**Scale/Scope**: Per-transport sampling (not global). Each transport gets its
own sampler instance. Sampler state is transport-level, not per-`Logger`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec-Driven Development (NON-NEGOTIABLE)**: ✅ This work originates from
  `specs/022-sampling-rate-limiting/spec.md`, created via `/speckit-specify`
  with reflection review (2 rounds) and 5 `/speckit-clarify` questions
  resolved. This plan precedes any production code. The full Spec Kit
  lifecycle is being followed: specify → clarify → plan → tasks → implement.

- **API Stability**: ✅ Additive only. New exports: `SamplerConfig` type,
  `HeadSampler` factory, `RateLimitSampler` factory, `DropNotification` type.
  New optional `sampling` field on `LoggerConfig`. No existing exports
  changed, removed, or deprecated. The safe path is the easy path:
  `sampling` in `configureLogging()` is the recommended default;
  transport-wrapper factories are the advanced path. No deprecation needed.

- **Browser Resilience & Failure Safety**: ✅ Sampler errors fail OPEN
  (FR-007) — decision-logic throws result in event pass-through, not drop.
  `onDrop` callback throws are caught and routed to `onInternalError` exactly
  once per session (FR-008, matching SafeTransport's FS-12 pattern). The
  sampler's `send()` never throws and never returns a rejected Promise.
  Sampler wraps the consumer transport; `SafeTransport` wraps the sampler —
  belt-and-suspenders. The existing pipeline (sanitize → URL-scrub → redact
  → control-char-guard → freeze) runs before the sampler sees the event, so
  fail-closed redaction still holds.

- **Neutrality & Portability**: ✅ Samplers are pure `Transport` wrappers —
  no framework, application, backend, or vendor coupling. They work with any
  transport (console, beacon, OTLP, custom). The config-level approach (US2)
  applies uniformly regardless of transport type. No vendor-specific sampling
  protocol — this is a generic statistical/rate-limit mechanism.

- **Structured Observability**: ✅ The sampler does not alter the event
  structure — events that pass through are delivered unchanged. Drop
  notifications (`DropNotification`) are structured with documented fields
  (level, message, timestamp, reason, samplerName). Drop rate is observable
  through the `onDrop` callback. No raw object dumping. The sampler
  conforms to the `Transport` interface, so future transports work without
  changes. No open interchange standard exists for frontend sampling — this
  is a generic mechanism, not a proprietary format.

- **Secure Logging by Default & Sensitive Data Minimization**: ✅ Sampling is
  OFF by default — no events dropped, no new data paths. When ON, the sampler's
  decision function does NOT inspect `event.attributes`, `event.context`, or
  `event.error` (FR-007a). `DropNotification` contains only metadata (level,
  message, timestamp, reason, samplerName) — explicitly NOT attributes, context,
  or error objects. The existing pipeline (redaction, sanitization) runs before
  the sampler sees the event, so redacted data cannot leak through sampling.
  Default configuration unchanged. No environment-based security downgrade.

- **Log Integrity & Monitoring Suitability**: ✅ The sampler intentionally drops
  events — the first feature to do so. Per Principle VII, every drop is
  documented and observable. `onDrop` is REQUIRED when sampling is configured;
  configuration without it is rejected. The sampler does not reorder, batch, or
  transform passed-through events. Drop events are NOT emitted through the log
  pipeline itself (they're a separate notification path) — this is intentional
  to avoid infinite loops (dropped drop-notifications). The transport
  abstraction boundary is preserved — drops happen before the transport sees the
  event.

- **Lightweight Logger Instances & Federated Runtime**: ✅ Sampler instances are
  created once at `buildConfiguredRuntime()` time (transport configuration),
  NOT per `Logger`. `Logger` construction remains side-effect-free. Sampler
  state (token bucket `tokens`/`lastRefill`) lives at the transport level in
  the shared runtime, not per-`Logger`. Host owns sampler configuration;
  federated modules inherit host-configured sampling. Duplicate-package-copy
  behavior: isolated (each copy's samplers operate independently, which is
  correct for independent configured runtimes).

- **Reproducible Verification**: ✅ All tests invokable via `npm test` (Vitest).
  `npm run typecheck` covers both `src/` and `tests/`. Bundle-size check runs
  in CI against the existing budget. No new prerequisites beyond the existing
  build (`dist/`). Test code under `tests/` held to same TypeScript standards
  as `src/`. No tolerated relaxations needed — all new code is standard TS.
  Vitest and `tsc --noEmit` share the same tsconfig resolution; no divergence.

- **Mechanical Enforcement of Documented Contracts**: ✅ Every gate has an
  enforcement mechanism:
  - `tests/contract/sampler-contract.test.ts` — S1–S4 contracts (Transport
    interface compliance, fail-open, callback isolation, config rejection)
  - `tests/unit/sampler/head-sampler.test.ts` — SC-001 distribution accuracy,
    SC-003 fail-open
  - `tests/unit/sampler/rate-limit-sampler.test.ts` — SC-002 token bucket,
    clock accuracy
  - `tests/unit/sampler/drop-callback.test.ts` — SC-004 callback contract
  - `tests/security/sampler-no-leak.security.test.ts` — FR-006/FR-007a
    sensitive-data isolation
  - `tests/integration/sampler-config.integration.test.ts` — FR-004/FR-005
    config integration
  - Bundle-size budget (SC-007): existing CI bundle-size check
  All tests fail closed — a violation fails the build.

- **Supply-Chain Integrity & Provenance**: ✅ No change to release pipeline,
  publish path, or dependency set. No new dependencies. New exports are
  additive to the core `index` entry (no new subpath). Attested publishing,
  signed tags, DCO attribution, and pinned/screened dependencies remain
  intact. `tests/contract/distributed-surface.contract.test.ts` will catch
  any unintended export changes.

- **Test & Documentation Coverage**: ✅
  - Contract tests: `sampler-contract.test.ts` (S1–S4)
  - Unit tests: head-sampler, rate-limit-sampler, drop-callback
  - Security tests: sampler-no-leak
  - Integration tests: sampler-config
  - Docs: `quickstart.md` created; README.md subpaths table updated with
    sampler exports; existing examples continue to model safe logging
    (no sampling in examples — it's opt-in, and example code should show
    the simplest path)

## Project Structure

### Documentation (this feature)

```text
specs/022-sampling-rate-limiting/
├── plan.md              # This file
├── research.md          # Phase 0: existing patterns, algorithm choices
├── data-model.md        # Phase 1: entities, relationships, state lifecycle
├── quickstart.md        # Phase 1: consumer-facing usage examples
├── contracts/
│   └── sampler-contract.md  # Phase 1: S1–S4 contract specifications
└── tasks.md             # Phase 2 output (NOT created by this command)
```

### Source Code (repository root)

```text
src/
├── sampler/
│   ├── head-sampler.ts          # HeadSampler class + factory
│   ├── rate-limit-sampler.ts    # RateLimitSampler class + factory
│   └── types.ts                 # SamplerConfig, DropNotification types
├── api/
│   └── types.ts                 # ADD: SamplerConfig, DropNotification to LoggerConfig
├── config/
│   └── config.ts                # ADD: normalizeSamplingConfig, sampling validation
├── runtime/
│   └── configured-runtime.ts    # MODIFY: sampler wrapping before SafeTransport
└── index.ts                     # ADD: export sampler factories + types

tests/
├── contract/
│   └── sampler-contract.test.ts
├── unit/
│   └── sampler/
│       ├── head-sampler.test.ts
│       ├── rate-limit-sampler.test.ts
│       └── drop-callback.test.ts
├── security/
│   └── sampler-no-leak.security.test.ts
└── integration/
    └── sampler-config.integration.test.ts
```

**Structure Decision**: New `src/sampler/` directory for the two sampler classes
and shared types — follows the existing pattern (`src/transport/`,
`src/pipeline/`). Samplers are exported from the core `index` entry (not a
separate subpath) because the config-level approach (US2) requires no extra
import. No new tsup entry needed.

## Complexity Tracking

> No constitution violations — this section is empty.
