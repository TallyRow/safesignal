# Phase 1 Data Model: Core Structured Logging API

This document defines the canonical entities that flow through the package
pipeline. Field names here are the names used in the package's public
TypeScript types and in the runtime objects passed between layers. They are
stable and form part of the consumer contract.

---

## Entity: `LogLevel`

A string union, in increasing severity order:

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

Internal numeric values (not exported):

| Level   | Numeric |
|---------|---------|
| `debug` | 10 |
| `info`  | 20 |
| `warn`  | 30 |
| `error` | 40 |

---

## Entity: `AttributeValue` and `Attributes`

```ts
type AttributeValue =
  | string
  | number
  | boolean
  | null
  | AttributeValue[]
  | { [key: string]: AttributeValue };

type Attributes = Record<string, AttributeValue>;
```

The recursive `AttributeValue` union deliberately **excludes** `unknown`,
`object`, and class instances at the type level. TypeScript cannot fully
prevent a consumer from passing a `Date`, `Error`, or class instance, but the
sanitizer normalizes those before they reach the redactor or any transport.

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

  /** Per-call structured attributes. Always present, may be empty. Sanitized + redacted. */
  attributes: Attributes;

  /** Merged context. Always present. Sanitized + redacted. */
  context: LogContext;

  /**
   * Optional captured error info. Populated only by `logger.error(msg, attrs, err)`.
   * Sanitized + redacted. Never the raw Error instance.
   */
  error?: ErrorInfo;
}

interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
}
```

### Field rules

- `timestamp` is assigned by `EventBuilder` using `new Date().toISOString()`.
  Never accepted from consumer input.
- `attributes` and `context` are run through the sanitizer (depth, size,
  count, type-tagging) and then the redactor (key + shape matching) before
  being attached. They are always plain `AttributeValue` trees.
- `message` is treated as a single string field. It is sanitized for length
  (truncated to 8192 chars), then run through the redactor (which may mask
  shape-based matches like JWTs inside the string), then control-char
  escaped.
- `error` is built from any `unknown` value passed to `logger.error()`.
  Non-Error inputs are coerced to `{ name: 'NonError', message: String(input) }`.
  The stack string is also sanitized for length and control-char-escaped.

### Bounds (locked by `contracts/sanitization.md`)

| Bound                                | Default | Min | Max |
|--------------------------------------|---------|-----|-----|
| `maxDepth`                           | 8       | 1   | 16  |
| `maxStringLength` (chars)            | 8192    | 64  | 65536 |
| `maxArrayLength`                     | 1000    | 1   | 10000 |
| `maxAttributeCount` (total leaf+intermediate keys) | 256 | 1 | 4096 |

Consumers may tighten via `LoggerConfig.sanitizerLimits`. Attempts to raise
above the max clamp to the max and emit one `onInternalError`.

### Validation

Validation is internal-only and never throws. Invalid values are sanitized or
dropped. The pipeline produces a `LogEvent` for every accepted call (subject
to level filtering and redaction).

---

## Entity: `LogContext`

Merged context attached to every emitted `LogEvent`.

```ts
interface LogContext {
  application?: AppIdentity;
  module?: ModuleIdentity;
  environment?: string;
  attributes?: Attributes;
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

Sources in this precedence order (later wins):

1. `configureLogging({ context })`
2. `createLogger({ context })`
3. `logger.child(context)` / `logger.withContext(context)`
4. `correlation()` return value

Merge is shallow per top-level key (`application`, `module`, `environment`),
deep-merged for `attributes`.

The per-call `attributes` argument is **not** part of `LogContext`; it lives
on `LogEvent.attributes` and is kept separate so transports can inspect
context independently.

---

## Entity: `LoggerConfig`

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
  sanitizerLimits?: Partial<SanitizerLimits>;
  onInternalError?: (err: Error) => void;
}

type LevelMap = Partial<Record<'production' | 'development' | 'test', LogLevel>>;

interface SanitizerLimits {
  maxDepth: number;
  maxStringLength: number;
  maxArrayLength: number;
  maxAttributeCount: number;
}

interface CreateLoggerOptions {
  name?: string;
  module?: ModuleIdentity;
  context?: Partial<LogContext>;
  level?: LogLevel;
}
```

### Default resolution

| Field               | If unset |
|---------------------|----------|
| `application`       | `undefined` (allowed) |
| `module`            | `undefined` (allowed) |
| `environment`       | `undefined` → treated as "unknown" → defaults to `warn` |
| `level`             | env-aware default table |
| `context`           | `{}` |
| `correlation`       | `undefined` (skipped on emit) |
| `transports`        | `[NoopTransport()]` |
| `redactor`          | `createRedactor()` (built-in default) |
| `sanitizerLimits`   | documented defaults |
| `onInternalError`   | `undefined` (silent) |

---

## Entity: `Transport`

```ts
interface Transport {
  name: string;
  send(event: LogEvent): void | Promise<void>;
  flush?(): Promise<void>;
  shutdown?(): Promise<void>;
}

