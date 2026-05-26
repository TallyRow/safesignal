# Contract: LogEvent

## Shape

```ts
interface LogEvent {
  timestamp: string;          // ISO-8601, package-assigned
  level: LogLevel;            // 'debug' | 'info' | 'warn' | 'error'
  message: string;            // consumer-provided, required
  attributes: Attributes;     // per-call structured fields, always present
  context: LogContext;        // merged context (app, module, env, correlation)
  error?: ErrorInfo;          // only present from logger.error(msg, attrs, err)
}

interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
}
```

## Sanitization rules

The pipeline normalizes `attributes` before redaction. Rules apply recursively.

| Input type                          | Output |
|-------------------------------------|--------|
| `string`                            | kept as-is, truncated to 8192 chars if longer |
| `number` (finite)                   | kept as-is |
| `number` (`NaN`, `Infinity`)        | replaced with `null` |
| `bigint`                            | replaced with `String(value)` |
| `boolean`                           | kept as-is |
| `null` / `undefined`                | `null` (undefined keys dropped at top level) |
| `Date`                              | replaced with `value.toISOString()` |
| `Error`                             | replaced with `{ name, message, stack? }` |
| `Array<AttributeValue>`             | recursed |
| Plain object (`{}.constructor`)     | recursed |
| Class instance / function / symbol  | replaced with `"[Unserializable]"` |
| Cyclic reference                    | replaced with `"[Circular]"` |
| Object/array depth > 8              | replaced with `"[MaxDepth]"` |

The same rules apply to `context.attributes`.

## Required fields

| Field       | Required | Source |
|-------------|----------|--------|
| `timestamp` | yes      | assigned by `EventBuilder` |
| `level`     | yes      | from the called method (`debug` / `info` / `warn` / `error`) |
| `message`   | yes      | consumer-provided; empty string allowed |
| `attributes`| yes      | always an object, may be `{}` |
| `context`   | yes      | merged from config + logger chain + correlation |

## Optional fields

| Field   | Source |
|---------|--------|
| `error` | populated when `logger.error(message, attributes, error)` is called with a third arg |

## Immutability

Events are frozen with `Object.freeze` before reaching transports in
development builds (NODE_ENV !== 'production'). Production builds skip the
freeze for performance. Transports MUST treat events as immutable regardless.

## Tested behavior

| ID | Behavior |
|----|----------|
| LE-1 | `timestamp` is a valid ISO-8601 string on every emitted event |
| LE-2 | `level` matches the logger method called |
| LE-3 | `attributes` is always an object, never undefined |
| LE-4 | `context` always contains the merged result per the merge algorithm |
| LE-5 | Sanitization rules table above is honored |
| LE-6 | `error` is populated only when an error value is passed |
| LE-7 | Per-call attribute keys override context.attributes keys of the same name in the consumer's view of `attributes`, but `context.attributes` is not mutated |
