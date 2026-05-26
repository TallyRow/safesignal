# Implementation Plan: Core Structured Logging API

**Branch**: `001-structured-logging-core` | **Date**: 2026-05-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-structured-logging-core/spec.md`

**Constitution**: `.specify/memory/constitution.md` v1.1.0

## Summary

Deliver a browser-first, framework-neutral, reusable frontend logging package that
exposes a small stable public API (`Logger`, levels, structured events, context,
transport) while using OpenTelemetry JavaScript **only as an internal implementation
detail**. Consumers never see OpenTelemetry types or concepts. Secure logging and
sensitive-data minimization are **first-class architectural concerns**, not
afterthoughts: every emission flows through `Sanitize → Redact → Freeze` before any
transport or backend sees it, and the default configuration refuses to dump
arbitrary application state. The package degrades safely on every failure
(transport, redaction, serialization, backend init) and preserves a stable
contract so application-owned ingestion and future vendor backends can be added
without consumer call-site changes.

## Technical Context

**Language/Version**: TypeScript 5.4+ targeting ES2020 with DOM lib; strict mode on.

**Primary Dependencies**:
- Runtime (internal only): `@opentelemetry/api-logs` (experimental Logs API),
  `@opentelemetry/sdk-logs` (experimental SDK), `@opentelemetry/api` for context.
  Pinned to caret-locked minor versions and isolated behind an internal adapter.
- Build: `tsup` (ESM + CJS dual output, browser target, no Node built-ins).
- Test: `vitest` with `@vitest/coverage-v8`, `happy-dom` (browser-like env).

**Storage**: None. Package is in-memory only. Transports may buffer in memory but
the package MUST NOT persist to IndexedDB, localStorage, sessionStorage, or
cookies in v1.

**Testing**: Vitest contract tests (public API, transport contract, log event,
redaction, failure-safety, security), unit tests (pipeline, sanitization,
redaction, level filter, OTel adapter, URL scrubber), integration tests
(host/module reuse, failure isolation, env-aware defaults, end-to-end secret
fixture sweep).

**Target Platform**: Modern evergreen browsers (Chromium, Firefox, Safari, Edge —
last 2 versions). Must build and import safely under SSR-style bundling (no
`window` at module top level). Federated/module-federation friendly: no global
singletons that break when loaded multiple times.

**Project Type**: Reusable frontend package/library (single npm-publishable
package in this repo).

**Performance Goals**:
- Log emission call cost bounded to a synchronous level check + sanitize + redact
  + dispatch. Transport work is fire-and-forget; the package itself does no
  batching in v1.
- No `Sync XHR`, no blocking work, no `console.*` on hot paths unless an explicit
  `ConsoleTransport` is configured.
- Cold-load cost of the package ≤ ~15 KB minified+gzipped for the core path
  excluding the optional OTel backend.

**Constraints**:
- Browser-safe: no Node-only APIs, no top-level `window` access, no eager DOM
  access.
- Secure by default: defaults MUST NOT expose secrets, credentials, tokens,
  session IDs, authorization headers, cookies, or URL query secrets. The "easy
  path" must be the safe path.
- Sanitization and redaction MUST be enforced **inside** the package, **before**
  any transport or backend sees an event. Transports cannot opt out.
- Transport failure tolerant: a throwing transport MUST NOT propagate to the
  caller and MUST NOT crash subsequent emissions. Redaction failure → drop
  event (fail-closed).
- Public API MUST NOT expose any OpenTelemetry types, names, or concepts.
- The package MUST NOT read `process.env`, `import.meta.env`, `location`,
  `document.cookie`, or any other ambient browser state without explicit
  consumer opt-in.

**Scale/Scope**: One reusable package consumed by multiple host apps and
independently deployed federated modules. Designed for many `Logger` instances
per page (one per module is normal).

## Constitution Check

*GATE: Passes against constitution v1.1.0. Re-checked post-design (see end of
plan).*

- **API Stability**:
  - Public surface introduced: `createLogger()`, `configureLogging()`,
    `getRootLogger()`, `Logger` interface (`debug|info|warn|error|child|withContext`),
    `LogLevel` union, `LogEvent` type, `LogContext` type, `Attributes` /
    `AttributeValue` types, `LoggerConfig` type, `Transport` / `TransportFactory`
    interfaces, built-in `ConsoleTransport`, `NoopTransport`, `createRedactor()`
    factory, `scrubUrl()` helper. All other modules are internal and not
    re-exported.
  - Safe path is the easy path: `Attributes` is a constrained union (no
    `unknown`); `logger.error(msg, attrs, err?)` accepts `unknown` for the error
    arg only and immediately reduces it to `{name, message, stack?}`. No
    `logger.dump(obj)` style API exists. `attributes` is optional in every
    method.
  - Compatibility: additive (new package, no prior consumers).
- **Browser Resilience & Failure Safety**:
  - Every consumer-provided callable (transport `send`, transport `flush`,
    `correlation()`, `redactor`, `onInternalError`) is wrapped by an internal
    try/catch boundary. No sync throw or rejected `Promise` from these can reach
    a consumer call site.
  - Redaction is **fail-closed**: if the redactor throws, the event is dropped
    and `onInternalError` is invoked. The package never emits unredacted data
    when redaction failed.
  - Serialization is fail-soft (unserializable values become `"[Unserializable]"`,
    cyclic refs become `"[Circular]"`, oversized values are truncated) — sanitize
    can never throw.
  - Backend init failure → silent fall-back to `NoopBackend`, which still
    forwards events to transports.
- **Neutrality & Portability**:
  - No framework, bundler, or backend assumed. No app-specific identifiers.
  - Host and federated modules use the same `createLogger()` contract; identity
    flows through explicit configuration, never through globals.
  - Same secure posture applies regardless of consumer.
- **Structured Observability**:
  - Structured `LogEvent` with `level`, `message`, `timestamp`, `attributes`,
    `context`, optional `error` is the canonical record. Output is **object-only**
    at the transport boundary; the package never emits a single concatenated
    newline-delimited string.
  - Bounded shape: max attribute depth 8, max string length 8192, max array
    length 1000, max total attribute count 256. All documented in
    `contracts/log-event.md`.
  - Production defaults: `warn` and `error` enabled; `debug`/`info` opt-in via
    config.
- **Secure Logging by Default & Sensitive Data Minimization**:
  - Default redactor masks values for a documented sensitive-key denylist (see
    `contracts/redaction.md`) applied recursively to `attributes`, `context`,
    and serialized `error` data.
  - Default URL sanitizer (`scrubUrl`) strips sensitive query/fragment params
    from string values that parse as URLs.
  - Sanitization happens **before** redaction; redaction happens **before** the
    backend or any transport sees the event. Transports cannot bypass either.
  - No path silently downgrades these guarantees based on environment, build
    mode, transport, or vendor integration.
- **Log Integrity & Monitoring Suitability**:
  - Events are stable, machine-parseable, attributable
    (`context.application`/`context.module`/`context.environment`/correlation
    attributes), and reach all configured transports unmutated.
  - v1 does NOT batch, sample, or deduplicate. If it later does, the behavior
    will be documented per Principle VI.
  - Transport implementation guidance (`contracts/transport.md`) tells consumer
    transports to use request body (not URL params) and HTTPS — preserving
    downstream auditability.
- **Test & Documentation Coverage**: see [Testing Strategy](#testing-strategy);
  full security test sweep (`tests/security/`) added to satisfy SC-008 / SC-009 /
  SC-010 and FR-012 through FR-021.

**Result**: PASS. No violations; Complexity Tracking left empty.

## Technical Architecture Overview

The package is a layered pipeline. Each layer has one job and a single owner
interface. Sanitization and redaction are part of the pipeline — they happen
before any backend or transport sees the event.

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Public API Layer  (src/api)                              │
│    Logger, createLogger, configureLogging, types            │
└────────────────────────────┬────────────────────────────────┘
                             │ raw user input
┌────────────────────────────▼────────────────────────────────┐
│ 2. Pipeline Layer  (src/pipeline) — security boundary       │
│    a. EventBuilder        (assemble canonical LogEvent)     │
│    b. LevelFilter         (env-aware drop-fast)             │
│    c. Sanitizer           (depth/size/type coercion;        │
│                            URL scrub; non-serializable →    │
│                            "[Unserializable]"; cyclic →     │
│                            "[Circular]"; framework/DOM      │
│                            objects → "[<TypeTag>]")         │
│    d. Redactor            (sensitive-key denylist; fail-    │
│                            closed; runs AFTER sanitize so   │
│                            nested structures are reachable) │
│    e. ControlCharGuard    (escape control chars in strings) │
│    f. Freeze (dev only)   (Object.freeze recursively)       │
│    g. Dispatcher          (call backend; catch all errors)  │
└────────────────────────────┬────────────────────────────────┘
                             │ sanitized + redacted LogEvent
┌────────────────────────────▼────────────────────────────────┐
│ 3. Telemetry Backend Adapter  (src/internal/telemetry)      │
│    TelemetryBackend interface                               │
│      - OtelLogsBackend  (default, internal)                 │
│      - NoopBackend      (fallback)                          │
└────────────────────────────┬────────────────────────────────┘
                             │ LogEvent (via internal exporter)
┌────────────────────────────▼────────────────────────────────┐
│ 4. Transport Abstraction  (src/transport)                   │
│    SafeTransport wraps any Transport                        │
│      - ConsoleTransport (built-in)                          │
│      - NoopTransport    (built-in)                          │
│      - <consumer-provided Transport>                        │
└────────────────────────────┬────────────────────────────────┘
                             │ (delivery — out of scope here)
┌────────────────────────────▼────────────────────────────────┐
│ 5. Future Application/Platform Ingestion  (out of scope v1) │
│    Implemented by consumers as a Transport. Guidance is     │
│    enforced via contracts/transport.md (POST body only;     │
│    HTTPS; no secrets in URL query/fragment).                │
└─────────────────────────────────────────────────────────────┘
```

