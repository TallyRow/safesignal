# Phase 1 Data Model: Outbound `traceparent` Header Injection

This feature adds no new event-model field. It adds one option, one internal state flag,
and one derived per-batch decision. All trace data is the existing Feature 008
`TraceContext` shape read off `event.context.trace`.

## Reused: `TraceContext` (Feature 008 — unchanged)

```ts
interface TraceContext {
  traceId: string;    // 32 lowercase-hex, non-zero (validated upstream)
  spanId: string;     // 16 lowercase-hex, non-zero (validated upstream)
  traceFlags?: number; // integer 0..255 when present
  traceState?: string; // non-empty, ≤ 512 chars when present
}
```

Carried on `LogEvent.context.trace`. **Already normalized** by the emit path before any
transport receives the event (Feature 008). This feature only **reads** it.

## New: `OtlpTransportOptions.injectTraceparent`

| Field | Type | Default | Rules |
|-------|------|---------|-------|
| `injectTraceparent` | `boolean` (optional) | `false` | If defined, MUST be a boolean (else construction throws `TypeError`, per TO-2). When `false`/absent, no `traceparent`/`tracestate` header is ever set and delivery requests are byte-identical to pre-feature behaviour. |

Additive optional field on the existing interface. Erases at runtime — the subpath's
runtime export set stays exactly `['createOtlpTransport']`.

## New: internal transport state flag

| Field | Type | Source |
|-------|------|--------|
| `injectTraceparent` | `boolean` | `options.injectTraceparent ?? false`, stored once at construction on `OtlpTransportState` (alongside the frozen `headers`). Read per flushed batch. |

No timer, listener, buffer, or other resource — a single boolean. Logger creation cost is
unaffected (Principle VII).

## Derived (per flushed batch): `BatchTraceparentDecision`

Computed by the pure helper from the batch's events. Not persisted.

```ts
type BatchTraceparentDecision =
  | { inject: false }                                  // omit both headers
  | { inject: true; traceparent: string; tracestate?: string };
```

### Computation rules

1. **Per-event key** (from normalized `event.context.trace`):
   - absent / structurally-invalid → `none`
   - present → `` `${traceId}-${spanId}-${(traceFlags ?? 0) & 0xff}` ``
2. **traceparent gate**: `inject: true` **iff** the batch is non-empty **and** the set of
   per-event keys is exactly one **non-`none`** value. Otherwise `{ inject: false }`.
3. **traceparent string** (when injecting): `` `00-${traceId}-${spanId}-${flagsHex}` ``,
   `flagsHex = ((traceFlags ?? 0) & 0xff).toString(16).padStart(2, '0')`.
4. **tracestate** (only when injecting): include iff every event has the **same defined**
   `traceState` string with `length ≤ 512`; else omit `tracestate`.

### Decision table

| Batch | Header(s) set |
|-------|---------------|
| Empty | none |
| All events: no trace | none |
| All events: same `{traceId, spanId, flags}` , no/uniform `traceState` | `traceparent` (+ `tracestate` if uniform present) |
| All events: same ids+flags, **differing** `traceState` | `traceparent` only |
| All events: same ids+flags, `traceState` > 512 on any | `traceparent` only |
| Events: two or more differing trace keys | none |
| Events: some traced, some untraced | none |
| `injectTraceparent` disabled | none (regardless of batch) |

## Derived (per flushed batch): request header map

| Case | Headers passed to `deliver(...)` |
|------|----------------------------------|
| disabled OR `{ inject: false }` | the **same** frozen `state.headers` reference (no allocation, byte-identical request) |
| `{ inject: true, traceparent, tracestate? }` | `{ traceparent, ...(tracestate ? { tracestate } : {}), ...state.headers }` — consumer headers spread **last**, always winning on collision |

`state.headers` is never mutated. `deliver` continues to prepend `content-type:
application/json` over whatever map it receives.

## Validation summary

| Rule | Where | Failure mode |
|------|-------|--------------|
| `injectTraceparent` is boolean if defined | `validateOptions` (construction) | throws `TypeError` at call site (only legal throw site, TO-2) |
| trace ids/flags/state shape | upstream emit-path normalization (Feature 008) | invalid → field absent → event keyed `none` |
| `tracestate` ≤ 512 | upstream normalization **and** defensive re-check in builder | over-bound → `tracestate` omitted |
| header build never throws into delivery | `flushBatch` try/catch (D8) | any throw → fall back to plain `state.headers` |
