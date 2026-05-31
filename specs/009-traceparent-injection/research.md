# Phase 0 Research: Outbound `traceparent` Header Injection

All "NEEDS CLARIFICATION" items were pre-resolved by the spec's three Settled Defaults
(OTLP-only scope, homogeneous-only fail-closed batch policy, single `injectTraceparent?`
opt-in). This document records the remaining *implementation* decisions and their
rationale.

## D1 — Where to compute and inject the header

**Decision**: In `flushBatch` (`src/transport-otlp/otlp-transport.ts`), after the batch is
serialized and before the `deliver(...)` call. Build a per-request header map and pass it
to `deliver` in place of `state.headers`.

**Rationale**: `flushBatch` is the one place that already holds the full `events: LogEvent[]`
of a single delivery request and is already fail-closed (a serialize failure drops the
batch without throwing). It is the natural — and only — point where "the batch that becomes
one HTTP request" exists as a unit, which is exactly the granularity the homogeneity rule
needs. `deliver(endpoint, headers, body)` already accepts a headers argument, so wiring is
a one-line change.

**Alternatives considered**:
- *Inject inside `deliver`*: rejected — `deliver` has no access to the events (only the
  serialized body string), so it cannot compute the batch trace decision.
- *Per-event header*: rejected by Settled Default 2 (a request is one batch; a single
  `traceparent` describes one trace).

## D2 — Reuse emit-time normalization; do NOT re-validate in the transport

**Decision**: The header builder reads `event.context.trace` and trusts it as an
already-normalized `TraceContext` (or `undefined`). It does **not** import or re-run
`normalizeTraceContext` from `src/trace/`. It applies only a minimal defensive format
guard (treat a structurally-odd value as "no trace") and re-checks the `tracestate` length
bound as belt-and-suspenders.

**Rationale**: Feature 008 already validates `context.trace` exactly once per emit, during
context resolution, **before any transport sees the event** (the emit path writes the
normalized result back onto the event). The OTLP serializer already relies on this — it
reads `context.trace.traceId/spanId/traceFlags` directly with the comment "validated
upstream". Re-validating in the transport would either (a) duplicate core validation logic
inside the subpath (bundle cost + drift risk against the single source of truth), or
(b) import `src/trace/validate.ts` into `src/transport-otlp/**`, which **violates the 007
TO-7 boundary** (the subpath may import only `type` from `../api/types.js`). Trusting the
normalized field keeps one source of truth and preserves the vendor-neutral bundle gate.

**Alternatives considered**:
- *Import `normalizeTraceContext` into the subpath*: rejected — breaks TO-7; the
  bundle-shape security test would (correctly) fail.
- *Copy the normalizer into the subpath*: rejected — logic duplication the constitution's
  maintainability principle (V) discourages, and an unnecessary bundle increase, for a guard
  that is already guaranteed upstream.

## D3 — Homogeneity decision: the traceparent key

**Decision**: For each event compute a key from the normalized `context.trace`:
- absent trace → sentinel `none`;
- present → `` `${traceId}-${spanId}-${flagsByte}` `` where `flagsByte = traceFlags ?? 0`.

Inject `traceparent` **iff** the batch is non-empty **and** every event's key is the same
**non-`none`** value. Then evaluate `tracestate` separately (D4).

**Rationale**: The W3C `traceparent` string encodes `version-traceId-spanId-flags`, so the
flags byte is part of the request-level claim — two events in the same trace/span but with
different sampling flags would produce different `traceparent` strings, so they are *not*
uniform and the header must be omitted (non-misleading, Principle VI). Using a single
string key makes the "all identical" test a trivial set-size-1 check and makes
"valid + absent" mixes correctly non-homogeneous (`none` ≠ any real key). Comparing the
**normalized** values means two events whose raw inputs differed but normalized equal are
correctly treated as homogeneous (spec edge case).

**Alternatives considered**:
- *Ignore flags in the key*: rejected — would emit a `traceparent` whose flags match only
  some events, misrepresenting the rest.
- *Treat "absent" as a wildcard that matches any present context*: rejected — a batch
  mixing traced and untraced events is genuinely heterogeneous; tagging the whole request
  with one event's trace would be misleading.

## D4 — `tracestate` rides along only when uniformly present

**Decision**: When `traceparent` is injected, also set a `tracestate` header **iff** every
event has the **same** defined `traceState` string and it is within `MAX_TRACESTATE_LEN`
(512). If `traceState` is absent on any event, differs across events, or exceeds the bound,
omit `tracestate` while keeping `traceparent`.

