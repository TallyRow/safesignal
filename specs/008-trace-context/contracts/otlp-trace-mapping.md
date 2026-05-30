# Contract: OTLP LogRecord Trace-Field Mapping

**Scope**: the `./transport-otlp` serializer extension that maps
`event.context.trace` onto the OTLP `LogRecord`'s standard trace fields.
Extends `specs/007-transport-otlp/contracts/otlp-payload.md` (OP-3).

## OT-1 — Trace fields on the LogRecord

When `event.context.trace` is present and valid, `toLogRecord` MUST add to the
OTLP `LogRecord`:

| OTLP field | Source | Encoding |
|------------|--------|----------|
| `traceId` | `context.trace.traceId` | lowercase-hex string (OTLP/JSON form) |
| `spanId` | `context.trace.spanId` | lowercase-hex string |
| `flags` | `context.trace.traceFlags` (if present) | number |

The structured `traceId`/`spanId` are already lowercase-hex (validated by
`normalizeTraceContext`), so they are emitted **as-is** — no base64, no byte
conversion.

## OT-2 — Absence

When `event.context.trace` is absent, the serializer MUST NOT emit `traceId`,
`spanId`, or `flags` (no empty strings, no all-zero ids).

## OT-3 — `traceState`

`traceState` is NOT mapped onto the OTLP `LogRecord` in v1 (no standard OTLP
`LogRecord` field). It remains on the event context. Documented; revisitable if
a backend requires it (would map to a record attribute, not a standard field).

## OT-4 — Vendor neutrality preserved

The serializer change is a plain read of `event.context.trace` + field
assignment. It MUST NOT import `@opentelemetry/*` or `src/trace/`. The
`./transport-otlp` bundle-shape gate (no `@opentelemetry/` reference; size
budget) MUST continue to pass unchanged.

*Enforcement*: `tests/contract/transport-otlp.contract.test.ts` (extended) +
`tests/unit/transport-otlp/otlp-serializer.test.ts` (extended) +
`tests/security/transport-otlp-bundle-shape.security.test.ts` (unchanged gate).

## OT-5 — Immutability

The serializer MUST NOT mutate the event when reading trace context (T-S4 from
the 007 transport contract still holds).

*Enforcement*: serializer unit test (existing non-mutation assertion).
