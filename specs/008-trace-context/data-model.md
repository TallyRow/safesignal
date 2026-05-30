# Phase 1 Data Model: W3C Trace-Context Propagation

Shapes for the trace-context feature. The public additions are the
`TraceContext` type and the optional `LogContext.trace` field; everything else
is pure internal helpers.

## TraceContext (public, added to `LogContext`)

```text
interface TraceContext {
  traceId: string      // 32 lowercase-hex chars, not all-zero
  spanId: string       // 16 lowercase-hex chars, not all-zero
  traceFlags?: number  // 0–255 (bit 0 = sampled); omitted if absent
  traceState?: string  // raw W3C tracestate, length-bounded; omitted if absent
}
```

`LogContext` gains `trace?: TraceContext` (additive optional field). Present on
an emitted `LogEvent.context` only when valid trace context was supplied.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `traceId` | `string` | ✅ (within `trace`) | 32 hex, lowercase, not all-zero |
| `spanId` | `string` | ✅ (within `trace`) | 16 hex, lowercase, not all-zero |
| `traceFlags` | `number` | — | integer 0–255; coerced/clamped, else omitted |
| `traceState` | `string` | — | ≤ documented bound (e.g. 512 chars), else omitted |

**Validation (`normalizeTraceContext`)**: returns a `TraceContext` only when
**both** ids are valid; otherwise returns `undefined` (the whole trace is
dropped fail-closed). `traceFlags` / `traceState` are individually omitted when
invalid/over-bound but do not invalidate the ids. Pure, never throws.

## parseTraceparent (public helper)

```text
parseTraceparent(traceparent: string, tracestate?: string): TraceContext | undefined
```

Parses a W3C `traceparent` of the form
`00-<32hex traceId>-<16hex spanId>-<2hex flags>`:
- version `00` (others: best-effort accept the known 4 fields, ignore extra).
- On any shape violation → `undefined` (never throws).
- `tracestate` (if given + within bound) → `traceState`.
- The result is passed back through the normal validation (`normalizeTraceContext`)
  at emit, so parse + direct-supply are validated identically.

## OtlpLogRecord (extended — internal, `./transport-otlp`)

The existing `OtlpLogRecord` gains optional trace fields (emitted only when
`event.context.trace` is present):

```text
OtlpLogRecord {
  timeUnixNano: string
  observedTimeUnixNano: string
  severityNumber: number
  severityText: string
  body: AnyValue
  attributes: KeyValue[]
  traceId?: string       // lowercase-hex (OTLP/JSON encoding) ← context.trace.traceId
  spanId?: string        // lowercase-hex ← context.trace.spanId
  flags?: number         // ← context.trace.traceFlags (when present)
}
```

`traceState` is NOT mapped to the OTLP record in v1 (no standard field;
documented). Absent trace context ⇒ none of these fields are emitted.

## Relationships

```text
supply: configureLogging.context.trace
      | logger.withContext({ trace })
      | correlation(): { trace }
      | parseTraceparent(header) → trace
                 │
                 ▼  (existing context-merge precedence: root → chain → correlation)
        mergeContexts(...)  — `trace` shallow-replace if defined (D3)
                 │
                 ▼  (once per emit, before sanitize/redact)
        normalizeTraceContext(merged.trace) → valid TraceContext | undefined  (D4, fail-closed)
                 │
                 ▼
        LogEvent.context.trace (present only when valid)
                 │
   ┌─────────────┴───────────────┐
   ▼                             ▼
./transport-otlp serializer     other transports (e.g. ./transport-beacon)
→ OTLP LogRecord traceId/        → structured trace rides in the event payload
  spanId/flags (D5)                 (no special handling; nothing breaks)
```

## Invariants

- **Additive**: events without trace context are byte-unchanged; existing
  `LogContext` consumers and transports are unaffected.
- **Carry-only**: no code path generates a `traceId`/`spanId`.
- **Fail-closed**: invalid trace input ⇒ no trace fields; emit never throws.
- **Vendor-neutral**: the OTLP serializer reads a plain field; no
  `@opentelemetry/*` import; the subpath bundle gate holds.
- **Bounded**: `traceState` length-bounded; trace adds constant per-emit cost,
  zero per-`Logger` cost.