type TransportFactory = () => Transport;
```

### Contract notes

- Consumer `send()` MUST NOT throw to break the caller. `SafeTransport`
  catches anyway.
- Transports MUST treat received `LogEvent` as immutable; dev builds freeze.
- Transports MUST NOT place `LogEvent` data in URL paths, query strings, or
  fragments (see `contracts/transport.md`).

---

## Entity: `Redactor`

```ts
type Redactor = (event: LogEvent) => LogEvent | null;
```

- Receives the **post-sanitize, pre-control-char-guard** `LogEvent`.
- Returns transformed event, or `null` to drop entirely.
- Must be synchronous.
- If it throws, the event is dropped (fail-closed) and `onInternalError` is
  invoked.

### Built-in `createRedactor(rules?)`

```ts
interface RedactionRule {
  /** Case-insensitive key match anywhere in the event tree. */
  key?: string | RegExp;
  /** Value-shape match (applied regardless of key name). */
  shape?: RegExp;
  /** Replacement string. Default: '[REDACTED]'. */
  replacement?: string;
}

function createRedactor(rules?: RedactionRule[]): Redactor;
```

Default rules listed in `contracts/redaction.md`.

---

## Entity: `ScrubUrlOptions`

```ts
interface ScrubUrlOptions {
  /** Additional query-param names to scrub (case-insensitive). */
  extraParams?: ReadonlyArray<string | RegExp>;
  /** Whether to also scrub the URL fragment. Default: true. */
  fragment?: boolean;
}

