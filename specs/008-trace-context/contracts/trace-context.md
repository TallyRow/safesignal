# Contract: Trace-Context Core Surface

**Scope**: the core (default-entry) additions — the `TraceContext` type, the
`LogContext.trace` field, context-merge behaviour, fail-closed validation, and
the `parseTraceparent` helper. Stability: **additive**, backward compatible.

## TC-1 — Public surface

The default entry (`@tallyrow/safesignal`) adds exactly:
- `parseTraceparent` — a value (function).
- `TraceContext` — a **type-only** export.

`LogContext` gains an optional `trace?: TraceContext`. No existing export, field,
or behaviour changes.

*Enforcement*: `tests/contract/declarations-surface.test.ts` /
public-API contract; `tests/contract/trace-context.contract.test.ts`.

## TC-2 — Field carriage

When a valid trace context is supplied through any merge input
(`configureLogging.context`, `withContext()`, or `correlation()`), every emitted
`LogEvent` carries it on `context.trace`. When none is supplied, `context.trace`
is absent (never an empty/zero-id object).

*Enforcement*: `tests/contract/trace-context.contract.test.ts`.

## TC-3 — Merge precedence

`trace` follows the documented context-merge precedence (root config → logger
chain → `correlation()`), **shallow-replace if defined** — a later source's
`trace` wholly replaces an earlier one (no mixing of ids across layers).

*Enforcement*: `tests/contract/trace-context.contract.test.ts`.

## TC-4 — Fail-closed validation

`normalizeTraceContext` MUST:
- require `traceId` = 32 lowercase-hex, non-zero AND `spanId` = 16 lowercase-hex,
  non-zero; if either is invalid, the whole `trace` is dropped (`undefined`).
- coerce `traceFlags` to an integer 0–255 when present, else omit the flag.
- keep `traceState` when within the documented length bound, else omit it.
- never throw; an invalid/absent trace yields `undefined`.

A logging call with malformed trace input MUST still emit the event (without
trace fields) and MUST NOT throw or reject to the caller.

*Enforcement*: `tests/unit/trace/validate.test.ts` +
`tests/integration/trace-context-failure-safety.integration.test.ts`.

## TC-5 — `parseTraceparent`

`parseTraceparent(header, tracestate?)` MUST:
- parse a valid `00-<32hex>-<16hex>-<2hex>` header into a `TraceContext`.
- return `undefined` on any shape violation (never throw).
- attach `traceState` from the optional `tracestate` arg (subject to the same
  bound).

*Enforcement*: `tests/unit/trace/traceparent.test.ts`.

## TC-6 — Carry-only

No code path generates a `traceId` or `spanId`. Absent supplied context ⇒ no
trace fields (no minted/session ids).

*Enforcement*: `tests/contract/trace-context.contract.test.ts` (asserts no trace
fields without supply).

## TC-7 — Security & redaction

Trace ids are carried as identifiers; `traceState` is length-bounded; existing
attribute/context/error redaction is unaffected and still runs after trace
resolution. No new path serializes a secret.

*Enforcement*: `tests/security/trace-context-privacy.security.test.ts`.

## TC-8 — Lightweight

No per-`Logger` trace state/timer/listener/ambient read/network. Validation is
per-emit (like sanitize), not per-`Logger`. Derived loggers stay constant-cost.

*Enforcement*: `tests/performance/trace-context-logger-cost.perf.test.ts`.

## TC-9 — Bundle discipline

`dist/index.mjs` stays within the ±1 KiB invariance gate; the re-baselined
`DEFAULT_ENTRY_MJS_GZ_MAX` constant reflects the new measured size. No new
runtime dependency.

*Enforcement*: `scripts/ci/bundle-invariance-check.sh` +
`tests/security/transport-beacon-bundle-shape.security.test.ts` (re-baselined) +
`tests/contract/dependency-pins.test.ts`.