**Rationale**: Mirrors Feature 008's "optional part dropped individually, valid ids kept"
stance and the spec's FR-004 + acceptance scenario 4 / edge case. `tracestate` is
vendor-state that is only meaningful if uniform; a partial or oversized value is dropped
rather than guessed or truncated (truncating could corrupt vendor list-member syntax).

## D5 — Header precedence: injected headers never overwrite consumer headers

**Decision**: Build the per-request map as
`{ traceparent, ...(tracestate ? { tracestate } : {}), ...state.headers }`. Consumer
`options.headers` (already copied + frozen at construction) are spread **last** and win on
any key collision. When injection is disabled or the batch is non-homogeneous, return the
**same** `state.headers` reference (no new object).

**Rationale**: Satisfies FR-009 / 007 TO-6 — the injected trace headers can never
overwrite, duplicate, or expose a consumer auth/secret header (consumer always wins), and
the frozen `state.headers` is never mutated. Returning the identical reference on the
disabled/non-homogeneous path guarantees the request is byte-for-byte unchanged from
today (SC-003) and avoids per-flush allocation in the common default-off case.

**Alternatives considered**:
- *Injected headers win over consumer headers*: rejected — a consumer who deliberately set
  their own `traceparent` (e.g. a fixed correlation) must not be silently overridden, and
  "must not overwrite options.headers" is an explicit requirement.

## D6 — `traceparent` string format

**Decision**: `` `00-${traceId}-${spanId}-${flagsHex}` `` where `traceId` is the 32-hex,
`spanId` the 16-hex (both already lowercase-hex, validated upstream), and `flagsHex` is
`(traceFlags ?? 0)` rendered as exactly 2 lowercase-hex digits
(`(flags & 0xff).toString(16).padStart(2, '0')`). Version is always `00`.

**Rationale**: This is the W3C Trace Context level-1 `traceparent` form. The ids are
emitted as-is (no transformation) exactly as the OTLP serializer already does for the
payload. Flags default to `00` when the optional `traceFlags` is absent, because the header
field is mandatory in the string even though the structured field is optional — `00`
(unsampled, no flags) is the correct W3C default.

## D7 — Bundle budget: transport-only change

**Decision**: Expect a small `dist/transport-otlp.mjs` gzip increase (the header builder +
wiring). Keep it within the existing recorded budget enforced by
`transport-otlp-bundle-shape.security.test.ts`; re-baseline that single budget constant
**only if** the measured size requires it, recording the new measured value. The default /
`./testing` / `./transport-beacon` bundle-invariance constants are **not** touched — no
file under `src/` outside `src/transport-otlp/` changes, so those bundles are byte-identical.

**Rationale**: Unlike Feature 008 (which touched the core event model and grew
`dist/index.mjs`), this feature is confined to the OTLP subpath. The blast radius for
bundle gates is exactly one bundle. This is enforced mechanically: the invariance check
will show a zero delta for the non-OTLP bundles, and the OTLP bundle-shape test guards both
vendor-neutrality (unchanged) and the size ceiling.

## D8 — Failure safety wrapping

**Decision**: Wrap the header decision in a try/catch inside `flushBatch`; on any
unexpected throw, fall back to the plain `state.headers` (no injected header) and proceed
with delivery. The decision runs only on the already-fail-closed flush path; it adds no new
throw site to `send`/`flush`/`shutdown`.

**Rationale**: Principle II — header enrichment is best-effort and must never convert a
deliverable batch into a dropped or throwing one. The builder is pure and shouldn't throw,
but the defensive catch guarantees the invariant regardless of input.

## Summary of decisions

| # | Decision | Drives |
|---|----------|--------|
| D1 | Inject in `flushBatch`, pass per-request headers to `deliver` | FR-001..FR-003 |
| D2 | Trust emit-time-normalized `context.trace`; no `src/trace/` import | FR-007, TO-7 boundary |
| D3 | traceparent key = `traceId-spanId-flagsByte`; set-size-1 ⇒ inject | FR-002/FR-003 |
| D4 | `tracestate` only when uniformly present + in bound | FR-004 |
| D5 | Consumer headers spread last; same-ref on disabled path | FR-009, SC-003 |
| D6 | `00-<traceId>-<spanId>-<2-hex flags>`, flags default `00` | FR-002/FR-008 |
| D7 | Only `transport-otlp.mjs` budget may move; others byte-unchanged | FR-013, SC-004 |
| D8 | try/catch → fall back to plain headers, never throw | FR-005/FR-006 |
