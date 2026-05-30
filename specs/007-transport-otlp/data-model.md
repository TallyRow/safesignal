# Phase 1 Data Model: OTLP Log Transport

Pure data shapes for the `./transport-otlp` subpath. All types are internal
except `OtlpTransportOptions` (public, type-only) and the `Transport` it
produces (from `src/api/types.ts`, unchanged).

## OtlpTransportOptions (public, type-only)

The consumer-facing configuration passed to `createOtlpTransport(options)`.

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `endpoint` | `string` | ✅ | — | Full OTLP logs URL (e.g. `https://otlp.example.com/v1/logs`). Validated at construction (D8). |
| `headers` | `Record<string, string>` | — | `{}` | Static request headers (e.g. auth). Sent only on the wire; never serialized into events/records/diagnostics (FR-009). |
| `batching` | `{ maxBatchSize: number; maxBatchAgeMs?: number }` | — | `{ maxBatchSize: 20, maxBatchAgeMs: 5000 }` | Flush triggers (D7). |
| `maxBufferedEvents` | `number` | — | `1000` | Hard cap on **undelivered** events (buffered in the batcher + in flight); events over the cap are dropped (`buffer_overflow` notice). Must be ≥ `maxBatchSize`. |
| `maxRecordBytes` | `number` | — | `65536` (64 KiB) | Per-record size guard: a single event whose serialized OTLP `LogRecord` exceeds this is dropped (`oversized_event` notice), never sent. Mirrors beacon's 64 KiB payload guard. |
| `name` | `string` | — | `'otlp'` | Stable diagnostic identifier (`Transport.name`). |
| `allowInsecureLoopback` | `boolean` | — | `false` | Permits `http://` only for localhost/127.0.0.1/[::1] (D8). |
| `onInternalError` | `(err: Error) => void` | — | no-op | Receives rate-limited diagnostic notices (never carries header/secret values). |

**Validation rules**: `endpoint` must parse as a URL and satisfy D8; `headers`
keys/values must be strings; `batching.maxBatchSize` ≥ 1; `maxBufferedEvents`
≥ `maxBatchSize`; `maxRecordBytes` ≥ 1. All validation runs in the factory
(construction time), throws a typed error to the consumer call site, and never
affects the emit hot path.

## OtlpTransportState (internal, per instance)

```text
OtlpTransportState {
  readonly endpoint: string
  readonly headers: Readonly<Record<string,string>>   // never logged
  readonly name: string
  readonly onInternalError: (err: Error) => void
  readonly batching: { maxBatchSize: number; maxBatchAgeMs: number }
  readonly maxBufferedEvents: number
  readonly maxRecordBytes: number                       // per-record size guard (64 KiB default)
  batcher: Batcher                                      // bounded buffer + timer
  pagehideInstalled: boolean
  pagehideUninstall: (() => void) | null
  shutdownComplete: boolean
  notified: Record<OtlpFailureCode, boolean>            // one notice per class/session
  inFlight: Set<Promise<void>>                          // in-flight deliveries (awaited by flush/shutdown)
  pending: number                                       // undelivered = buffered + in-flight; capped at maxBufferedEvents
}
```

Ownership: created once by `createOtlpTransport`; shared by every `Logger`
deriving from the runtime. No per-`Logger` allocation (Principle VII).

## OtlpFailureCode (internal)

Rate-limited diagnostic classes (one notice per class per instance per session):

| Code | Trigger |
|------|---------|
| `oversized_event` | A single event's serialized OTLP `LogRecord` exceeds `maxRecordBytes` (default 64 KiB); the event is dropped, never sent. |
| `buffer_overflow` | Undelivered (buffered + in-flight) events at `maxBufferedEvents`; incoming event dropped. |
| `delivery_unavailable` | `fetch` is not available in the runtime. |
| `send_failed` | non-2xx response, or `fetch` threw/rejected (carries `.cause`). |
| `partial_rejection` | 2xx with OTLP `partialSuccess.rejectedLogRecords > 0`. |
| `serialize_failed` | Building the OTLP payload threw (fail-closed; batch dropped). |
| `shutdown_failed` | `shutdown()` cleanup threw (still resolves). |

## OTLP wire shapes (internal serializer output — see contracts/otlp-payload.md)

```text
OtlpLogsRequest {
  resourceLogs: [ ResourceLogs ]
}
ResourceLogs {
  resource: { attributes: KeyValue[] }       // identity (D3)
  scopeLogs: [ ScopeLogs ]
}
ScopeLogs {
  scope: { name: string; version?: string }  // name = '@tallyrow/safesignal'
  logRecords: OtlpLogRecord[]                 // one per LogEvent in the batch
}
OtlpLogRecord {
  timeUnixNano: string                        // ms × 1e6, uint64-as-string
  observedTimeUnixNano: string
  severityNumber: number                      // 5 | 9 | 13 | 17 (D2)
  severityText: string                        // DEBUG | INFO | WARN | ERROR
  body: AnyValue                              // { stringValue: message }
  attributes: KeyValue[]                      // event.attributes + context.* + exception.*
}
KeyValue { key: string; value: AnyValue }
AnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: AnyValue[] } }
  | { kvlistValue: { values: KeyValue[] } }
  | {}                                        // null → unset
```

### Resource attribute construction (D3)

Emit only present runtime-global fields (`module.*` is per-record, see below):
- `service.name` ← `context.application.name`
- `service.version` ← `context.application.version`
- `deployment.environment` ← `context.environment`

### LogRecord attribute construction (D4/D5)

- Each `event.attributes[k]` → `KeyValue{ key: k, value: AnyValue }`.
- Each `event.context.attributes[k]` → `KeyValue{ key: 'context.'+k, value }`.
- `module.name` / `module.version` (if present) — per-record origin identity.
- If `event.error`: add `exception.type` (name), `exception.message`,
  `exception.stacktrace` (stack, if present).

## Relationships

```text
createOtlpTransport(OtlpTransportOptions)
        │  validates (endpoint D8, options)
        ▼
OtlpTransportState ──owns──> Batcher (bounded buffer + flush timer)
        │                         │ flush(batch: LogEvent[])
        │                         ▼
        │                  serialize(batch) ──> OtlpLogsRequest (pure, no @opentelemetry)
        │                         │
        │                         ▼
        │                  deliver(endpoint, headers, json)  // fetch keepalive POST (D6)
        ▼
returns Transport { name, send, flush, shutdown }   // never throws to caller
```

## Invariants

- **Immutability (T-S4)**: the serializer reads `LogEvent` fields and never
  mutates the event.
- **No event data in URL (T-S1)**: the endpoint URL is consumer-fixed; nothing
  from the event is appended to it.
- **Header isolation (FR-009)**: `headers` are referenced only by `deliver(...)`;
  no code path copies them into a record, payload, diagnostic, or error message.
- **Bounded memory (FR-013)**: buffer length ≤ `maxBufferedEvents`; over-cap
  events dropped, no retry buffer exists.
- **Constant-cost derivation (VII)**: state is per-transport-instance, not
  per-`Logger`.
