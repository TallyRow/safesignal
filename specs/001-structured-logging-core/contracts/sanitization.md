# Contract: Sanitization

The sanitizer normalizes arbitrary consumer input into a bounded, predictable
`AttributeValue` tree before the redactor or any backend sees it. It is the
package's primary defense against accidental dumping of large or unsafe
objects and against side-effectful getters.

## Where the sanitizer runs

In the pipeline order:

```
EventBuilder → LevelFilter → Sanitizer → URLScrubber → Redactor →
ControlCharGuard → Freeze(dev) → Dispatcher
```

Sanitizer runs **before** the URL scrubber, the redactor, and any backend
or transport. Sanitizer **never throws** — every branch has a defined
fallback.

## Input → Output table

| Input                                              | Output |
|----------------------------------------------------|--------|
| `string` ≤ `maxStringLength`                       | kept |
| `string` > `maxStringLength`                       | truncated to `maxStringLength`, suffixed `"...[truncated]"` |
| finite `number`                                    | kept |
| `NaN` / `Infinity` / `-Infinity`                   | `null` |
| `bigint`                                           | `String(value)` |
| `boolean`                                          | kept |
| `null`                                             | kept |
| `undefined` (at top-level keys)                    | key dropped |
| `undefined` (inside arrays)                        | `null` |
| `Date`                                             | `value.toISOString()` |
| `Error` (any Error subclass)                       | `{ name: value.name, message: value.message, stack: value.stack? }` (recursed for length / control chars) |
| `Array`                                            | recursed; truncated to first `maxArrayLength` elements, with a final element `"[Truncated: <N> elements omitted]"` if needed |
| plain object (`Object.prototype` or `null` proto)  | recursed |
| Class instance                                     | `"[<ConstructorName>]"` — NOT recursed; getters NOT invoked |
| DOM node (`Element`, `Document`, `Window`, etc.)   | `"[<TagName>]"` — NOT recursed |
| Framework object (`Event`, `Promise`, `Map`, `Set`, `WeakMap`, `WeakSet`, `Request`, `Response`, `Blob`, `FormData`, `URL`) | `"[<TypeTag>]"` — NOT recursed |
| Function                                           | `"[Function]"` |
| Symbol                                             | `"[Symbol]"` |
| Cyclic reference                                   | `"[Circular]"` |
| Depth > `maxDepth`                                 | `"[MaxDepth]"` |
| > `maxAttributeCount` total keys (cumulative across whole event) | excess keys replaced with one `"[Truncated: <N> keys omitted]"` marker |

## Bounds

Configured via `LoggerConfig.sanitizerLimits` (see `logger-config.md`):

| Limit                  | Default | Min | Max |
|------------------------|---------|-----|-----|
| `maxDepth`             | 8       | 1   | 16 |
| `maxStringLength`      | 8192    | 64  | 65536 |
| `maxArrayLength`       | 1000    | 1   | 10000 |
| `maxAttributeCount`    | 256     | 1   | 4096 |

Values above Max clamp to Max with an `onInternalError` notice; below Min
clamps to Min similarly. Consumers cannot disable bounds.

## Type-tag detection

The sanitizer determines a value's "type tag" using a conservative
sequence (first match wins):

1. `Array.isArray(value)` → array
2. `value === null` → null
3. `typeof value === 'function'` → `"[Function]"`
4. `typeof value === 'symbol'` → `"[Symbol]"`
5. `typeof value === 'bigint'` → `String(value)`
6. `value instanceof Date` → ISO string
7. `value instanceof Error` → `ErrorInfo`
8. **DOM check (browser-only)**:
   - `value instanceof Element` → `"[Element:<tagName>]"`
   - `value instanceof Document` → `"[Document]"`
   - `value instanceof Window` → `"[Window]"`
   - `value instanceof Node` → `"[Node]"`
9. **Framework check**:
   - `value instanceof Event` → `"[Event:<type>]"`
   - `value instanceof Promise` → `"[Promise]"`
   - `value instanceof Map` / `Set` / `WeakMap` / `WeakSet` → `"[Map]"` etc.
   - `value instanceof Request` / `Response` / `Blob` / `FormData` / `URL` →
     `"[<TypeTag>]"`
10. Plain object (proto is `Object.prototype` or `null`) → recurse
11. Anything else with a non-Object prototype (class instance) →
    `"[<ConstructorName>]"`

The DOM and framework instanceof checks are guarded with `typeof X !==
'undefined'` so SSR-style bundling does not crash.

## Critical security property

Class instances and framework objects are **type-tagged, not recursed**.
This is intentional: it prevents the sanitizer from invoking
side-effectful getters (e.g., a `password` getter on a domain object) and
prevents the sanitizer from pulling massive object graphs (e.g., a React
fiber tree) into the event.

A consumer who genuinely wants to log fields from a class instance MUST
extract them explicitly into a plain object first:

```ts
logger.info("order placed", {
  orderId: order.id,
  total:   order.total,
});
// NOT: logger.info("order placed", { order })
```

Documentation calls this out as the recommended pattern.

## Tested behavior

| ID | Behavior |
|----|----------|
| S-1 | Every row of the input/output table produces the documented output |
| S-2 | The sanitizer never throws on any input |
| S-3 | Class instances are type-tagged, not recursed; getters not invoked |
| S-4 | DOM nodes are type-tagged, not recursed |
| S-5 | Cyclic references produce `"[Circular]"` and do not loop |
| S-6 | Depth limit produces `"[MaxDepth]"` at the documented boundary |
| S-7 | Array length limit produces the documented truncation marker |
| S-8 | Attribute count limit produces the documented truncation marker |
| S-9 | String length limit truncates with `"...[truncated]"` suffix |
| S-10 | `sanitizerLimits` outside Min..Max clamps and emits one `onInternalError` |

## Amendment — 2026-06-10 (Feature 023: deep error serialization)

When `LoggerConfig.serializeErrors` is enabled (off by default), the
**error payload** (`event.error`) may additionally carry `causes`,
`members`, and `fields` per
`specs/023-error-serialization-depth/contracts/error-serialization.md`.
Sanitizer coverage for that data (ES-9):

- Every nested node's `name` and `message` is bounded by `maxStringLength`
  (same truncation suffix as S-9).
- Every `fields` object passes through the attribute-value sanitizer:
  depth-bounded (S-6), array-bounded (S-7), string-bounded (S-9),
  type-tagged for class instances (S-3), cycle-safe (S-5), and counted
  toward `maxAttributeCount` (S-8).

**Unchanged**: the S-3 rule that an `Error` instance encountered **inside
attributes** is reduced to `{ name, message, stack? }` and never recursed
into its own properties. Deep capture reads the raw error only at event
construction (event-builder), never in this sanitizer.