### Layer responsibilities

1. **Public API**: stable types, factory functions, no logic beyond delegation.
2. **Pipeline**: builds the canonical `LogEvent`, applies env-aware level
   filter, **sanitizes**, **redacts**, **escapes control characters**, hands off
   to the backend. This is the security boundary — nothing downstream is allowed
   to opt out.
3. **Telemetry Backend Adapter**: hides OpenTelemetry. `OtelLogsBackend`
   translates the already-sanitized-and-redacted `LogEvent` to an OTel LogRecord,
   runs it through an OTel `LoggerProvider` whose only attached
   `LogRecordProcessor` re-emits the original `LogEvent` to configured
   `Transport`s. `NoopBackend` is a direct forwarder used when OTel init fails.
4. **Transport**: single delivery interface (`Transport.send(event)`), wrapped
   in `SafeTransport` for failure isolation. Receives only post-pipeline events.
5. **Future ingestion**: any consumer or platform team implements a `Transport`.
   No package change required.

## Security Architecture

### Pipeline ordering (security-critical, locked)

For every emission accepted by the level filter:

```text
EventBuilder → Sanitizer → Redactor → ControlCharGuard → Freeze(dev) → Dispatcher
```

This ordering is a contract, tested explicitly. The two key invariants:

1. **Sanitizer runs before Redactor.** This means deeply nested values are
   normalized into plain primitives/objects/arrays before the redactor walks
   them, so the redactor can match sensitive keys reliably regardless of how
   they arrived (e.g., a class instance carrying a `password` getter).
