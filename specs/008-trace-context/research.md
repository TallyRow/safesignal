# Phase 0 Research: W3C Trace-Context Propagation

The `/speckit-clarify` session settled the three highest-impact decisions
(ingestion path, dedicated `context.trace` field, carry-only). This document
records the technical decisions that turn those into an implementable design.

## D1 — Field model & types

**Decision**: Add `interface TraceContext { traceId: string; spanId: string;
traceFlags?: number; traceState?: string }` to `src/api/types.ts`, and an
optional `trace?: TraceContext` on `LogContext`. Ids are **lowercase-hex
strings** (32 / 16 chars); `traceFlags` is a number (0–255); `traceState` is the
raw W3C string (bounded).

**Rationale**: First-class structured field keeps trace identity distinct from
the arbitrary `attributes` bag (Principle VI) and maps 1:1 to OTLP's standard
fields. Type-only change → zero runtime/bundle cost for the type itself. Hex
strings are the W3C wire form and the OTLP/JSON encoding (D5), so no conversion
is needed at the serializer.

**Alternatives**: reserved `attributes['trace.id']` keys — rejected in clarify
(muddies the model, complicates OTLP top-level mapping).

## D2 — Ingestion: existing context path + `parseTraceparent`

**Decision**: No new runtime ingestion API. Trace context is supplied via the
existing merge inputs — `configureLogging({ context: { trace } })`,
`logger.withContext({ trace })`, or the per-emit `correlation(): { trace }`
hook. Add one pure public helper `parseTraceparent(header: string, tracestate?:
string): TraceContext | undefined` that turns a W3C header string into the
structured shape (returns `undefined` on invalid input — never throws).

**Rationale**: Reuses the tested context-merge precedence and the cheap,
synchronous `correlation` contract (Principle VII — no ambient reads, no new
surface). Apps typically hold a `traceparent` *string*, so the parser is the one
ergonomic affordance they need.

**Alternatives**: dedicated `setTraceContext()` / `withTraceContext()` API
(redundant surface) and ambient auto-read (violates VII) — both rejected in
clarify.

## D3 — `mergeContexts` extension

**Decision**: `mergeContexts` (currently field-by-field: application / module /
environment shallow-replace, attributes deep-merge) gains a `trace` arm:
**shallow-replace if defined** (a later source's `trace` wholly replaces an
earlier one), matching `application`/`module` semantics. Precedence is the
existing root → logger chain → `correlation()` order.

**Rationale**: Trace context is an atomic identity unit; deep-merging partial
trace objects across layers would risk mixing a `traceId` from one layer with a
`spanId` from another. Shallow-replace gives deterministic, documented
precedence.

**Alternatives**: deep-merge trace fields — rejected (could produce
incoherent trace/span pairings).

## D4 — Fail-closed validation, once per emit

**Decision**: A pure `normalizeTraceContext(trace: unknown): TraceContext |
undefined` validates against W3C rules and is called **once per emit during
context resolution**, before sanitize/redact:
- `traceId`: exactly 32 lowercase-hex, not all-zero → else drop the whole trace.
- `spanId`: exactly 16 lowercase-hex, not all-zero → else drop the whole trace
  (a record needs both ids to be useful; partial id is dropped — see edge case).
- `traceFlags`: coerce to an integer 0–255 if present, else omit the flag.
- `traceState`: keep if within the documented length bound (e.g. ≤ 512 chars),
  else omit the `traceState` (keep the ids).
- Never throws; returns `undefined` for absent/invalid trace.

**Rationale**: Centralizing validation at emit means a directly-supplied
`context.trace` and a parsed one are validated identically (FR-004). Per-emit
cost is consistent with the existing sanitize/redact stages (Principle VII is
about `Logger` creation cost, not per-emit). Fail-closed: bad input → no trace
fields, event still ships (Principle II).

**Open (defer to tasks)**: exact `traceState` length bound and whether an
invalid `spanId` with a valid `traceId` keeps the `traceId` alone. Working
default: require BOTH ids; drop the whole trace if either is invalid (simplest,
avoids a half-correlated record). Confirm in tasks.

