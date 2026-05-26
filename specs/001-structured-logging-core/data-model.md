# Phase 1 Data Model: Core Structured Logging API

This document defines the canonical entities that flow through the package
pipeline. Field names here are the names used in the package's public TypeScript
types and in the runtime objects passed between layers. They are stable and form
part of the consumer contract.

---

## Entity: `LogLevel`

A string union, in increasing severity order:

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

Ordering (used for filtering):

| Level   | Numeric (internal only) |
|---------|--------------------------|
| `debug` | 10 |
| `info`  | 20 |
| `warn`  | 30 |
| `error` | 40 |

Internal numeric values are not exported.

---

## Entity: `LogEvent`

The canonical record produced by the pipeline and passed to every transport.

```ts
interface LogEvent {
  /** ISO-8601 string. Assigned by the pipeline. */
  timestamp: string;

  /** Severity level. */
  level: LogLevel;

  /** Human-readable message. Required. May be empty string. */
  message: string;

  /** Per-call structured attributes. Always present, may be empty. */
  attributes: Attributes;

  /** Merged context (app, module, env, correlation). Always present. */
  context: LogContext;

  /**
   * Optional captured error info. Populated only by `logger.error(msg, attrs, err)`.
   * Contains `name`, `message`, and `stack` if available. Never the raw Error.
   */
  error?: ErrorInfo;
}

type Attributes = Record<string, AttributeValue>;

type AttributeValue =
  | string
  | number
  | boolean
  | null
  | AttributeValue[]
  | { [key: string]: AttributeValue };

interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
}
```

### Field rules

- `timestamp` is assigned by `EventBuilder` using `new Date().toISOString()`.
  Never accepted from consumer input.
- `attributes` is always an object (never undefined). Non-serializable values
  (functions, symbols, class instances other than `Date`/`Error`, circular
  references) are coerced to `"[Unserializable]"` or removed; rules documented in
  `contracts/log-event.md`.
- Maximum attribute object depth: 8. Deeper branches are replaced with
  `"[MaxDepth]"`.
- Maximum string value length: 8192 chars. Longer values are truncated and
  suffixed with `"...[truncated]"`.
- `error` is built from any `unknown` value passed to `logger.error()`; non-Error
  inputs are coerced to `{ name: 'NonError', message: String(input) }`.

### Validation

Validation is internal-only and never throws. Invalid values are sanitized or
dropped. The pipeline emits a `LogEvent` for every accepted call (subject to
level filtering and redaction).

---

## Entity: `LogContext`

Merged context attached to every emitted `LogEvent`.

```ts
interface LogContext {
  application?: AppIdentity;
  module?: ModuleIdentity;
  environment?: string;        // 'production' | 'development' | 'test' | string
  attributes?: Attributes;     // free-form correlation slot (e.g., traceId, route)
}

interface AppIdentity {
  name: string;
  version?: string;
}

interface ModuleIdentity {
  name: string;
  version?: string;
}
```

### Merge algorithm (deterministic, tested)

Given sources in this precedence order (later wins):

1. `configureLogging({ context })` (root static context)
2. `createLogger({ context })` (per-logger context)
3. `logger.child(context)` / `logger.withContext(context)` (chain context)
4. `correlation()` return value (per-emit dynamic)

Merge is **shallow per top-level key**, **deep-merged** for the nested
`attributes` map:

- `application`, `module`, `environment` are replaced wholesale by later
  sources if defined.
- `attributes` from each source is shallow-merged key-by-key.

The per-call `attributes` argument to `logger.info(message, attributes)` is
**not** part of `LogContext`; it lives on `LogEvent.attributes` and is kept
separate so context can be inspected independently in transports.

---

## Entity: `LoggerConfig`

Top-level configuration passed once via `configureLogging()` or per-logger via
`createLogger()` (where per-logger options layer on top of the root config).

```ts
interface LoggerConfig {
  application?: AppIdentity;
  module?: ModuleIdentity;
  environment?: string;
  level?: LogLevel | LevelMap;
  context?: Partial<LogContext>;
  correlation?: () => Partial<LogContext>;
  transports?: Array<Transport | TransportFactory>;
  redactor?: Redactor;
  onInternalError?: (err: Error) => void;
}

type LevelMap = Partial<Record<'production' | 'development' | 'test', LogLevel>>;

interface CreateLoggerOptions {
  name?: string;                       // optional logger name (free string)
  module?: ModuleIdentity;             // override for this logger only
  context?: Partial<LogContext>;       // additional context for this logger
  level?: LogLevel;                    // per-logger level override
}
```

### Default resolution

