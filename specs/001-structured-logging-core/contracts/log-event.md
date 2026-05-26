# Contract: LogEvent

## Shape

```ts
interface LogEvent {
  timestamp: string;          // ISO-8601, package-assigned
  level: LogLevel;            // 'debug' | 'info' | 'warn' | 'error'
  message: string;            // consumer-provided, required, sanitized + escaped
  attributes: Attributes;     // per-call structured fields, sanitized + redacted
  context: LogContext;        // merged context, sanitized + redacted
  error?: ErrorInfo;          // only present from logger.error(msg, attrs, err)
}

interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
}
```

## Pipeline-applied transformations

By the time `LogEvent` reaches any transport:

1. `timestamp` was assigned by the pipeline (consumer cannot supply).
2. `attributes` and `context.attributes` have been **sanitized** per
   `contracts/sanitization.md` and **redacted** per `contracts/redaction.md`.
3. URL-shaped string values in attributes/context have been scrubbed of
   sensitive query/fragment params.
4. `message`, all attribute/context string values, and `error.message` /
   `error.stack` have been control-char-escaped (every ASCII control char
   except `\t`, `\n`, `\r`, plus U+2028 and U+2029).
5. In development builds, the event has been recursively `Object.freeze`d.

## Sanitization rules (summary; full table in `contracts/sanitization.md`)

| Input type                          | Output |
|-------------------------------------|--------|
| `string`                            | kept; truncated to `maxStringLength` |
| `number` (finite)                   | kept |
| `NaN` / `Infinity`                  | `null` |
| `bigint`                            | `String(value)` |
| `boolean`                           | kept |
| `null`                              | kept |
| `undefined`                         | dropped (key removed) |
| `Date`                              | `value.toISOString()` |
| `Error`                             | `{ name, message, stack? }` |
| `Array<AttributeValue>`             | recursed; truncated to `maxArrayLength` |
| plain object                        | recursed; capped by `maxAttributeCount` |
| class instance / DOM node / framework object | `"[<TypeTag>]"` (NOT recursed) |
| function                            | `"[Function]"` |
| symbol                              | `"[Symbol]"` |
| cyclic reference                    | `"[Circular]"` |
| depth > `maxDepth`                  | `"[MaxDepth]"` |
| > `maxAttributeCount` total keys    | excess keys replaced with one `"[Truncated: <N> keys omitted]"` marker |

## Required fields

| Field       | Required | Source |
|-------------|----------|--------|
| `timestamp` | yes      | assigned by `EventBuilder` |
| `level`     | yes      | from the called method |
| `message`   | yes      | consumer-provided; empty string allowed |
| `attributes`| yes      | always an object, may be `{}` |
| `context`   | yes      | merged from config + logger chain + correlation |

## Optional fields

| Field   | Source |
|---------|--------|
| `error` | populated when `logger.error(message, attributes, error)` is called with a third arg |

## Immutability

Events are recursively frozen with `Object.freeze` before reaching transports
in development builds (`NODE_ENV !== 'production'`). Production builds skip
the freeze for performance. Transports MUST treat events as immutable
regardless.

## Tested behavior

| ID | Behavior |
|----|----------|
| LE-1 | `timestamp` is a valid ISO-8601 string on every emitted event |
| LE-2 | `level` matches the logger method called |
| LE-3 | `attributes` is always an object, never undefined |
| LE-4 | `context` always contains the merged result per the merge algorithm |
| LE-5 | Sanitization rules table above is honored |
| LE-6 | `error` is populated only when an error value is passed |
| LE-7 | Per-call `attributes` keys do not mutate `context.attributes` |
| LE-8 | Sensitive keys in `attributes`, `context.attributes`, `message`, and `error.*` are masked per `contracts/redaction.md` |
| LE-9 | URL-shaped string values are query/fragment-scrubbed per `scrubUrl` defaults |
| LE-10 | Control characters in every string value are escaped before reaching transports |
| LE-11 | A consumer cannot supply `timestamp` (input ignored, package always assigns) |