2. **Both run before the backend or any transport.** The OTel adapter never
   sees raw user input; transports never receive an event the redactor hasn't
   processed.

### Sanitization (`src/pipeline/sanitizer.ts`)

Sanitization normalizes arbitrary user input into a bounded, predictable shape.
It is the package's primary defense against accidental dumping of large or
unsafe objects.

Rules (full table in `contracts/log-event.md`):

| Input type                       | Output |
|----------------------------------|--------|
| `string`                         | truncated to 8192 chars, control chars escaped (in ControlCharGuard step) |
| finite `number`                  | kept |
| `NaN` / `Infinity`               | `null` |
| `bigint`                         | `String(value)` |
| `boolean` / `null`               | kept |
| `undefined`                      | dropped at top-level keys |
| `Date`                           | `value.toISOString()` |
| `Error`                          | `{ name, message, stack? }` |
| `Array<AttributeValue>`          | recursed, truncated to first 1000 elements |
| plain object                     | recursed |
| class instance / DOM node / framework object | replaced with `"[<TypeTag>]"` where `TypeTag` is e.g. `Element`, `Event`, `Promise`, `Window`, `Function`, `Map`, `Set`, or the constructor name |
| function                         | `"[Function]"` |
| symbol                           | `"[Symbol]"` |
| cyclic reference                 | `"[Circular]"` |
| depth > 8                        | `"[MaxDepth]"` |
| > 256 total attribute keys       | excess keys replaced with one `"[Truncated: <N> keys omitted]"` marker |

Sanitization **never throws**. Every branch has a defined fallback. The
sanitizer also strips known dangerous framework/runtime objects (DOM nodes,
window, document, Event, Promise, fetch Request/Response) by **tag**, never
by recursive walk — this prevents accidental traversal that could trigger
side-effectful getters or pull in massive object graphs.

### URL scrubbing (`src/pipeline/url-scrubber.ts`)

A string value that parses as an http(s) URL is run through a URL scrubber that
strips any query parameter whose name matches the redaction denylist (token,
authorization, session_id, password, api_key, etc.) and replaces it with
`<param>=[REDACTED]`. The fragment is checked the same way. Same treatment is
also exported as a public helper `scrubUrl(url: string): string` so consumers
can pre-scrub URLs they want to log intentionally.

Default behavior is conservative: if a URL's query contains any sensitive-named
param, that param's value is replaced — other params are left alone. If the
string fails URL parsing, it is treated as opaque text and the redactor still
gets a shot at masking it.

### Redaction (`src/pipeline/redactor.ts`)

The `Redactor` is `(event: LogEvent) => LogEvent | null`. The built-in
`createRedactor(rules?)` returns a redactor that walks `attributes`,
`context.attributes`, `message`, and the serialized `error` object, masking
values whose **key** matches the denylist (regardless of position in the tree),
**and** masking values whose **shape** matches a known sensitive pattern
(JWT-shaped tokens, common API-key prefixes, credit card / SSN-like digits).

If the redactor throws, the dispatcher **drops the event entirely** and invokes
`onInternalError`. There is no partial emission. This is the explicit
fail-closed contract.

Custom redactors fully replace the default unless the consumer composes them.
Custom redactors run inside the same try/catch — a buggy custom redactor cannot
crash the host app, but it can drop events. This is by design.

### Log-injection & output safety

- **No string-concatenated output path.** `LogEvent` is the only thing
  transports receive; transports decide how to render. The built-in
  `ConsoleTransport` passes the event as the *second argument* to `console[level]`,
  not interpolated into the message string. There is no public API that yields
  "one line of text" output.
- **Control character escaping.** The `ControlCharGuard` step escapes ASCII
  control characters (` `–`` except `\t`, `\n`, `\r`) and the ` `
  / ` ` line separators in every string value. This stops a user-controlled
  newline in a log message from forging an additional record in log files
  downstream.
- **Message is a discrete field.** The package never asks the consumer to embed
  values via string concatenation. The pattern is `logger.info("payment failed",
  { code })`, not `logger.info(\`payment failed: ${code}\`)`. Docs explicitly
  warn against the latter.
- **Object-mode `console.error`.** When an `error` value is captured, only
  `name`/`message`/`stack` are preserved. The original `Error` instance is not
  attached and is not enumerated.

### Transport & transmission safety

The package does NOT ship an HTTP/beacon transport in v1 — keeping the API
small and forcing applications to own their delivery path. To prevent unsafe
patterns, `contracts/transport.md` defines **required behavior for consumer
transports**:

