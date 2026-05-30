# Implementation Plan: W3C Trace-Context Propagation

**Branch**: `008-trace-context` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-trace-context/spec.md`

## Summary

Add an optional, first-class `context.trace = { traceId, spanId, traceFlags?,
traceState? }` field to the event model so host-supplied **W3C Trace Context**
rides on every emitted `LogEvent`, and extend the `./transport-otlp` serializer
to populate the OTLP `LogRecord`'s standard top-level `traceId` / `spanId` /
`traceFlags` fields. SafeSignal is **carry-only** (never mints ids) and stays a
consumer/propagator, not a tracer.

**Key technical approach** (resolved in clarify + research):

- **Dedicated structured field**, not attribute keys: `LogContext.trace?:
  TraceContext` (hex strings). Type-only addition → zero bundle cost for the
  type itself.
- **Ingestion via the existing context path** (`configureLogging` context /
  `withContext()` / the per-emit `correlation()` hook) + a pure public
  `parseTraceparent(string)` helper. No new ambient reads, no dedicated runtime
  API (Principle VII).
- **Fail-closed validation once per emit**: a pure `normalizeTraceContext`
  validates W3C shape (32/16-hex, non-zero ids, bounded `traceState`) and drops
  invalid parts; it runs during context resolution, before sanitize/redact.
  Never throws into emit (Principle II).
- **OTLP mapping**: the `./transport-otlp` serializer emits OTLP/JSON
  `traceId`/`spanId` as lowercase-hex strings + `traceFlags` as a number, with
  **no `@opentelemetry/*` import** (the 007 bundle gate holds). `traceState`
  stays on the event context; it is NOT mapped to the OTLP record in v1 (no
  standard field — documented, revisitable).
- **Core-touching ⇒ bundle re-baseline**: `dist/index.mjs` grows (new merge +
  validation + parser). Keep the delta within the ±1 KiB CI gate and re-baseline
  the hard-ceiling test constant (`DEFAULT_ENTRY_MJS_GZ_MAX`, currently 8200 vs.
  observed 8166 — 34 B headroom). Fallback if the ±1 KiB gate is threatened:
  move `parseTraceparent` to a `./trace` subpath, keeping only field+merge+
  validation in core.

> **Dependency**: extends the `./transport-otlp` serializer from **Feature 007**
> (MR !23, in review). This branch is stacked on 007 and rebases onto `main`
> once 007 merges. Implementation should follow 007's merge.

## Technical Context

**Language/Version**: TypeScript 5.x, strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), target ES2020, `platform: browser`.

**Primary Dependencies**: **None added.** `parseTraceparent` + validation are
hand-written, pure, zero-dependency. Build: tsup. Lint/format: Biome. Test:
Vitest (Node 20 + 22 matrix).

**Storage**: N/A.

**Testing**: Vitest — contract (field model + merge precedence + OTLP trace
mapping), failure-safety (malformed input fail-closed, no throw), security
(redaction unaffected, no `traceState` secret-leak path), unit
(`parseTraceparent`, `normalizeTraceContext`), performance (no per-`Logger`
trace cost).

**Target Platform**: Modern browsers; SSR-safe (no ambient reads).

**Project Type**: Reusable browser package — **core change** (event model +
pipeline) plus a serializer extension to the `./transport-otlp` subpath.

**Performance Goals**: Constant-cost `Logger` creation (no per-instance trace
work); per-emit validation is cheap + synchronous, consistent with the existing
sanitize/redact stages. Bundle deltas bounded (index ±1 KiB; transport-otlp
within its 5120 budget, currently 4213).

**Constraints**: Browser-safe; fail-closed on malformed trace input; carry-only
(no id minting); vendor-neutral W3C (no `@opentelemetry/*` in any bundle);
secure (`traceState` bounded, redaction unaffected); additive (no break for
events without trace context).

**Scale/Scope**: Multi-app + federated; trace context layers through the
existing context-merge precedence (root → logger chain → `correlation()`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **API Stability (I)**: Additive — `LogContext` gains an optional `trace`
  field; new public `parseTraceparent` + `TraceContext` type exports; the OTLP
  serializer gains optional output fields. No existing field/behaviour changes;
  events without trace context are unchanged. Safe path stays easy (trace is
  opt-in enrichment; no "dump everything" affordance). **PASS.**
- **Browser Resilience & Failure Safety (II)**: Parsing/validation/serialization
  of trace context never throw into emit; malformed input is dropped fail-closed
  and the event still ships. `parseTraceparent` returns a result, never throws.
  **PASS.**
- **Neutrality & Portability (III)**: Pure W3C Trace Context; works with any
  tracer that emits it; no vendor dep; **no `@opentelemetry/*` import reaches the
  `./transport-otlp` bundle** (serializer keeps hand-rolling OTLP-JSON). **PASS.**
- **Structured Observability (III)**: Trace context is a structured, documented,
  bounded field; level/metadata behaviour unchanged; OTLP backends consume the
  standard trace fields without call-site rewrites. **PASS.**
- **Secure by Default (IV)**: trace_id/span_id are identifiers carried as
  supplied (not secrets); `traceState` is length/shape-bounded with no path that
  serializes a secret; existing attribute/context/error redaction is unchanged
  and still runs after trace resolution. No env/build downgrade. **PASS.**
- **Log Integrity & Monitoring Suitability (VI)**: Trace fields strengthen
  correlation; carry-only avoids minting misleading ids; presence/absence +
  partial-validity handling documented; no new drop/sample/reorder. **PASS.**
- **Lightweight Logger & Federated Runtime (VII)**: No per-`Logger` trace state,
  timer, listener, ambient read, or network work. Trace resolves through the
  existing cheap, synchronous merge precedence; validation is per-emit (like
  sanitize), not per-`Logger`. Host/module ownership unchanged. **PASS.**
- **Reproducible Verification (VIII)**: All gates run via existing `npm` scripts,
  identical local/CI. `tests/` held to `src/` standards. No new relaxations
  planned. **PASS.**
- **Mechanical Enforcement (IX)**: Every gate paired with an automated check
  (table below); the index-bundle re-baseline is an explicit task, not an
  unenforced change. **PASS.**
- **Test & Documentation Coverage**: Contract + failure + security + unit +
  perf tests enumerated in Phase 1; README + quickstart show safe trace usage.
  **PASS.**

**Gate result: PASS — no violations. Complexity Tracking empty.**

### Documented gate → enforcement map (Principle IX)

| Gate | Enforcement mechanism |
|------|----------------------|
| `context.trace` field model + merge precedence | `tests/contract/trace-context.contract.test.ts` |
| Fail-closed validation (malformed → dropped, no throw) | `tests/integration/trace-context-failure-safety.integration.test.ts` |
| `parseTraceparent` correctness + non-throwing invalidity | `tests/unit/trace/traceparent.test.ts` |
| `normalizeTraceContext` validation rules | `tests/unit/trace/validate.test.ts` |
| OTLP `LogRecord` trace-field mapping (hex strings + flags) | `tests/contract/transport-otlp.contract.test.ts` (extended) + serializer unit test |
| `traceState` no secret-leak; redaction unaffected | `tests/security/trace-context-privacy.security.test.ts` |
| No `@opentelemetry/*` in `./transport-otlp` bundle (still) | `tests/security/transport-otlp-bundle-shape.security.test.ts` (unchanged) |
| `dist/index.mjs` within ±1 KiB; re-baselined ceiling | `scripts/ci/bundle-invariance-check.sh` + `DEFAULT_ENTRY_MJS_GZ_MAX` constant (re-baselined) |
| `dist/transport-otlp.mjs` within budget | `tests/security/transport-otlp-bundle-shape.security.test.ts` (budget) |
| Public surface (new exports) shape | `tests/contract/declarations-surface.test.ts` / public-API contract |
| No per-`Logger` trace cost | `tests/performance/*` |
| DCO sign-off | `dco-check` CI job |

## Project Structure

### Documentation (this feature)

```text
specs/008-trace-context/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── trace-context.md          # core field model, merge, validation, parseTraceparent
│   └── otlp-trace-mapping.md     # OTLP LogRecord trace-field mapping
├── checklists/
│   └── requirements.md  # /speckit-specify output
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── api/
│   └── types.ts                     # + TraceContext interface; + LogContext.trace?
├── index.ts                         # + export { parseTraceparent }; + export type { TraceContext }
├── context/
│   └── context-merge.ts             # handle `trace` (shallow-replace, like application/module)
├── api/logger.ts (emit path)        # call normalizeTraceContext once per emit (context resolution)
├── trace/                           # NEW (core, pure, zero-dep)
│   ├── traceparent.ts               # parseTraceparent(string) → { ok, trace } (never throws)
│   └── validate.ts                  # normalizeTraceContext(trace) → valid TraceContext | undefined
└── transport-otlp/
    └── otlp-serializer.ts           # populate LogRecord traceId/spanId/traceFlags from context.trace

tests/
├── contract/
│   ├── trace-context.contract.test.ts
│   └── transport-otlp.contract.test.ts        # extended: OTLP trace fields
├── security/
│   └── trace-context-privacy.security.test.ts
├── integration/
│   └── trace-context-failure-safety.integration.test.ts
├── unit/
│   ├── trace/{traceparent,validate}.test.ts
│   └── transport-otlp/otlp-serializer.test.ts # extended: trace mapping
└── performance/
    └── trace-context-logger-cost.perf.test.ts
```

Build/config touch-points:
- `src/index.ts` — new exports (value + type).
- `tests/security/transport-beacon-bundle-shape.security.test.ts` — re-baseline
  `DEFAULT_ENTRY_MJS_GZ_MAX` (and `_CJS_`) to the new measured index size.
- No new `tsup` entry and no new `exports` map entry (unless the `./trace`
  subpath fallback is taken — see research D6).

**Structure Decision**: Keep the trace utilities in a new **core** `src/trace/`
directory (pure, zero-dep, no cross-subpath imports), wire the field through the
existing `LogContext` + `mergeContexts` + emit-path validation, and extend the
already-shipped `src/transport-otlp/otlp-serializer.ts` to read the structured
field. `parseTraceparent` + `TraceContext` export from the default entry. The
`./transport-otlp` serializer reads `event.context.trace` directly (a plain
field read) — it does **not** import `src/trace/` or `@opentelemetry/*`, so the
subpath's vendor-neutral bundle gate is untouched.

## Complexity Tracking

> No constitutional violations — section intentionally empty.