## D5 — OTLP/JSON trace-field mapping

**Decision**: In `src/transport-otlp/otlp-serializer.ts`, `toLogRecord` adds,
**when `event.context.trace` is present**:
- `traceId`: the lowercase-hex string as-is (OTLP/JSON encodes the trace_id
  bytes field as a lowercase-hex string — NOT base64).
- `spanId`: the lowercase-hex string as-is.
- `flags`: `traceFlags` as a number, when present.
- `traceState`: NOT emitted on the OTLP record in v1 (no standard OTLP
  `LogRecord` field; avoid polluting attributes). Documented; revisit if a
  backend needs it.
When `trace` is absent, none of these fields are emitted (no empty/zero ids).

**Rationale**: OTLP's JSON encoding specifies hex strings for `trace_id` /
`span_id`, so the structured hex form maps with zero conversion and **no
`@opentelemetry/*` import** — the 007 vendor-neutral bundle gate holds. The
serializer change is a small field addition on the existing `OtlpLogRecord`.

**Alternatives**: base64 bytes — wrong for OTLP/JSON; importing an OTel encoder
— breaks the bundle gate.

## D6 — Where `parseTraceparent` lives + the bundle re-baseline

**Decision**: `parseTraceparent` lives in core (`src/trace/traceparent.ts`) and
is exported from the default entry alongside the `TraceContext` type. Accept
that `dist/index.mjs` grows by the merge + validation + parser code.

**Bundle plan**:
- The growth MUST stay within the ±1 KiB CI invariance gate
  (`scripts/ci/bundle-invariance-check.sh`).
- The hard-ceiling test constant `DEFAULT_ENTRY_MJS_GZ_MAX` (8200, observed
  8166 — 34 B headroom) WILL be exceeded by any core addition, so it MUST be
  re-baselined to the new measured size (a named task). This is the
  beacon-leakage detector, re-baselined for a legitimate core feature — not a
  relaxation of a security gate.
- **Fallback** (if the measured index delta approaches/exceeds ±1 KiB): move
  `parseTraceparent` to a new `./trace` subpath (its own tsup entry + exports
  map entry + bundle-shape test), keeping only the field + `mergeContexts` arm +
  `normalizeTraceContext` in core. Decide from the measured number during
  implementation.

**Rationale**: A ~70-line pure parser + validator is expected to add only a few
hundred bytes gz — within ±1 KiB — so core export is the simpler design. The
fallback keeps a hard ceiling on index growth if the estimate is wrong.

## D7 — Pipeline ordering & redaction interaction

**Decision**: Trace normalization runs during context resolution, **before**
sanitize/redact. Trace ids are hex identifiers and pass through redaction
unchanged; `traceState` is bounded at normalization and is subject to the same
redaction pass as other context (no special-casing that could leak). Surrounding
attribute/context/error redaction is unaffected.

**Rationale**: Validating before redaction means a malformed trace never reaches
a transport; treating `traceState` as ordinary redactable context avoids any
secret-leak path (Principle IV).

## D8 — Verification reuse

**Decision**: No new CI jobs/runners. Rides the existing pipeline (build →
typecheck ×2 → test ×2 Node 20+22 → bundle-invariance → dependency-pins → lint
→ format-check → coverage → secret-scan → dco). The only CI-adjacent change is
re-baselining `DEFAULT_ENTRY_MJS_GZ_MAX` (D6).

**Rationale**: Principle VIII — one reproducible entrypoint, identical local/CI.

## Open items deferred to /speckit-tasks (implementation detail, not ambiguity)

- Exact `traceState` length bound; the valid-`traceId`/invalid-`spanId` policy
  (working default: require both).
- Whether `parseTraceparent` returns `undefined` vs. a `{ ok, reason }` result
  on invalid input (working default: `TraceContext | undefined`).
- Final core-vs-`./trace`-subpath decision for `parseTraceparent`, from the
  measured index-bundle delta (D6).
- The re-baselined `DEFAULT_ENTRY_MJS_GZ_MAX` / `_CJS_` values (measured after
  implementation).
