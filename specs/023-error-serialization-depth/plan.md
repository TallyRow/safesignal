# Implementation Plan: Structured Error Serialization Depth

**Branch**: `023-error-serialization-depth` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-error-serialization-depth/spec.md`

## Summary

Opt-in deep error serialization: when `serializeErrors` is enabled, the event's
error payload (`ErrorInfo`) gains a flat, ordered `causes` chain, recursive
`members` for `AggregateError`, and value-filtered own enumerable `fields`
(including DOMException's legacy `code`) — all bounded by clamped limits under
one node budget, extracted fail-safe at event-build time from the raw error,
and covered end-to-end by extended sanitize/scrub/redact pipeline stages.
While enabled, the feature-016 `safesignal.errorCauses` attribute is never
populated (FR-014). Off by default: the error payload shape is unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x, ES2020 target (existing tsup config)

**Primary Dependencies**: None new. tsup build, Biome lint/format,
api-extractor surface check — all existing.

**Storage**: N/A (in-memory event construction only)

**Testing**: Vitest — contract tests (`tests/contract/`), unit tests
(`tests/unit/errors/`), security tests (`tests/security/`), via the single
`npm run verify` gate.

**Target Platform**: Modern browsers (SSR-import-safe), same as package today.

**Project Type**: Reusable frontend package/library (single package).

**Performance Goals**: Serialization cost only on error-event construction
when enabled; bounded by node budget (≤ 50 nodes default); zero cost when
disabled; zero per-`Logger` cost.

**Constraints**: Bounded output (clamped limits, one node budget); fail-safe
(extraction never throws into host, never drops the event); privacy-safe (all
new fields pass sanitize → scrub → redact; redaction fail-closed);
default-entry size lock respected with one minimal justified ceiling bump
(clarified 2026-06-10).

**Scale/Scope**: ~1 new src module + threading through event-builder, logger,
config, sanitizer, url-scrubber, redactor, types; ~4 new test files; 1
contract doc; targeted amendment to 001 sanitization contract.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec-Driven Development (I)**: PASS — spec frozen after 2 reviewer rounds
  (review-log.md); 4 clarifications resolved and encoded (spec §Clarifications,
  explore-brief.md); this plan precedes all production code. Stack/dependency
  choices: no new dependencies; existing toolchain.
- **API Stability (II)**: PASS — additive only. Touched surface:
  `ErrorInfo` (gains optional `causes`, `members`, `fields`, truncation
  markers), new exported `SerializedErrorNode` + `SerializeErrorsOptions`
  types, `LoggerConfig.serializeErrors?: boolean | SerializeErrorsOptions`.
  No semantics change for existing fields; no deprecation needed (016
  attribute unchanged when feature disabled, suppressed-not-removed when
  enabled — documented in types + changelog). Safe path is the easy path:
  `serializeErrors: true` gives bounded safe defaults. api-extractor
  (`npm run api:check`) locks the new surface.
- **Browser Resilience & Failure Safety (III)**: PASS — extraction wrapped in
  try/catch at the single entry point (event-builder); on any throw
  (hostile getters, exotic objects) falls back to today's `reduceError()`
  result and routes the failure to `onInternalError` via the existing
  `safeNotify` pattern (new `PackageError` code `error_serialize_failed`).
  Event delivery is never dropped; no path propagates a throw to the consumer
  call site. Redaction of new fields fails closed via the existing redactor
  contract (`redactor_failed` drops the event rather than emitting unredacted
  data).
- **Neutrality & Portability (IV)**: PASS — framework-neutral platform
  concepts only (`Error.cause`, `AggregateError`, `DOMException`).
  Standards check (spec §Standards Alignment): OTel exception semantic
  conventions define flat type/message/stacktrace only — no cause-chain or
  aggregate structure exists in a published standard (re-verified in research
  R1); the addition is additive and does not displace the standards-aligned
  flat fields. Host apps and federated modules consume via the same
  `configureLogging` surface.
- **Structured Observability (V→IV in spec numbering)**: PASS — the new data
  is a documented, bounded, structured shape (data-model.md); no raw object
  dumping (value-filtered JSON-safe capture only); truncation is explicit and
  machine-readable.
- **Secure Logging by Default (V)**: PASS — off by default; when enabled,
  every node field flows through sanitize → URL-scrub → redact before any
  transport (FR-008; pipeline stages extended — see Phase 1 design);
  key-based redaction rules apply to `fields` exactly as to attributes;
  functions and prototype properties never captured; no
  environment/build-mode based downgrades.
- **Log Integrity (VII)**: PASS — no drop/sample/batch/reorder change;
  truncation indicators (`causesTruncated`, `membersTotal`, `fieldsTruncated`,
  `budgetExhausted`) preserve forensic honesty; events stay machine-parseable
  and origin-attributable.
- **Lightweight Logger & Federated Runtime (VIII)**: PASS — pure functions
  invoked per error log; no timers, listeners, patches, network, ambient
  reads; config normalized once in `configureLogging` (runtime level, host
  owned); derived loggers constant-cost; duplicate-package-copy contract
  unchanged (isolated).
- **Reproducible Verification (IX)**: PASS — all checks via existing
  `npm run verify` (build, typecheck, lint, format, test, api:check);
  identical local/CI; no new prerequisites or environment dependencies; test
  code held to src standards (no relaxations).
- **Mechanical Enforcement (X)**: PASS — every gate in
  `contracts/error-serialization.md` (ES-1…ES-12) names its enforcing test
  file; size-lock bump lands as an edit to the existing
  `tests/security/transport-beacon-bundle-shape.security.test.ts` constants
  with written rationale; SC-007 documentation review filed as a named task
  (tasks phase, per spec).
- **Supply-Chain Integrity (XI)**: PASS — no release-pipeline, dependency,
  or `exports`-map change; no new subpath (clarified). The only distributed-
  surface delta is default-entry code growth guarded by the size-lock test
  (conscious ceiling bump with rationale). Attestation, signed tags, DCO,
  pins untouched.
- **Test & Documentation Coverage**: contract tests
  (`tests/contract/error-serialization.contract.test.ts`), unit tests
  (`tests/unit/errors/*`), security no-leak test
  (`tests/security/error-serialization.security.test.ts`), fault-injection
  unit tests; README + changelog updates; quickstart.md models safe usage.

**Post-Phase-1 re-check (2026-06-10)**: design artifacts introduce no new
violations; Complexity Tracking remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/023-error-serialization-depth/
├── spec.md              # Frozen
├── explore-brief.md     # Clarify session decisions
├── review-log.md        # Reviewer rounds
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── error-serialization.md   # ES-1…ES-12 enforcement map
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── api/
│   ├── types.ts                 # ErrorInfo extension, SerializedErrorNode,
│   │                            #   SerializeErrorsOptions, LoggerConfig.serializeErrors
│   └── logger.ts                # thread config to event-builder; FR-014 gate on 016 block
├── config/
│   ├── config.ts                # normalize/clamp serializeErrors (clamp-and-notify)
│   └── env-defaults.ts          # DEFAULT_SERIALIZE_ERRORS_LIMITS + bounds
├── errors/
│   └── serialize-error.ts       # NEW: deep extraction (pure, fail-safe-wrapped by caller)
├── pipeline/
│   ├── event-builder.ts         # call serializer when enabled; fallback reduceError
│   ├── sanitizer.ts             # sanitizeErrorInfo recurses causes/members/fields
│   ├── url-scrubber.ts          # scrub node message/field strings (parity w/ flat fields)
│   └── redactor.ts              # shape rules on node name/message; key rules on fields
└── internal/errors/
    └── internal-errors.ts       # new code: 'error_serialize_failed' (+ clamp notice reuse)

tests/
├── contract/error-serialization.contract.test.ts
├── unit/errors/serialize-error.test.ts          # extraction: chains, members, fields,
│                                                #   cycles, budget, cross-realm, DOMException
├── unit/errors/serialize-error-failsafe.test.ts # fault injection (throwing getters etc.)
├── unit/config/serialize-errors-config.test.ts  # clamp-and-notify normalization
└── security/error-serialization.security.test.ts # no-leak: redaction of fields/messages;
                                                  #   off-by-default shape lock; 016 suppression
```

**Structure Decision**: Single-package layout (existing). New code isolated in
`src/errors/` (mirrors `src/breadcrumbs/`, `src/stacks/` feature-module
precedent); pipeline stages extended in place because the error payload is
core event shape, not a subpath concern.

## Complexity Tracking

*No constitution violations — table intentionally empty.*