- Transports that deliver to a network endpoint MUST use request body (POST/PUT
  JSON, or `navigator.sendBeacon` with a `Blob` body of `application/json`).
- Transports MUST NOT place `LogEvent` data in URL paths, query strings, or
  fragments.
- Transports MUST use HTTPS for any cross-origin delivery.
- Transports MUST treat the received `LogEvent` as immutable (the package
  freezes events in dev builds).
- Transports MUST tolerate `flush()`/`shutdown()` being called multiple times.

The package supplies a test helper, `assertTransportContract(transportInstance)`,
that runs a battery of contract assertions a consumer can wire into their own
test suite — including a check that the transport's `send` does not call
`fetch` with a URL containing event data. This helper is internal to the test
package and **not** part of the runtime public API; it is published via a
separate `/testing` subpath export.

### Failure boundaries (summary)

| Failure                                      | Behavior |
|----------------------------------------------|----------|
| Sanitizer encounters anything                | Coerces; never throws |
| Redactor throws                              | **Drop event** (fail-closed); `onInternalError` |
| ControlCharGuard throws (should not)         | Drop event; `onInternalError` |
| Backend init fails                           | Swap in `NoopBackend`; transports still receive events |
| Backend `handle()` throws                    | Direct fall-back to transports for this event |
| Transport `send()` throws                    | Caught in `SafeTransport`; other transports still attempted; one `onInternalError` per transport per session |
| Transport returns rejected Promise           | Same as above |
| `correlation()` throws                       | Its output dropped; event still emitted with base context |
| Logging before `configureLogging()`          | Root logger uses safe defaults (`warn`+, `NoopTransport`, env unknown) |

## Public API Design Direction

Exports from `src/index.ts` (the **only** public surface):

```ts
// Functions
export function createLogger(options?: CreateLoggerOptions): Logger;
export function configureLogging(config: LoggerConfig): void;
export function getRootLogger(): Logger;

// Security helpers
export function createRedactor(rules?: RedactionRule[]): Redactor;
export function scrubUrl(url: string, options?: ScrubUrlOptions): string;

// Built-in transports
export const ConsoleTransport: TransportFactory;
export const NoopTransport: TransportFactory;

// Types (re-exported for consumer typing only)
export type {
  Logger,
  LogLevel,           // 'debug' | 'info' | 'warn' | 'error'
  LogEvent,
  LogContext,
  AppIdentity,
  ModuleIdentity,
  Attributes,
  AttributeValue,
  ErrorInfo,
  LoggerConfig,
  CreateLoggerOptions,
  LevelMap,
  Transport,
  TransportFactory,
  Redactor,
  RedactionRule,
  ScrubUrlOptions,
};
```

A separate subpath `/testing` exports:

```ts
export function assertTransportContract(t: Transport): Promise<void>;
export function makeSecretFixture(): Record<string, string>; // for test sweeps
```

### `Logger` interface

```ts
interface Logger {
  debug(message: string, attributes?: Attributes): void;
  info(message: string, attributes?: Attributes): void;
  warn(message: string, attributes?: Attributes): void;
  error(message: string, attributes?: Attributes, error?: unknown): void;

  child(context: Partial<LogContext>): Logger;
  withContext(context: Partial<LogContext>): Logger; // alias
}
```

### Safe-by-default API design rules

- `message` is always `string`, never `unknown`. There is no `logger.log(obj)`,
  `logger.dump(obj)`, or `logger.raw(...)` that accepts arbitrary input.