function scrubUrl(url: string, options?: ScrubUrlOptions): string;
```

Returns the input unchanged if it does not parse as an http(s) URL. Otherwise
returns the URL with matching query and (optionally) fragment params replaced
by `<name>=[REDACTED]`.

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
- A call failing the level filter is a no-op (skips sanitize, redact, dispatch).
- `child()` and `withContext()` return a new `Logger` instance with context
  layered over the parent's; parents are unaffected. Aliases.
- `message` is always `string` — no other shape is accepted at the type level.
- `error` is the only `unknown` parameter; the pipeline reduces it
  immediately to `ErrorInfo`.

---

## Internal-only entity: `TelemetryBackend`

Not exported. Lives at `src/internal/telemetry/backend.ts`. **Status (per
plan.md "Vendor-Neutral Core Architecture"): future-adapter seam.** The v1
default core does not require a vendor backend; the dispatcher will fan out
events directly to the wrapped transports stored on `ConfiguredRuntime`
once T066 lands. Until T066, `src/api/logger.ts` maintains a transitional
companion slot that constructs an internal backend instance and passes it
to the dispatcher.

```ts
interface TelemetryBackend {
  init(config: NormalizedConfig): void;
  handle(event: LogEvent): void;
  shutdown(): Promise<void>;
}
```

Implementations under `src/internal/telemetry/`: `NoopBackend` and (as
documented future-adapter seam code) `OtelLogsBackend`. Neither is part
of the v1 public surface; both compile and have unit-test coverage so a
future vendor-adapter feature spec can land cleanly.

---

## Internal-only entity: `ConfiguredRuntime`

Not exported. Lives at `src/runtime/configured-runtime.ts`. The shared
package-level runtime resource produced by `configureLogging()`. Per
constitution v1.2.0 Principle VII and FR-029 / FR-030, every `Logger`
handle reads through this record at emit time — handles are cheap,
side-effect-free context objects; expensive state lives once here and
is shared across every logger derived from a single
`configureLogging()` invocation.

```ts
interface ConfiguredRuntime {
  readonly config: NormalizedConfig;
  readonly transports: ReadonlyArray<Transport>;   // SafeTransport-wrapped
  readonly redactor: Redactor | undefined;
  readonly sanitizerLimits: SanitizerLimits;
  readonly onInternalError: (err: Error) => void;
  readonly correlation: (() => Partial<LogContext>) | undefined;
}
```

**No `backend` field.** Per plan.md "Vendor-Neutral Core Architecture",
the dispatcher will fan events out directly to `transports`. The
TelemetryBackend instance the dispatcher still consumes in v1 (until
T066) lives in a separate transitional slot in `src/api/logger.ts`,
not on this record.

Constructed by `buildConfiguredRuntime(config: LoggerConfig)`:
normalizes the config (clamps sanitizer limits, resolves env-default
level), wraps every consumer transport in `SafeTransport`, and auto-
installs a single `NoopTransport()` when `transports` is empty (per
the documented `no_transport_configured` fallback in
`contracts/failure-safety.md`).

Torn down by `shutdownRuntime(runtime)` — calls `flush()` then
`shutdown()` on each transport, each isolated in its own try/catch.

---

## Internal-only entity: Active-runtime slot (`runtime-ref`)

Not exported. Lives at `src/runtime/runtime-ref.ts`. A module-scoped
`let active: ConfiguredRuntime | undefined` — the single source of
truth for "which `ConfiguredRuntime` is currently active in this loaded
copy of the package."

API:

```ts
function getActiveRuntime(): ConfiguredRuntime | undefined;
function installRuntime(runtime: ConfiguredRuntime): ConfiguredRuntime | undefined; // returns previous
function clearActiveRuntimeForTests(): void;                                          // test-only
```

The slot is the mechanism that makes FR-031 ("retained `Logger`
references continue to use the documented active runtime after
configuration changes") work: `emit()` reads through
`getActiveRuntime()` every time, never caches the runtime in the
logger handle.

Storage is **module-scoped only** — no `globalThis`, no `window`/
`self`/`document` writes, no `Symbol.for(...)` registry. This is the
load-bearing property for the duplicate-package-copy isolation
classification documented in FR-033 (see below).

---

## Federated entity: Package/Runtime Boundary

Not a TypeScript type — a documented architectural concept. A
*package/runtime boundary* is the scope within which a single active-
runtime slot is authoritative. Normally this corresponds to one
physical copy of this package on a page: one `let active`, one
`backendSlot` companion, one set of derived logger handles all
sharing those references.

In federated/module-federation deployments where multiple bundlers
contribute copies of this package to a single page, each physical
copy ships its own `active` slot — they do not cross-route events.
Per FR-033 the duplicate-package-copy behavior is classified as
**isolated**: configuring one copy does not affect another; loggers
from one copy cannot deliver to another copy's transports.

Cross-copy sharing is a build-time concern: consumers configure
their bundler's module-federation `shared` map (Webpack 5: `shared:
{ '@your-org/frontend-logging-sdk': { singleton: true } }`) to
collapse the duplicates back to a single copy. The package provides
no runtime back door for cross-copy sharing — that would couple
every page that loads two copies of the package implicitly.

The T064 integration test (`tests/integration/duplicate-copy-
isolation.integration.test.ts`, landing later in Phase 7) locks the
isolated classification end-to-end.

### Relationships across the boundary

```text
[physical package copy A]               [physical package copy B]
┌────────────────────────────┐          ┌────────────────────────────┐
│ runtime-ref.ts             │          │ runtime-ref.ts             │
│   let active: A's runtime  │          │   let active: B's runtime  │
│   configureLogging() ──┐   │          │   configureLogging() ──┐   │
│                        ▼   │          │                        ▼   │
│ ConfiguredRuntime A        │          │ ConfiguredRuntime B        │
│   transports: [SafeT(...)] │          │   transports: [SafeT(...)] │
│                        ▲   │          │                        ▲   │
│ Logger handles ────────┘   │          │ Logger handles ────────┘   │
│   (read via                │          │   (read via                │
│    getActiveRuntime())     │          │    getActiveRuntime())     │
└────────────────────────────┘          └────────────────────────────┘
       │                                       │
       └─── never cross-route ─────────────────┘
                (no globalThis / Symbol.for bridge)
```

---

## State transitions

```text
[unconfigured]
   │ configureLogging(config)
   ▼
[configuring] ── backend.init() fails ──▶ [configured-with-noop-backend]
   │ backend.init() ok
   ▼
[configured]
   │ each emission ─▶ pipeline (sanitize, redact, guard) ─▶ backend.handle() ─▶ transports
   │
   │ configureLogging(newConfig)   (reconfigures atomically)
   ▼
[configured]
   │ shutdown() (optional)
   ▼
[shut-down]   (further emissions noop; transports flushed)
```

Reconfiguration is atomic at the module level: previous backend shut down,
new config installed, new backend initialized.

---

## Relationships

```text
LoggerConfig ──┐
               ├── (normalized at configureLogging — includes sanitizer-limit clamp)
Logger ───────┴── EventBuilder ── LogEvent
                  │
                  ▼
              LevelFilter ── Sanitizer ── URLScrubber ── Redactor ── ControlCharGuard ── Freeze(dev) ── Dispatcher
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

All public types are stable and form the consumer contract. Internal types
may evolve without a public version bump.
