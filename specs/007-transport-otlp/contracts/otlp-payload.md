# Contract: OTLP/HTTP+JSON Logs Payload

Defines the exact wire shape `./transport-otlp` produces. This is the
machine-checkable output contract for the serializer. It is the OTLP logs JSON
encoding — produced by hand, with **no `@opentelemetry/*` dependency** (see
research D1).

## OP-1 — Request envelope

POST body is a single JSON object:

```json
{
  "resourceLogs": [
    {
      "resource": { "attributes": [ /* KeyValue */ ] },
      "scopeLogs": [
        {
          "scope": { "name": "@tallyrow/safesignal" },
          "logRecords": [ /* one per LogEvent in the batch */ ]
        }
      ]
    }
  ]
}
```

- Exactly one `resourceLogs` entry per request (one batch shares one Resource).
- Exactly one `scopeLogs` entry; `scope.name` is the constant
  `"@tallyrow/safesignal"`.
- `Content-Type: application/json`.

## OP-2 — Resource attributes (identity)

`resource.attributes` is a `KeyValue[]` containing only the present
**runtime-global** identity fields, mapped as:

| Source (`LogEvent.context`) | `key` | `value` |
|------------------|-------|---------|
| `application.name` | `service.name` | `{ "stringValue": … }` |
| `application.version` | `service.version` | `{ "stringValue": … }` |
| `environment` | `deployment.environment` | `{ "stringValue": … }` |

Absent fields MUST be omitted (no empty-string or `null` keys). The Resource is
derived from the batch's first event (these fields are constant across a batch
from one configured transport).

**Note (implementation refinement)**: `module.name` / `module.version` are
**per-logger** (they can differ between events in the same batch via
`withContext`), so they are attributed **per-`LogRecord`** (OP-4), not on the
shared Resource — preserving correct origin attribution (Principle VI).

## OP-3 — LogRecord

For each `LogEvent` in the batch:

| Field | Value |
|-------|-------|
| `timeUnixNano` | `String(Date.parse(event.timestamp) * 1_000_000)` (uint64-as-string) |
| `observedTimeUnixNano` | same as `timeUnixNano` |
| `severityNumber` | `5` debug · `9` info · `13` warn · `17` error |
| `severityText` | `"DEBUG"` · `"INFO"` · `"WARN"` · `"ERROR"` |
| `body` | `{ "stringValue": event.message }` |
| `attributes` | `KeyValue[]` per OP-4 |

If `event.timestamp` is unparseable, fall back to a single resolved emit time
(MUST NOT throw).

## OP-4 — LogRecord attributes

`attributes` concatenates, in order:
1. `event.attributes`: each entry `→ { key, value: AnyValue }`.
2. `event.context.attributes`: each entry `→ { key: "context." + k, value }`.
3. Per-logger module identity (if present): `module.name`, `module.version`
   as `{ stringValue }` (per-record, not on the Resource — see OP-2 note).
4. If `event.error` present:
   - `{ key: "exception.type", value: { stringValue: error.name } }`
   - `{ key: "exception.message", value: { stringValue: error.message } }`
   - `{ key: "exception.stacktrace", value: { stringValue: error.stack } }` (only if `stack` present)

## OP-5 — AnyValue encoding (`AttributeValue` → OTLP)

| `AttributeValue` | OTLP `AnyValue` |
|------------------|-----------------|
| `string` | `{ "stringValue": v }` |
| `boolean` | `{ "boolValue": v }` |
| `number`, `Number.isInteger` | `{ "intValue": String(v) }` |
| `number`, non-integer | `{ "doubleValue": v }` |
| `null` | `{}` (unset value) |
| `AttributeValue[]` | `{ "arrayValue": { "values": [ AnyValue… ] } }` |
| `{ [k]: AttributeValue }` | `{ "kvlistValue": { "values": [ KeyValue… ] } }` |

Encoding is total over the `AttributeValue` union and never throws; it does not
re-walk beyond the already-sanitized union (depth/size bounded upstream).

## OP-6 — Validity & safety invariants

- The payload MUST be valid JSON parseable by an OTLP/HTTP logs receiver.
- The serializer MUST NOT mutate the input `LogEvent` (T-S4).
- The serializer MUST NOT embed any configured header/secret value (FR-009).
- The serializer MUST NOT import `@opentelemetry/*` or
  `src/internal/telemetry/otel/**` (TO-7).

*Enforcement*: `tests/contract/transport-otlp.contract.test.ts` (structure,
severity mapping, resource mapping, timestamp conversion) and
`tests/unit/transport-otlp/{otlp-serializer,resource,attributes}.test.ts`.