| Field             | If unset                                              |
|-------------------|-------------------------------------------------------|
| `application`     | `undefined` (allowed)                                 |
| `module`          | `undefined` (allowed)                                 |
| `environment`     | `undefined` → treated as "unknown" → defaults to `warn` |
| `level`           | env-aware default table (see plan §Configuration)     |
| `context`         | `{}`                                                  |
| `correlation`     | `undefined` (skipped on emit)                         |
| `transports`      | `[NoopTransport()]`                                   |
| `redactor`        | `createRedactor()` (built-in default)                 |
| `onInternalError` | `undefined` (silent)                                  |

---

## Entity: `Transport`

```ts
interface Transport {
  /** Stable identifier for diagnostics. */
  name: string;

  /** Receive a finished LogEvent. May be sync or async. Errors are isolated. */
  send(event: LogEvent): void | Promise<void>;

  /** Optional flush hook for batching transports. */
  flush?(): Promise<void>;

  /** Optional shutdown hook. */
  shutdown?(): Promise<void>;
}

type TransportFactory = () => Transport;
```

### Contract notes

- The consumer's `send()` MUST NOT throw to break the caller. If it does, the
  package's `SafeTransport` wrapper catches and reports via `onInternalError`.
- A transport MUST treat the received `LogEvent` as immutable. The package
  freezes events with `Object.freeze` before dispatch in development builds
  (a no-op in production builds).

---

## Entity: `Redactor`

```ts
type Redactor = (event: LogEvent) => LogEvent | null;
```

- Receives the **post-merge, pre-dispatch** `LogEvent`.
- Returns a transformed event, or `null` to drop the event entirely.
- Must be synchronous.
- If it throws, the event is dropped (fail-closed) and `onInternalError` is
  invoked.

### Built-in `createRedactor(rules?)`

```ts
interface RedactionRule {
  /** Case-insensitive key match anywhere in attributes/context attributes. */
  key: string | RegExp;
  /** Replacement string. Default: '[REDACTED]'. */
  replacement?: string;
}

function createRedactor(rules?: RedactionRule[]): Redactor;
```

Default rules (used when `rules` is omitted):

```ts
const DEFAULT_RULES: RedactionRule[] = [
  { key: /^password$|^passwd$/i },
  { key: /^token$|access[_-]?token|refresh[_-]?token/i },
  { key: /^authorization$|^auth$/i },
  { key: /^cookie$|^set-cookie$/i },
  { key: /^secret$/i },
  { key: /api[_-]?key/i },
  { key: /session[_-]?id/i },
  { key: /^ssn$/i },
  { key: /credit[_-]?card|^cardNumber$|^cvv$/i },
];
```

---

## Entity: `Logger` (consumer-facing)

```ts
interface Logger {
  debug(message: string, attributes?: Attributes): void;
  info(message: string, attributes?: Attributes): void;
  warn(message: string, attributes?: Attributes): void;
  error(message: string, attributes?: Attributes, error?: unknown): void;

  child(context: Partial<LogContext>): Logger;
  withContext(context: Partial<LogContext>): Logger;
}
```

### Behavior

- Each call returns synchronously and never throws.
- A call that fails the level filter is a no-op (and skips redaction and
  dispatch).
- `child()` and `withContext()` return a new `Logger` instance whose context is
  layered over the parent's. Parents are unaffected. Aliases.

---

## Internal-only entity: `TelemetryBackend`

Not exported. Lives at `src/internal/telemetry/backend.ts`.

```ts
interface TelemetryBackend {
  init(config: NormalizedConfig): void;
  handle(event: LogEvent): void;
  shutdown(): Promise<void>;
}
```

Implementations: `OtelLogsBackend` (default), `NoopBackend` (fallback). The
pipeline never knows which is active. Failures inside `handle()` cause the
dispatcher to fall back to direct transport delivery for that event.

---

## State transitions

The package has very little runtime state. The lifecycle is:

```text
[unconfigured]
   │ configureLogging(config)
   ▼
[configuring] ── backend.init() fails ──▶ [configured-with-noop-backend]
   │ backend.init() ok
   ▼
[configured]
   │ each emission ─▶ pipeline ─▶ backend.handle() ─▶ transports
   │
   │ configureLogging(newConfig)   (allowed; reconfigures atomically)
   ▼
[configured]
   │ shutdown() (optional)
   ▼
[shut-down]   (further emissions become noops; transports flushed)
```

Reconfiguration is allowed and atomic at the module level: it shuts down the
previous backend, installs the new config, and initializes the new backend. In
flight `Promise<void>` from a previous `send()` is left to its own resolution.

---

## Relationships

```text
LoggerConfig ──┐
               ├── (normalized at configureLogging)
Logger ───────┴── EventBuilder ── LogEvent ── LevelFilter ── Redactor ── Dispatcher
                                                                            │
                                                                            ▼
                                                                    TelemetryBackend
                                                                            │
                                                                            ▼
                                                                   SafeTransport[]
                                                                            │
                                                                            ▼
                                                                      Transport[]
```

All public types are stable and form the consumer contract. All internal types
may evolve without a public version bump.
