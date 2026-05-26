# Implementation Plan: Core Structured Logging API

**Branch**: `001-structured-logging-core` | **Date**: 2026-05-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-structured-logging-core/spec.md`

## Summary

Deliver a browser-first, framework-neutral, reusable frontend logging package that
exposes a small stable public API (`Logger`, levels, structured events, context,
transport) while using OpenTelemetry JavaScript **only as an internal implementation
detail** for structured event shaping and downstream export wiring. Consumers never
see OpenTelemetry types or concepts. The package separates emission, shaping,
redaction, and delivery; degrades safely on transport failure; and preserves a stable
contract so future application-owned ingestion or vendor backends can be added without
consumer call-site changes.

## Technical Context

**Language/Version**: TypeScript 5.4+ targeting ES2020 with DOM lib; strict mode on.

**Primary Dependencies**:
- Runtime (internal only): `@opentelemetry/api-logs` (experimental Logs API),
  `@opentelemetry/sdk-logs` (experimental SDK), `@opentelemetry/api` for context.
  Pinned to caret-locked minor versions and isolated behind an internal adapter.
- Build: `tsup` (ESM + CJS dual output, browser target, no Node built-ins).
- Test: `vitest` with `@vitest/coverage-v8`, `happy-dom` (browser-like env),
  `@vitest/web-worker` only if needed (likely unused for v1).

**Storage**: None. Package is in-memory only. Transports may buffer in memory but
never persist to IndexedDB, localStorage, or cookies in v1.

**Testing**: Vitest contract tests (public API + transport contract), unit tests
(pipeline, redaction, context merging, level filter, OTel adapter), integration tests
(host/module reuse, failure isolation, env-aware defaults).

**Target Platform**: Modern evergreen browsers (Chromium, Firefox, Safari, Edge —
last 2 versions). Must build and import safely under SSR-style bundling (no
`window` at module top level). Federated/module-federation friendly: no global
singletons that break when loaded multiple times.

**Project Type**: Reusable frontend package/library (single npm-publishable package
in this repo).

**Performance Goals**:
- Log emission call cost bounded to a synchronous append + filter check; transport
  work is deferred (microtask or batched) and never blocks the calling frame.
- No use of `Sync XHR`, no blocking work, no `console.*` on hot paths unless an
  explicit `ConsoleTransport` is configured.
- Cold-load cost of the package ≤ ~15 KB minified+gzipped for the core path
  excluding the optional OTel backend (which is internally tree-shakeable behind a
  dynamic boundary).

**Constraints**:
- Browser-safe: no Node-only APIs, no top-level `window` access, no eager DOM access.
- Privacy-safe: default redaction list and a documented `redact` extension point.
- Transport failure tolerant: a throwing transport MUST NOT propagate to the caller
  and MUST NOT crash subsequent emissions.
- Public API MUST NOT expose any OpenTelemetry types, names, or concepts.

**Scale/Scope**: One reusable package consumed by multiple host apps and
independently deployed federated modules. Designed for many `Logger` instances per
page (one per module is normal).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **API Stability**:
  - Public surface introduced: `createLogger()`, `configureLogging()`,
    `Logger` interface (`debug|info|warn|error|child|withContext`), `LogLevel`
    enum-like union, `LogEvent` type, `LogContext` type, `Transport` interface,
    `LoggerConfig` type, built-in `ConsoleTransport`, `NoopTransport`, default
    `createRedactor()`. All other modules are internal and not re-exported.
  - Compatibility: additive (new package, no prior consumers).
  - Hidden internals: OpenTelemetry types, SDK setup, exporter wiring, pipeline
    classes, event-builder, env detection — all live under `src/internal/**` and
    `src/pipeline/**` and are not re-exported from `src/index.ts`.
- **Browser Resilience**:
  - All transport delivery wrapped by `SafeTransport` so consumer-supplied
    `Transport.send()` exceptions and Promise rejections are caught and dropped
    after at most one internal `console.warn` per session per transport.
  - No top-level browser globals; environment detection lazy and guarded.
  - Backend init is lazy on first emission so import-time work cannot crash the
    host app shell.
- **Neutrality & Portability**:
  - No framework, bundler, or backend assumed. No app-specific identifiers.
  - Host and federated modules use the same `createLogger()` contract; identity
    flows through explicit configuration, never through globals.
  - No reliance on `window`-scoped singletons; module-level registry is opt-in via
    `configureLogging()` and isolated per package instance.
- **Structured Observability**:
  - Structured `LogEvent` with `level`, `message`, `timestamp`, `attributes`,
    `context` (app/module/env/correlation) is the canonical record.
  - Production defaults: `warn` and `error` enabled; `debug`/`info` opt-in via
    config or environment.
  - Future transport/backend changes require zero call-site changes because the
    `Transport` and `TelemetryBackend` swap points are internal.
- **Privacy & Safe Data Handling**:
  - Default redactor masks known sensitive keys (`password`, `token`,
    `authorization`, `cookie`, `secret`, `apiKey`, `sessionId`, etc.) and never
    serializes unknown class instances by default.
  - Examples and docs MUST demonstrate redaction and warn against logging PII,
    secrets, tokens.
- **Test & Documentation Coverage**: see [Testing Strategy](#testing-strategy)
  and Phase 1 artifacts.

**Result**: PASS. No violations; Complexity Tracking left empty.

## Technical Architecture Overview

The package is a layered pipeline. Each layer has one job and a single owner
interface.

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Public API Layer  (src/api)                              │
│    Logger, createLogger, configureLogging, types            │
└────────────────────────────┬────────────────────────────────┘
                             │ LogEvent (canonical)
┌────────────────────────────▼────────────────────────────────┐
│ 2. Pipeline Layer  (src/pipeline)                           │
│    EventBuilder → LevelFilter → Redactor → Dispatcher       │
└────────────────────────────┬────────────────────────────────┘
                             │ LogEvent (filtered, redacted)
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
│    Implemented by consumers as a Transport adapter.         │
│    Reserved location: src/transport/bridges/ (empty in v1). │
└─────────────────────────────────────────────────────────────┘
```

### Layer responsibilities

1. **Public API**: stable types, factory functions, no logic beyond delegation.
2. **Pipeline**: builds the canonical `LogEvent`, applies env-aware level filter,
   applies redaction, hands off to the backend.
3. **Telemetry Backend Adapter**: hides OpenTelemetry. `OtelLogsBackend` translates
   `LogEvent` to an OTel LogRecord, runs it through an OTel `LoggerProvider` with
   our internal `LogRecordProcessor` that re-emits the original `LogEvent` to the
   configured `Transport`. (Using OTel as the spine gives future OTLP exporters and
   trace correlation for free.) `NoopBackend` skips OTel entirely.
4. **Transport**: single delivery interface (`Transport.send(event)`), wrapped in
   `SafeTransport` for failure isolation.
5. **Future ingestion**: any consumer or platform team implements a `Transport`. No
   package change required.

## Public API Design Direction

Exports from `src/index.ts` (the **only** public surface):

```ts
// Functions
export function createLogger(options?: CreateLoggerOptions): Logger;
export function configureLogging(config: LoggerConfig): void;
export function getRootLogger(): Logger;

// Built-in transports
export const ConsoleTransport: TransportFactory;
export const NoopTransport: TransportFactory;

// Built-in redactor helper
export function createRedactor(rules?: RedactionRule[]): Redactor;

// Types (re-exported for consumer typing only)
export type {
  Logger,
  LogLevel,           // 'debug' | 'info' | 'warn' | 'error'
  LogEvent,
  LogContext,
  LoggerConfig,
  CreateLoggerOptions,
  Transport,
  TransportFactory,
  Redactor,
  RedactionRule,
};
```

The `Logger` interface:

```ts
interface Logger {
  debug(message: string, attributes?: Attributes): void;
  info(message: string, attributes?: Attributes): void;
  warn(message: string, attributes?: Attributes): void;
  error(message: string, attributes?: Attributes, error?: unknown): void;

  // Returns a derived logger with additional context merged in.
  child(context: Partial<LogContext>): Logger;
  withContext(context: Partial<LogContext>): Logger; // alias
}
```

**Notes**:
- No OpenTelemetry type names appear anywhere in the public surface.
- `Attributes` is a `Record<string, unknown>` shaped object with documented
  serialization rules (primitives, arrays of primitives, plain objects up to depth
  N). Non-serializable values are coerced or dropped by the pipeline, not by the
  consumer.
- `error` overload accepts `unknown` because TypeScript catch values are unknown.
- The `Logger` interface is the only consumer-facing contract for emission.

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
  onInternalError?: (err: Error) => void;            // diagnostics hook
}

type LevelMap = Partial<Record<'production' | 'development' | 'test', LogLevel>>;
```

### Environment-aware level defaults

| Environment   | Default minimum level | Configurable? |
|---------------|------------------------|---------------|
| `production`  | `warn`                 | yes, via `level` |
| `development` | `debug`                | yes |
| `test`        | `warn`                 | yes |
| unknown       | `warn` (safe default)  | yes |

Resolution order on each emission:
1. Explicit `level` in `LoggerConfig` (single level or per-environment map).
2. Environment default from the table above.
3. Hard fallback: `warn`.

Environment inference: explicit `environment` config wins. Otherwise the package
treats the environment as **unknown** and uses safe defaults. The package does NOT
auto-read `process.env.NODE_ENV` or `import.meta.env.MODE`; the consumer is
responsible for passing environment explicitly. This keeps the package
bundler-neutral.

### Identity & correlation flow

- `application.name` identifies the host app (or the consuming app for federated
  modules).
- `module.name` identifies an independently deployed federated module.
- `context.*` carries any additional static metadata (e.g. release SHA).
- `correlation()` is called on every emit to attach dynamic data (e.g. current
  trace id, user pseudonymous id, route name). It must be cheap and synchronous.
- `Logger.child(ctx)` creates a derived logger with a shallow-merged context. Used
  by federated modules to brand their logger without mutating the root.

Every emitted `LogEvent.context` is the merged result of:
```
config.context ⊕ logger-chain context ⊕ correlation() ⊕ per-call attributes
```
Later layers override earlier ones; the merge is documented and tested.

## Internal Layering and Abstraction Boundaries

### `src/api/` — Public surface

- `logger.ts`: `createLogger`, `configureLogging`, `getRootLogger`.
- `types.ts`: public types only.
- `index.ts` (root re-export).
- No logic beyond input normalization and delegation to the pipeline.

### `src/pipeline/` — Event shaping (internal)

- `event-builder.ts`: build canonical `LogEvent` (assign `timestamp`, normalize
  message, merge attributes, attach context).
- `level-filter.ts`: env-aware level resolution and short-circuit drop.
- `redactor.ts`: apply `Redactor` to attributes and context.
- `dispatcher.ts`: call into `TelemetryBackend.handle(event)` and catch all
  errors.

### `src/transport/` — Delivery boundary

- `types.ts`: `Transport` interface, `TransportFactory`, `TransportContext`.
- `safe-transport.ts`: wraps a `Transport` with try/catch and Promise-rejection
  swallowing. One internal warn per transport per session on first failure.
- `console-transport.ts`: built-in; prints to `console[level]` with structured
  payload as the second argument.
- `noop-transport.ts`: built-in; the documented fallback when no transport is
  configured.
- `bridges/` (reserved, empty in v1): home for future application-owned ingestion
  adapters.

### `src/internal/telemetry/` — Hidden OTel adapter

- `backend.ts`: `TelemetryBackend` interface
  (`init(config) → void`, `handle(event) → void`, `shutdown() → Promise<void>`).
- `otel/otel-backend.ts`: constructs an OTel `LoggerProvider`, attaches an
  internal `LogRecordProcessor` (`event-bridge.ts`) and emits via
  `loggerProvider.getLogger(...).emit(...)`. Imports of `@opentelemetry/*` happen
  **only** inside this file (and its siblings). No other module imports OTel.
- `otel/mapping.ts`: bidirectional mapping `LogEvent ↔ OTel LogRecord`.
- `otel/event-bridge.ts`: custom `LogRecordProcessor` that converts OTel records
  back to `LogEvent` and forwards to the configured `Transport[]`.
- `noop-backend.ts`: forwards `LogEvent` directly to `Transport[]` without going
  through OTel. Used when OTel deps are absent or backend init fails.

### `src/context/` — Identity & merging

- `identity.ts`: `AppIdentity`, `ModuleIdentity`.
- `context-merge.ts`: documented context merge algorithm (shallow merge with
  per-call winning).

### `src/config/` — Configuration model

- `config.ts`: `LoggerConfig` defaults, env-aware level resolution helpers.
- `env-defaults.ts`: the default-level table above.

### `src/errors/`

- `internal-errors.ts`: typed internal errors with a private symbol marker so
  pipeline can distinguish package errors from consumer errors.

## Failure Handling Strategy

| Failure                                          | Behavior |
|--------------------------------------------------|----------|
| No transport configured                          | Pipeline runs through `NoopTransport`. Emission returns normally. One-time `onInternalError` notice if `application.name` indicates production. |
| Transport `send()` throws synchronously          | Caught in `SafeTransport`. Other transports still attempted. One `onInternalError` per transport per session. |
| Transport returns rejected Promise               | Rejection swallowed in `SafeTransport`. Same notice rules. |
| Redactor throws                                  | Event is dropped (fail-closed for privacy). `onInternalError` invoked. |
| OTel backend init throws                         | `OtelLogsBackend` falls back to `NoopBackend` (transports still get events). `onInternalError` invoked. |
| OTel runtime emission throws                     | Caught at `dispatcher`. Event is sent directly to transports via fallback path. |
| `correlation()` hook throws                      | Hook output dropped for that event. Event still emitted with base context. |
| Non-serializable attribute value                 | Coerced to `"[Unserializable]"` or removed (documented rule). Never throws. |
| Logging called before `configureLogging()`       | Root logger uses safe defaults: `warn`+, `NoopTransport`, env=unknown. |

**Hard invariant**: no code path inside the package may propagate a thrown error
or rejected Promise into consumer call sites. This is enforced by:
- `SafeTransport` wrapper around every transport.
- `try/catch` boundary in `dispatcher.ts` around backend invocation.
- Contract test: "100 successive emissions with a throwing transport never throw
  and never block".

## Testing Strategy

### Contract tests (`tests/contract/`)
Lock down public behavior. These tests import only from `src/index.ts`.

- `public-api.contract.test.ts`: surface shape — every documented export exists
  and has the documented type signature.
- `level-behavior.contract.test.ts`: env-aware defaults; production keeps
  `warn`/`error` only; `debug`/`info` configurable.
- `transport.contract.test.ts`: `Transport` interface contract; pluggable;
  multiple transports; transport swap leaves call sites unchanged.
- `context.contract.test.ts`: app/module/env/correlation flow into `LogEvent`;
  merge order; `child()` derivation.
- `redaction.contract.test.ts`: default redactor masks known keys; custom
  redactor accepted; fail-closed when redactor throws.
- `failure-safety.contract.test.ts`: throwing transport, rejecting transport,
  missing transport, init failure — all degrade safely.

### Unit tests (`tests/unit/`)
- `pipeline/event-builder.test.ts`: timestamp, attribute coercion, depth limit.
- `pipeline/level-filter.test.ts`: per-environment resolution table.
- `pipeline/dispatcher.test.ts`: backend errors swallowed.
- `transport/safe-transport.test.ts`: wraps sync + async failures.
- `internal/telemetry/otel-backend.test.ts`: mapping correctness with a
  mocked `LoggerProvider`; uses dependency injection so OTel imports are not
  required for unit-level tests.
- `internal/telemetry/mapping.test.ts`: `LogEvent ↔ OTel LogRecord` round-trip.
- `context/context-merge.test.ts`: merge order.

### Integration tests (`tests/integration/`)
- `end-to-end.test.ts`: configure → emit → assert delivered events match the
  declared `LogEvent` contract.
- `host-module.test.ts`: simulate a host logger and a module logger sharing one
  configuration; events distinguishable by `context.module.name`.
- `bundle-shape.test.ts`: build artifact contains no OTel symbols in the public
  type declaration (`d.ts`) output.

### Coverage gates
- 100% of public API exports executed by contract tests.
- ≥ 90% line coverage in `src/pipeline/`, `src/transport/`, `src/internal/`.
- Mutation testing is not required for v1.

## Risks, Assumptions, and Tradeoffs

### Risks
- **OTel Logs API is experimental.** Breaking changes possible. Mitigated by
  isolating all OTel imports under `src/internal/telemetry/otel/` and providing
  a `NoopBackend` fallback that delivers directly to transports. See dedicated
  section below.
- **Multiple package instances under module federation.** Each loaded copy will
  have its own root logger; that is acceptable as long as `application.name`
  and `module.name` distinguish events. Tested in `host-module.test.ts`.
- **Consumer transport bugs.** Mitigated by `SafeTransport` wrapping every
  transport without exception.
- **PII leakage through attributes.** Mitigated by default redaction list and
  documentation; consumers SHOULD provide a stricter `Redactor` for their
  domain. Cannot be fully solved at the package layer.

### Assumptions
- Consumers explicitly pass `environment`; the package does not infer it from
  `process.env` or `import.meta.env`.
- Consumers are responsible for actual network delivery in v1 (the package
  intentionally ships no HTTP transport).
- Federated module identity is decided by the module owner via `module.name`,
  not auto-detected.
- Browser targets support `Promise`, `Map`, `Set`, `Object.fromEntries`,
  optional chaining.

### Tradeoffs
- We pay the dependency weight of OTel SDK internally to gain future ecosystem
  reuse (OTLP exporters, trace correlation). Mitigated by making the OTel
  backend internally swappable and the noop backend fully functional.
- We do not auto-detect environment; consumers do slightly more wiring, but
  the package stays bundler/framework neutral.
- We do not ship an HTTP transport in v1; this keeps the API tiny and frees
  applications to own their ingestion path, but consumers must implement
  `Transport` to deliver anywhere.

## Mitigating the Experimental Nature of OpenTelemetry JS Logs

The OTel Logs API and SDK are currently experimental. Concrete mitigations:

1. **Single chokepoint**: all `@opentelemetry/*` imports live in
   `src/internal/telemetry/otel/`. A linter rule (or test) forbids these imports
   elsewhere. A breaking OTel API change touches one directory, never the public
   API.
2. **Backend abstraction**: `TelemetryBackend` is the seam. `OtelLogsBackend`,
   `NoopBackend`, and any future `NativeFetchBackend` are interchangeable; the
   pipeline does not know which is active.
3. **Pinned versions**: OTel deps are pinned to a known-working caret-locked
   minor pair, with renovate/dependabot blocked from auto-bumping these without
   a manual review checklist.
4. **Defensive init**: `OtelLogsBackend.init()` runs in `try/catch`. On failure
   the package silently swaps in `NoopBackend` (which still delivers to
   `Transport[]`) and calls `onInternalError`. The app never sees an init crash.
5. **No OTel types in public API**: enforced by a `d.ts` contract test that
   greps the published declaration output for the strings `opentelemetry` and
   `@opentelemetry` and fails if any appear.
6. **Mapping isolation**: `LogEvent ↔ OTel LogRecord` mapping lives in
   `mapping.ts`. If OTel renames fields, only this file changes.
7. **Tests for the public API never instantiate OTel**: contract tests use the
   noop backend or stubbed backend, so the public test suite cannot regress
   because of OTel API changes.

If the OTel Logs API ever stabilizes or is replaced upstream, the package can
adopt the change inside `otel-backend.ts` with no consumer impact and no public
API version bump.

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
│   └── failure-safety.md
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── index.ts                          # ONLY public exports
├── api/
│   ├── logger.ts                     # createLogger, configureLogging, Logger impl
│   └── types.ts                      # public types (Logger, LogLevel, LogEvent, ...)
├── config/
│   ├── config.ts                     # LoggerConfig normalization
│   └── env-defaults.ts               # env → default level table
├── context/
│   ├── identity.ts                   # AppIdentity, ModuleIdentity
│   └── context-merge.ts              # documented merge algorithm
├── pipeline/
│   ├── event-builder.ts              # canonical LogEvent construction
│   ├── level-filter.ts               # env-aware filtering
│   ├── redactor.ts                   # default redactor + Redactor type
│   └── dispatcher.ts                 # backend invocation w/ error containment
├── transport/
│   ├── types.ts                      # Transport, TransportFactory
│   ├── safe-transport.ts             # failure-isolating wrapper
│   ├── console-transport.ts          # built-in
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
└── (tests live under tests/, not src/)

tests/
├── contract/
│   ├── public-api.contract.test.ts
│   ├── level-behavior.contract.test.ts
│   ├── transport.contract.test.ts
│   ├── context.contract.test.ts
│   ├── redaction.contract.test.ts
│   └── failure-safety.contract.test.ts
├── integration/
│   ├── end-to-end.test.ts
│   ├── host-module.test.ts
│   └── bundle-shape.test.ts
└── unit/
    ├── pipeline/
    ├── transport/
    ├── context/
    └── internal/telemetry/

examples/
├── host-app/                         # single-app consumer example
└── federated-module/                 # module consumer example

package.json
tsconfig.json
tsup.config.ts
vitest.config.ts
```

**Structure Decision**: Single-package repository layout with all source under
`src/`, tests under `tests/`, and two minimal example consumers under
`examples/`. The package is published as one npm artifact. Internal layering is
enforced by directory boundaries: nothing outside `src/internal/telemetry/otel/`
may import `@opentelemetry/*`, and nothing outside `src/api/` and `src/index.ts`
contributes to the public surface.

## Complexity Tracking

*No constitution violations. No entries required.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