- `attributes` is typed `Attributes = Record<string, AttributeValue>`, where
  `AttributeValue` is a constrained recursive union of primitives, arrays, and
  plain objects. This **discourages** passing raw class instances at the type
  level; passing one is allowed (TypeScript can't fully prevent it) but the
  sanitizer reduces it to a type tag.
- `error` on `logger.error()` is the **only** `unknown` parameter in the public
  API. The pipeline immediately reduces it to `{name, message, stack?}` and
  never holds onto the original.
- There is no API to bypass the redactor for a single call.
- There is no API to ship a raw string log line directly to a transport.

## Configuration and Environment Strategy

`LoggerConfig` (passed once via `configureLogging()` or per-logger via
`createLogger(options)`):

```ts
interface LoggerConfig {
  application?: { name: string; version?: string };
  module?: { name: string; version?: string };       // for federated modules
  environment?: 'production' | 'development' | 'test' | string;
  level?: LogLevel | LevelMap;                       // overrides defaults
  context?: Partial<LogContext>;                     // static metadata
  correlation?: () => Partial<LogContext>;           // dynamic per-emit hook
  transports?: Array<Transport | TransportFactory>;
  redactor?: Redactor;                               // custom redactor
  sanitizerLimits?: Partial<SanitizerLimits>;        // tighten bounds only
  onInternalError?: (err: Error) => void;            // diagnostics hook
}

interface SanitizerLimits {
  maxDepth: number;        // default 8, min 1, max 16
  maxStringLength: number; // default 8192, min 64
  maxArrayLength: number;  // default 1000, min 1
  maxAttributeCount: number; // default 256, min 1
}
```

### Sanitizer-limit policy

Consumers MAY **tighten** sanitizer limits (e.g., reduce `maxDepth` to 4) but
MAY NOT raise them above the documented maxima. Trying to set a value above
the max clamps to the max and emits one `onInternalError` notice. This prevents
an over-eager consumer from accidentally re-enabling unbounded dumping.

### Environment-aware level defaults

| Environment   | Default minimum level | Configurable? |
|---------------|------------------------|---------------|
| `production`  | `warn`                 | yes |
| `development` | `debug`                | yes |
| `test`        | `warn`                 | yes |
| unknown       | `warn` (safe default)  | yes |

The package does NOT read `process.env.NODE_ENV`, `import.meta.env`,
`location`, or any other ambient state. Consumers MUST pass `environment`
explicitly. Calls before `configureLogging()` use safe defaults.

### Identity & correlation flow

Same as v1: `application.name`, `module.name`, `context.attributes` (free
correlation slot), and a `correlation()` callback invoked per-emit. The merge
algorithm is in `data-model.md` and `contracts/logger-config.md`.

`correlation()` runs inside the dispatcher's try/catch — a throwing
correlation callback never crashes emit.

## Internal Layering and Abstraction Boundaries

### `src/api/` — Public surface

- `logger.ts`: `createLogger`, `configureLogging`, `getRootLogger`.
- `types.ts`: public types only (Logger, LogLevel, LogEvent, LogContext,
  Attributes, AttributeValue, LoggerConfig, CreateLoggerOptions, LevelMap,
  AppIdentity, ModuleIdentity, ErrorInfo, Transport, TransportFactory,
  Redactor, RedactionRule, ScrubUrlOptions).
- `index.ts` (root re-export).

### `src/pipeline/` — Event shaping & security boundary

- `event-builder.ts`: build canonical `LogEvent` (assign `timestamp`, normalize
  message, merge attributes, attach context).
- `level-filter.ts`: env-aware level resolution and short-circuit drop.
- `sanitizer.ts`: depth/size/type coercion; type-tag for DOM/framework objects;
  cyclic-ref / max-depth handling. **Never throws.**
- `url-scrubber.ts`: scrub sensitive params from URL-shaped string values;
  exported as `scrubUrl()` public helper.
- `redactor.ts`: default + custom redactor; key-based and shape-based masking.
  **Fail-closed.**
- `control-char-guard.ts`: escape control / line-separator characters in all
  string values.
- `freeze.ts`: dev-only deep `Object.freeze` of the final event.
- `dispatcher.ts`: call into `TelemetryBackend.handle(event)` with a single
  try/catch boundary; on failure, fall back to direct transport delivery.

### `src/transport/` — Delivery boundary

- `types.ts`: `Transport`, `TransportFactory`.
- `safe-transport.ts`: wraps a `Transport` with try/catch and Promise-rejection
  swallowing.
- `console-transport.ts`: built-in; passes event as the second arg to
  `console[level]`; never interpolates.
- `noop-transport.ts`: built-in; the documented fallback.
- `bridges/` (reserved, empty in v1): future application-owned ingestion
  adapters live here.

### `src/internal/telemetry/` — Hidden OTel adapter

- `backend.ts`: `TelemetryBackend` interface.
- `otel/otel-backend.ts`: constructs an OTel `LoggerProvider` and emits via it.
  Imports of `@opentelemetry/*` happen **only** here and in sibling files.
- `otel/mapping.ts`: bidirectional `LogEvent ↔ OTel LogRecord` mapping.
- `otel/event-bridge.ts`: custom `LogRecordProcessor` that converts OTel
  records back to `LogEvent` and forwards to configured transports.
- `noop-backend.ts`: forwards `LogEvent` directly to transports.

### `src/context/`, `src/config/`, `src/errors/`

Same as v1.

### `src/testing/` — Test-only helpers (separate exports subpath)

- `assert-transport-contract.ts`: runs a contract battery against any
  `Transport`, including a hook that intercepts global `fetch` and asserts
  no URL contains event-shaped data.
- `secret-fixtures.ts`: returns a known-bad fixture object (passwords, JWTs,
  bearer tokens, credit cards) for use in consumer redaction tests.

## Failure Handling Strategy

| Failure                                          | Behavior |
|--------------------------------------------------|----------|
| No transport configured                          | Pipeline runs through `NoopTransport`. Emission returns normally. One-time `onInternalError` notice if `environment === 'production'`. |
| Transport `send()` throws synchronously          | Caught in `SafeTransport`. Other transports still attempted. One `onInternalError` per transport per session. |
| Transport returns rejected Promise               | Rejection swallowed in `SafeTransport`. Same notice rules. |
| Redactor throws                                  | Event is dropped (fail-closed). `onInternalError` invoked. |
| Sanitizer encounters unknown input               | Coerces per documented rules. Never throws. |
| Sanitizer hits depth / size / count limits       | Truncates with documented marker. Never throws. |
| URL scrubber fails to parse                      | Returns input unchanged; redactor still gets a shot at it. |
| OTel backend init throws                         | `OtelLogsBackend` falls back to `NoopBackend` (transports still get events). `onInternalError` invoked. |
| OTel runtime emission throws                     | Caught at dispatcher. Event is sent directly to transports via fallback path. |
| `correlation()` hook throws                      | Hook output dropped for that event. Event still emitted with base context. |
| Non-serializable attribute value                 | Coerced to `"[Unserializable]"` or a type tag. Never throws. |
| Logging called before `configureLogging()`       | Root logger uses safe defaults: `warn`+, `NoopTransport`, env=unknown. |
| `sanitizerLimits` set above documented maximum   | Clamped to maximum; one `onInternalError` notice on configure. |

**Hard invariant**: no code path inside the package may propagate a thrown
error or rejected Promise into consumer call sites. Enforced by:
- `SafeTransport` wrapper around every transport.
- `try/catch` boundary in `dispatcher.ts` around backend invocation, redactor,
  correlation, and control-char guard.
- Contract test: "1000 successive emissions with a throwing transport, a
  throwing redactor for half the events, a throwing correlation hook, and
  oversized cyclic input never throw and complete in <100ms".

## Testing Strategy

Tests live under `tests/`, organized by intent. Coverage targets:
- 100% of public API exports executed by contract tests.
- ≥ 90% line coverage in `src/pipeline/`, `src/transport/`, `src/internal/`.
- 100% line coverage in `src/pipeline/sanitizer.ts`, `src/pipeline/redactor.ts`,
  `src/pipeline/url-scrubber.ts`, `src/pipeline/control-char-guard.ts`.

### Contract tests (`tests/contract/`)

Lock down public behavior. Import only from `src/index.ts` (or the package's
published `exports` map).

- `public-api.contract.test.ts` — surface shape and signatures (PA-1..PA-6).
- `level-behavior.contract.test.ts` — env-aware defaults; `LevelMap`
  resolution; per-logger overrides.
- `transport.contract.test.ts` — `Transport` interface contract; pluggability;
  multi-transport; transport swap leaves call sites unchanged.
- `context.contract.test.ts` — app/module/env/correlation flow; merge order;
  `child()` derivation.
- `redaction.contract.test.ts` — default redactor masks documented sensitive
  keys; custom redactor accepted; fail-closed when redactor throws.
- `failure-safety.contract.test.ts` — throwing transport, rejecting transport,
  missing transport, init failure all degrade safely; the 1000-emission stress
  test.
- `log-event.contract.test.ts` — LE-1..LE-7 from `contracts/log-event.md`.

### Security tests (`tests/security/`)

Each test in this group ties directly to a spec FR (FR-012 through FR-021) or
success criterion (SC-008, SC-009, SC-010). Coverage:

- `secret-leakage.test.ts` — sweep of `makeSecretFixture()` values placed in
  attributes, nested attributes, context.attributes, message, and error object.
  Assert every value is masked in the LogEvent received by transports.
- `url-query-leakage.test.ts` — URL values containing `?token=...`,
  `?session_id=...`, `?access_token=...` in attributes have their sensitive
  params masked by the scrubber; URL fragments with the same params also
  masked.
- `log-injection.test.ts` — attribute and message values containing `\n`,
  `\r`, ` `, ` `, ANSI escape sequences, and structured-looking
  payloads (e.g., `'\n{"level":"error","message":"forged"}\n'`) are escaped at
  the output boundary and cannot produce a forged second record in
  `ConsoleTransport`'s serialized output.
- `serialization-safety.test.ts` — cyclic objects, deeply nested objects
  (depth > 8), oversized arrays (> 1000 elements), oversized strings (> 8192
  chars), framework/DOM objects (HTMLElement, Event, Promise, Map, Set,
  Function), and class instances all produce documented coercion outputs and
  never throw.
- `over-redaction.test.ts` — safe values that happen to contain substrings
  matching denylist keys (e.g., a product name `"tokenizer"` in a non-key
  position) are NOT mangled; redaction matches **keys**, not arbitrary
  substrings.
- `fail-closed-redaction.test.ts` — a redactor that throws causes the
  affected event to be dropped (not partially emitted, not emitted raw) and
  `onInternalError` is invoked.
- `transport-contract.security.test.ts` — runs `assertTransportContract` against
  a sample beacon-style transport and against a deliberately bad URL-based
  transport, expecting pass and fail respectively.
- `sanitizer-limit-clamp.test.ts` — setting `sanitizerLimits.maxDepth = 99`
  clamps to 16 and emits one `onInternalError` notice.
- `bundle-shape.security.test.ts` — the published `.d.ts` does not contain the
  strings `opentelemetry` or `@opentelemetry`, and the published runtime entry
  does not re-export anything from `src/internal/**`.

### Unit tests (`tests/unit/`)

- `pipeline/event-builder.test.ts`
- `pipeline/level-filter.test.ts`
- `pipeline/sanitizer.test.ts` — every row of the sanitization table.
- `pipeline/redactor.test.ts` — key match (case-insensitive); custom rules;
  shape-based patterns.
- `pipeline/url-scrubber.test.ts` — well-formed URLs, malformed URLs,
  fragments, repeated params.
- `pipeline/control-char-guard.test.ts` — every control char range.
- `pipeline/dispatcher.test.ts` — backend errors swallowed; fallback path.
- `transport/safe-transport.test.ts` — sync + async failures.
- `internal/telemetry/otel-backend.test.ts` — mapping correctness via DI.
- `internal/telemetry/mapping.test.ts` — round-trip.
- `context/context-merge.test.ts` — merge precedence.

### Integration tests (`tests/integration/`)

- `end-to-end.test.ts` — configure → emit → assert delivered events match the
  declared `LogEvent` contract.
- `host-module.test.ts` — host logger + module logger sharing one
  configuration; events distinguishable by `context.module.name`.
- `secret-sweep.integration.test.ts` — end-to-end version of
  `secret-leakage.test.ts` running through the full pipeline including the
  OTel backend (when present) and an in-memory transport.

## Documentation Strategy

`quickstart.md` and `examples/` are part of the deliverable, not an
afterthought. Per Principle V they MUST model safe logging.

Required guidance:
- Every example uses structured attributes (`logger.info("payment failed", {
  code })`), never string interpolation of values into the message.
- No example logs an entire request, response, user object, application state
  object, DOM node, or framework object.
- The HTTP transport example uses `navigator.sendBeacon` or `fetch` with a
  JSON body — never URL params. The example explicitly says "do NOT put events
  in the URL".
- The federated-module example shows how to attach `module` identity without
  pulling in host-app secrets.
- A dedicated "Logging safely" section in `quickstart.md` calls out
  anti-patterns and links to the redactor and `scrubUrl` helpers.

Anti-pattern lint (deferred to tasks but planned): an optional ESLint rule
package `@your-org/eslint-plugin-frontend-logging` that flags
`logger.info(\`...${...}\`)`, `logger.info(JSON.stringify(...))`, and
`logger.error(err)` without a message — is OUT of scope for this plan but
named here so tasks can decide whether to land it.

## Risks, Assumptions, and Tradeoffs

### Security-specific risks

- **Over-redaction / false positives.** The default denylist is conservative
  but a real product field could collide with a denylist key (e.g.,
  `"authorization_type": "manager"` would match `authorization`). Mitigation:
  redaction is key-name-based and case-insensitive, scoped to attribute keys
  not values, so a value of `"authorization"` would NOT be masked. Where this
  is still wrong, consumers can pass a custom `Redactor` to replace defaults.
  Documented as an expected tradeoff.
- **Under-redaction.** A consumer creates a new attribute key not on the
  denylist (e.g., `"x-internal-secret"`) and the default redactor misses it.
  Mitigation: documented `RedactionRule[]` extension; encourage consumers to
  audit their attribute keys; ship `makeSecretFixture()` for consumer tests.
- **Sanitizer bypass via getters.** A class instance with a `password` getter
  could leak if naively serialized. Mitigation: the sanitizer reduces class
  instances to a type tag *before* the redactor runs, so getters are never
  invoked.
- **Developer ergonomics vs strict safety.** Consumers may be tempted to
  raise `maxDepth` to log a deeply nested object. Mitigation: sanitizer limits
  cap the cap; can be tightened but not raised above documented maxima.
- **Observability value vs sensitive data.** Aggressive masking can erode
  debuggability. Mitigation: defaults mask only by **key**, not by value
  substring; the package exposes `createRedactor` so a security-conscious
  consumer can layer more rules without losing observability of safe fields.
- **Telemetry layer replaceability vs security guarantees.** A future backend
  swap must not silently undo sanitization or redaction. Mitigation: those
  steps live in the pipeline, **upstream** of the backend interface. Any
  backend that implemented its own bypass would still receive an
  already-sanitized-and-redacted event.
- **Default context acceptance.** Should the package accept arbitrary objects
  as `context.attributes`? Yes, but through the same sanitizer — so passing a
  framework object still produces a type tag, not a recursive dump.
- **URL leakage outside our reach.** The package itself never reads
  `location.search`. If a consumer copies `location.search` into a log
  attribute, our URL scrubber will strip sensitive params; if they encode it
  some other way (base64, hand-rolled stringify), we cannot detect it.
  Documented as a known limitation in `risks` and called out in the
  quickstart anti-patterns section.

### General risks (carried from v1)

- **OTel Logs API is experimental.** Mitigated by the single-chokepoint
  isolation (see next section).
- **Multiple package instances under module federation.** Each loaded copy
  has its own root logger; distinguishable by `application.name` /
  `module.name`. Tested.
- **Consumer transport bugs.** Mitigated by `SafeTransport`.

### Assumptions

- Consumers explicitly pass `environment`. The package does not infer.
- Consumers own actual network delivery (no HTTP transport in v1).
- Federated module identity is decided by the module owner via `module.name`.
- Browser targets support `Promise`, `Map`, `Set`, `URL`,
  `Object.fromEntries`, optional chaining.

### Tradeoffs

- Internal OTel dependency weight buys future ecosystem reuse. Mitigated by
  the noop fallback.
- No env auto-detection costs the consumer one config field but keeps the
  package bundler-neutral.
- No built-in HTTP transport in v1 keeps the API tiny and steers consumers to
  body-only delivery via the transport contract.
- Strict `AttributeValue` typing increases type-friction slightly but makes
  the safe path the easy path.

## Mitigating the Experimental Nature of OpenTelemetry JS Logs

(unchanged from prior plan, retained as the design still depends on it)

1. **Single chokepoint**: all `@opentelemetry/*` imports live in
   `src/internal/telemetry/otel/`. A test forbids these imports elsewhere.
2. **Backend abstraction**: `TelemetryBackend` is the seam.
3. **Pinned versions**: caret-locked, manual-review-only bumps.
4. **Defensive init**: failure falls back to `NoopBackend`; transports still
   receive events.
5. **No OTel types in public API**: enforced by a `.d.ts` grep test.
6. **Mapping isolation**: `LogEvent ↔ OTel LogRecord` mapping in one file.
7. **Public-API tests never instantiate OTel.**

If the OTel Logs API stabilizes or is replaced, the swap happens inside
`otel-backend.ts` with no consumer impact.

**Crucially**: replacing the OTel backend cannot weaken security guarantees,
because sanitization and redaction live **upstream** of the backend interface.

## Project Structure

### Documentation (this feature)

```text
specs/001-structured-logging-core/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── public-api.md
│   ├── transport.md
│   ├── log-event.md
│   ├── logger-config.md
│   ├── failure-safety.md
│   ├── redaction.md
│   └── sanitization.md
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── index.ts                          # ONLY public exports
├── api/
│   ├── logger.ts                     # createLogger, configureLogging, Logger impl
│   └── types.ts                      # public types
├── config/
│   ├── config.ts                     # LoggerConfig normalization + sanitizer clamp
│   └── env-defaults.ts               # env → default level table
├── context/
│   ├── identity.ts                   # AppIdentity, ModuleIdentity
│   └── context-merge.ts              # merge algorithm
├── pipeline/
│   ├── event-builder.ts              # canonical LogEvent construction
│   ├── level-filter.ts               # env-aware filtering
│   ├── sanitizer.ts                  # depth/size/type coercion (never throws)
│   ├── url-scrubber.ts               # URL query/fragment scrubbing; exported helper
│   ├── redactor.ts                   # default + custom redactor (fail-closed)
│   ├── control-char-guard.ts         # escape control / line-separator chars
│   ├── freeze.ts                     # dev-only deep freeze
│   └── dispatcher.ts                 # backend invocation w/ error containment
├── transport/
│   ├── types.ts                      # Transport, TransportFactory
│   ├── safe-transport.ts             # failure-isolating wrapper
│   ├── console-transport.ts          # built-in (object-mode, never interpolated)
│   ├── noop-transport.ts             # built-in
│   └── bridges/                      # reserved for future ingestion adapters (empty)
├── internal/
│   ├── telemetry/
│   │   ├── backend.ts                # TelemetryBackend interface
│   │   ├── noop-backend.ts           # OTel-free fallback
│   │   └── otel/                     # ONLY directory permitted to import @opentelemetry/*
│   │       ├── otel-backend.ts
│   │       ├── event-bridge.ts       # custom LogRecordProcessor
│   │       └── mapping.ts            # LogEvent ↔ OTel LogRecord
│   └── errors/
│       └── internal-errors.ts
└── testing/                          # exposed via separate "/testing" subpath
    ├── assert-transport-contract.ts
    └── secret-fixtures.ts

tests/
├── contract/
│   ├── public-api.contract.test.ts
│   ├── level-behavior.contract.test.ts
│   ├── transport.contract.test.ts
│   ├── context.contract.test.ts
│   ├── redaction.contract.test.ts
│   ├── failure-safety.contract.test.ts
│   └── log-event.contract.test.ts
├── security/
│   ├── secret-leakage.test.ts
│   ├── url-query-leakage.test.ts
│   ├── log-injection.test.ts
│   ├── serialization-safety.test.ts
│   ├── over-redaction.test.ts
│   ├── fail-closed-redaction.test.ts
│   ├── transport-contract.security.test.ts
│   ├── sanitizer-limit-clamp.test.ts
│   └── bundle-shape.security.test.ts
├── integration/
│   ├── end-to-end.test.ts
│   ├── host-module.test.ts
│   └── secret-sweep.integration.test.ts
└── unit/
    ├── pipeline/
    ├── transport/
    ├── context/
    └── internal/telemetry/

examples/
├── host-app/                         # single-app consumer example
└── federated-module/                 # module consumer example
   (each example includes a body-only HTTP transport — never URL-based)

package.json
tsconfig.json
tsup.config.ts
vitest.config.ts
```

**Structure Decision**: Single-package repository layout. Source under `src/`,
tests under `tests/` with a dedicated `tests/security/` group, two example
consumers under `examples/`. Internal layering enforced by directory
boundaries: nothing outside `src/internal/telemetry/otel/` may import
`@opentelemetry/*`, and nothing outside `src/api/` and `src/index.ts`
contributes to the runtime public surface. Test helpers live in `src/testing/`
and are exposed via the `/testing` subpath of `package.json` `exports`.

## Post-Design Constitution Re-check

All six principles still PASS after Phase 1 design:

- **I. Stable Consumer API**: surface is tightly scoped, safe path is the easy
  path (no `unknown` in message; constrained `Attributes`; no `dump` API).
- **II. Browser Resilience & Failure Safety**: every consumer-provided callable
  wrapped; fail-closed redaction; sanitizer never throws.
- **III. Framework-Neutral Structured Observability**: object-only output;
  bounded shape (depth/size/count); production defaults preserved.
- **IV. Secure & Privacy-Safe Logging by Default**: sanitize-then-redact
  pipeline upstream of every backend and transport; default denylist;
  sanitizer-limit clamp; URL scrubber; fail-closed.
- **V. Testable, Minimal, Maintainable**: dedicated `tests/security/` group;
  examples demonstrate safe usage; no insecure patterns normalized.
- **VI. Log Integrity & Monitoring Suitability**: events reach transports
  unmutated post-pipeline; stable attribution fields; transport contract
  requires POST body delivery (no URL leakage); v1 does not drop/sample/batch.

## Complexity Tracking

*No constitution violations. No entries required.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
