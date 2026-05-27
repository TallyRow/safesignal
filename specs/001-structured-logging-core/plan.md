# Implementation Plan: Core Structured Logging API

**Branch**: `001-structured-logging-core` | **Date**: 2026-05-26 (revised 2026-05-27, then revised 2026-05-27 for vendor-neutral core) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-structured-logging-core/spec.md`

**Constitution**: `.specify/memory/constitution.md` v1.2.0

## Summary

Deliver a **browser-first, vendor-neutral, framework-neutral logging facade and
safety boundary**. The package is a small stable public API
(`Logger`, levels, structured events, context, `Transport`) plus a fixed
sanitization → URL-scrub → redaction → control-char-guard → optional-dev-freeze
security pipeline. Its only delivery primitive is the `Transport` interface;
the core dispatcher fans sanitized + redacted `LogEvent`s out to configured
transports **directly**, with no telemetry-vendor SDK on the default path.

The core package works **without** OpenTelemetry, Datadog, Sentry, or any
other observability vendor SDK installed. Vendor integrations are explicitly
**future, optional transport adapters** (or, eventually, optional backends) —
peers of each other, with no privileged status for any one vendor — and live
out of band of v1.

Secure logging and sensitive-data minimization are **first-class architectural
concerns**, not afterthoughts. Every emission flows through
`LevelFilter → EventBuilder → Sanitizer → URLScrubber → Redactor →
ControlCharGuard → Freeze(dev) → Transport fan-out` before any transport
receives an event. Transports never see raw user input. Redaction failure
drops the affected event (fail-closed).

`Logger` instances are **lightweight context handles** over a single shared
**ConfiguredRuntime** per package/runtime boundary. Constructing a logger does
no transport wrapping, no global listener setup, no network work, no
timer/queue allocation, no ambient state read, and **no vendor-SDK
initialization**; expensive resources exist once per `configureLogging()`
invocation and are shared across every logger derived from that runtime. This
is what allows the package to scale to the many-loggers-per-page model (one
logger per federated module is normal) without compounded observability
weight.

The package degrades safely on every failure (transport, redaction,
serialization) and preserves a stable, vendor-neutral contract so application-
owned ingestion and future optional vendor adapters can be added without
consumer call-site changes.

## Technical Context

**Language/Version**: TypeScript 5.4+ targeting ES2020 with DOM lib; strict mode on.

**Primary Dependencies**:
- Runtime: **none**. The core package has no observability-vendor runtime
  dependencies. The default `Transport` interface ships with two built-ins
  (`ConsoleTransport`, `NoopTransport`); consumers supply their own transports
  for delivery. The package works with `npm install` of zero vendor SDKs.
- **No vendor SDKs in core**: OpenTelemetry (`@opentelemetry/*`), Datadog
  (`@datadog/*`, `dd-rum`, etc.), Sentry (`@sentry/*`), and any other
  observability-vendor SDK are explicitly **not** required runtime
  dependencies of the core package. The bundle-shape test (T049) and the
  vendor-free audit (T070, renumbered Polish task) enforce that the default
  built entry does not import or expose any vendor SDK.
- **Vendor adapters** (future, optional): OpenTelemetry, Datadog, Sentry,
  and other vendor integrations are treated as **future optional transport
  adapters** — peers of each other, with no special status for any single
  vendor. They live in separate subpaths or separate packages introduced by
  follow-up feature specs. Existing OTel adapter code in
  `src/internal/telemetry/otel/**` is retained as a non-default reference
  implementation that documents the seam for the eventual OTel adapter
  feature; it is **not** wired into v1's default path and contributes no
  weight to the v1 core bundle (T066 dispatcher refactor + T070 vendor-free
  audit assert this).
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
- **Logger construction is constant-cost.** Creating any `Logger`
  (`createLogger`, `child`, `withContext`, `getRootLogger`) MUST allocate
  only a small handle object referencing the shared runtime; it MUST NOT
  invoke a `TransportFactory`, init a `TelemetryBackend`, register a timer
  or interval, attach a global listener, patch a global, perform any I/O,
  or read ambient browser state. The package MUST scale to ≥1,000 logger
  instances on a single page without compounded backend/transport
  initialization (locked by SC-011).
- Cold-load cost of the package ≤ ~15 KB minified+gzipped for the **vendor-
  free core path**, which in v1 is the only shipped path (security pipeline +
  direct transport fan-out + `ConsoleTransport` / `NoopTransport`). Future
  vendor adapters (OTel, Datadog, Sentry, etc.) ship as separate optional
  transports/packages and have their **own** bundle/performance budgets
  defined per-adapter feature spec; their cost MUST NOT be amortized against
  the core target.

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

*GATE: Passes against constitution v1.2.0. Re-checked post-design (see end of
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
- **Lightweight Logger Instances & Federated Runtime (Principle VII, new in
  v1.2.0)**:
  - `createLogger()`, `child()`, `withContext()`, `getRootLogger()` MUST be
    constant-cost handle allocations against the shared `ConfiguredRuntime` —
    no backend init, no `TransportFactory` invocation, no timer, no global
    listener, no console/`fetch`/`sendBeacon` patch, no network work, no
    ambient read.
  - Expensive runtime resources (backend, wrapped `SafeTransport[]`, redactor,
    sanitizer limits, `onInternalError` sink) are owned by the
    `ConfiguredRuntime` produced by `configureLogging()` and shared across
    every logger derived from it (FR-029, FR-030).
  - Host applications own the configured runtime by default. Federated modules
    SHOULD only call `createLogger()` / `child()` / `withContext()`; if a
    module calls `configureLogging()` it replaces the active runtime through
    the same single named API (no silent module-level override). Behavior
    of retained `Logger` references across re-configuration is documented in
    `contracts/logger-config.md` and locked by SC-012 (FR-031, FR-032).
  - Duplicate-package-copy behavior is classified as **isolated**: each
    physical copy of the package on a page owns an independent
    `ConfiguredRuntime`. The package deliberately avoids any shared global
    registry. For sharing across copies, module-federation singleton sharing
    is the recommended pattern, documented in `quickstart.md` (FR-033).
  - Scale is verified by an explicit ≥1,000-logger contract test that asserts
    backend init / transport-factory invocation does NOT scale with logger
    count (SC-011).
- **Test & Documentation Coverage**: see [Testing Strategy](#testing-strategy);
  full security test sweep (`tests/security/`) covers SC-008 / SC-009 / SC-010
  and FR-012 through FR-021; new multi-instance / federated test sweep
  (`tests/performance/` + `tests/integration/`) covers SC-011, SC-012, SC-013
  and FR-029 through FR-033.

**Result**: PASS. No violations; Complexity Tracking left empty.

## Technical Architecture Overview

The package is a layered pipeline. Each layer has one job and a single owner
interface. Sanitization and redaction are part of the pipeline — they happen
before any backend or transport sees the event. `Logger` instances are
**handles** into a single shared `ConfiguredRuntime`; the runtime owns the
pipeline, backend, and wrapped transports.

```text
┌─────────────────────────────────────────────────────────────┐
│ 0. App / federated module                                   │
│    Calls logger.debug/info/warn/error(message, attrs).      │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ 1. Logger handle  (src/api)                                 │
│    Lightweight immutable record returned by createLogger /  │
│    child / withContext / getRootLogger:                     │
│    { name?, levelOverride?, mergedContext, runtimeRef }.    │
│    Construction does NO transport wrap, NO vendor-SDK init, │
│    NO global patch, NO timer, NO I/O. Many handles per page │
│    (one per federated module is normal) all reference the   │
│    same runtimeRef.                                         │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ 2. ConfiguredRuntime  (src/runtime — produced by            │
│    configureLogging())                                      │
│    Owns: normalized config, SafeTransport[] (already        │
│    wrapped), redactor, sanitizerLimits, onInternalError,    │
│    correlation hook. ONE instance per package/runtime       │
│    boundary; replaced atomically on re-configuration.       │
│    Does NOT hold a telemetry backend — fan-out is direct.   │
└────────────────────────────┬────────────────────────────────┘
                             │ raw user input + merged context
┌────────────────────────────▼────────────────────────────────┐
│ 3. Pipeline  (src/pipeline) — security boundary             │
│    a. LevelFilter         (env-aware drop-fast; runs        │
│                            FIRST so filtered-out events     │
│                            never allocate an event object)  │
│    b. EventBuilder        (assemble canonical LogEvent)     │
│    c. Sanitizer           (depth/size/type coercion;        │
│                            non-serializable →               │
│                            "[Unserializable]"; cyclic →     │
│                            "[Circular]"; framework/DOM      │
│                            objects → "[<TypeTag>]")         │
│    d. URLScrubber         (strip sensitive query/fragment   │
│                            params from URL-shaped strings)  │
│    e. Redactor            (sensitive-key denylist; fail-    │
│                            closed; runs AFTER sanitize so   │
│                            nested structures are reachable) │
│    f. ControlCharGuard    (escape control chars in strings) │
│    g. Freeze (dev only)   (Object.freeze recursively)       │
│    h. Dispatcher          (direct transport fan-out;        │
│                            iterates runtime.transports and  │
│                            calls SafeTransport.send() on    │
│                            each. NO backend layer.)         │
└────────────────────────────┬────────────────────────────────┘
                             │ sanitized + scrubbed + redacted
                             │ + escaped + (dev-)frozen LogEvent
┌────────────────────────────▼────────────────────────────────┐
│ 4. Transport fan-out  (src/transport)                       │
│    SafeTransport wraps each consumer Transport at           │
│    configureLogging() time (NOT at logger construction).    │
│    Each transport is invoked independently; sync throws     │
│    and rejected Promises are isolated.                      │
│      - ConsoleTransport (built-in)                          │
│      - NoopTransport    (built-in)                          │
│      - <consumer-provided Transport>                        │
│      - <future optional vendor adapters: OTel transport,    │
│         Datadog transport, Sentry transport — all separate, │
│         opt-in, none privileged>                            │
└─────────────────────────────────────────────────────────────┘
```

The **locked secure pipeline order** at emit time is:

```text
LevelFilter → EventBuilder → Sanitizer → URLScrubber → Redactor →
ControlCharGuard → Freeze(dev) → Dispatcher → SafeTransport.send()
```

This is the actual runtime order in code: `LevelFilter` runs in `logger.ts`
before any event allocation; `EventBuilder` builds the `LogEvent`; the
dispatcher then runs `Sanitizer → URLScrubber → Redactor → ControlCharGuard
→ Freeze(dev)` and finally iterates `runtime.transports` invoking
`SafeTransport.send()` on each. Tests
(`tests/security/pipeline-order.security.test.ts`, T048) lock this order.

**Security invariant**: no transport — built-in or consumer-provided or
future vendor adapter — receives raw user input. Sanitization, URL
scrubbing, redaction, control-character guarding, and the dev-only freeze
all run **before** any transport's `send()` is invoked. If the redactor
throws or returns a non-event value, the affected event is dropped
entirely (fail-closed) and `onInternalError` is invoked — no transport
sees a partially-processed event.

## Runtime Scale Architecture (Principle VII)

`Logger` is a lightweight context handle, not a runtime. The architecture
guarantees scalability to many loggers per page through a strict separation
between **handles** (cheap, many) and the **shared ConfiguredRuntime** (expensive,
exactly one per package/runtime boundary).

### Handle vs. Runtime

| Component               | Owned by             | Cost per instance | Lifetime |
|-------------------------|----------------------|-------------------|----------|
| `Logger` handle         | Application / module | Allocation of a small object reference; no I/O | As long as caller retains the reference |
| `ConfiguredRuntime`     | The package (one per `configureLogging()`) | Normalized config, `SafeTransport[]` wrapping, redactor compile, sanitizer-limit clamp, `onInternalError` install. **No telemetry backend** — fan-out goes straight from the dispatcher to the wrapped transports. | Until next `configureLogging()` or page unload |

`createLogger(options?)`, `child(context)`, `withContext(context)`, and
`getRootLogger()` return new handles that all reference the **same**
`ConfiguredRuntime`. Handle construction MUST:

- Allocate one small immutable object: `{ name?, levelOverride?, mergedContext, runtimeRef }`.
- Compute `mergedContext` by shallow-merging the parent's already-merged context
  with the new context (deep-merge only on `context.attributes`). Merge is pure;
  parents are unaffected.
- Read no ambient state.

Handle construction MUST NOT:

- Initialize **any vendor SDK** (OpenTelemetry, Datadog, Sentry, etc.) — the
  core has no such SDKs to initialize; future vendor adapters live in their
  own transports.
- Invoke a `TransportFactory` or wrap a transport in `SafeTransport` —
  transport wrapping is a `configureLogging()` responsibility.
- Register a timer, interval, microtask, scheduled callback, or batching loop.
- Attach a global event listener; patch a global (`console`, `fetch`,
  `XMLHttpRequest`, `navigator.sendBeacon`, `window.onerror`,
  `window.onunhandledrejection`, etc.); or install a document/window observer.
- Perform any network work or other I/O.
- Read ambient browser state (`location`, `document.cookie`, storage,
  `navigator.*`, env vars).
- Allocate per-instance buffers or queues.

Hard contract: per-instance memory MUST stay O(merged context size) and per-
instance work MUST stay O(merge cost), independent of the number of other
loggers on the page or the number of transports configured.

### Re-configuration semantics (FR-031)

`configureLogging()` is idempotent across the same call site and atomic across
the active runtime:

1. Construct the new `ConfiguredRuntime` (resolve config, wrap each
   `Transport` in `SafeTransport`, compile redactor, clamp sanitizer limits,
   install `onInternalError`).
2. Atomically swap the package-level `runtimeRef` from the previous runtime
   to the new one.
3. Call `flush()` then `shutdown()` on each previously-wrapped transport
   (each call isolated; failures route to the *previous* runtime's
   `onInternalError`).

Existing `Logger` references continue to work because they read the
package-level `runtimeRef` at emit time — they hold a reference to the
package-level slot, not to a specific runtime snapshot. After swap, an
event emitted through an old handle is dispatched through the new runtime
(new pipeline state → new transports). This is the documented behavior
locked by SC-012.

Calling `getRootLogger()` before `configureLogging()` returns a usable
handle backed by the default safe-defaults runtime (warn+ level,
`NoopTransport`, environment=unknown, default redactor, default sanitizer
limits). After a later `configureLogging()` call, that same handle picks
up the new runtime through the same `runtimeRef` slot.

### Configuration ownership: host vs. federated module

| Caller                  | Recommended public API                  | Effect |
|-------------------------|------------------------------------------|--------|
| Host application        | `configureLogging({ ... })` at app boot | Installs the active `ConfiguredRuntime`. Owns transports, redactor, backend selection. |
| Federated module        | `createLogger({ module, context })`, `child()`, `withContext()` | Adds a logger handle attributed by `context.module`. Shares the host's `ConfiguredRuntime`. |
| Federated module (last resort) | `configureLogging({ ... })` | Replaces the active runtime through the same single named API. NOT silent: this is a documented override and MUST be coordinated with the host. The package emits no warning here because the call is explicit; documentation in `quickstart.md` calls it out as a non-default pattern. |

Locked invariant (FR-032): the package has exactly one public function for
installing a runtime (`configureLogging`). There is no implicit module-level
side-effect-on-import that replaces the runtime. Importing the package, calling
`createLogger`, calling `child`, calling `withContext` — none of these install
or replace the runtime.

### Duplicate package-copy behavior (FR-033)

**Classification chosen for v1: isolated.**

When module bundlers cause multiple physical copies of this package to load
on a single page (host loaded one copy; a federated module bundled its own),
each copy maintains its own internal `runtimeRef` slot — they do not share
state through any global registry. The package deliberately uses **module-scoped
state**, not `globalThis` / `window` / a `Symbol.for()`-keyed registry, to
keep boundaries explicit. Each copy must therefore be configured independently.

Consequences and consumer guidance (documented in `quickstart.md` and
`docs/safe-logging.md`):

1. **Default: isolated.** Each copy = independent runtime. Each copy's
   loggers deliver to that copy's transports only. Events from sibling
   copies are not cross-routed.
2. **Recommended sharing pattern: module-federation singleton.** If
   consumers want host and federated modules to share a single
   `ConfiguredRuntime`, they MUST configure their bundler's
   module-federation `shared` map to mark this package as a singleton.
   No package-level workaround is provided; this is a build-time
   responsibility, not a runtime one. Documentation calls this out as
   the supported sharing strategy.
3. **Not provided: a shared global registry.** A `globalThis`-keyed
   shared singleton would be implicit and silent and would couple every
   page that loads two copies of the package. We reject this for the
   same reason we reject ambient state reads: it surprises consumers and
   is harder to test. Consumers who genuinely need cross-copy sharing
   use the bundler hook above.

T065 in tasks.md is the documentation task that captures this contract
for consumers; T064 is the integration test that locks the isolation
classification.

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

### `src/internal/telemetry/` — Future optional vendor-adapter seam (NOT on v1 default path)

- **Status**: retained as a documented future-adapter seam. Not constructed
  or called by any v1 default code path; `src/index.ts` does not reach into
  this subtree. See "Vendor-Neutral Core Architecture" for the v1 stance.
- `backend.ts`: `TelemetryBackend` interface (reserved; not used by the
  default dispatcher after the T066 refactor).
- `noop-backend.ts`: no-op backend; reserved (not used by the default
  dispatcher).
- `otel/otel-backend.ts`: constructs an OTel `LoggerProvider` and emits via
  it. Imports of `@opentelemetry/*` happen **only** here and in sibling
  files. Future OTel-adapter feature work will decide whether this stays as
  a backend, becomes a `Transport`, or is replaced.
- `otel/mapping.ts`: bidirectional `LogEvent ↔ OTel LogRecord` mapping.
- `otel/event-bridge.ts`: custom `LogRecordProcessor`.

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
- ≥ 90% line coverage in `src/pipeline/`, `src/transport/`, `src/internal/`,
  `src/runtime/` (the `ConfiguredRuntime` module added by this revision).
- 100% line coverage in `src/pipeline/sanitizer.ts`, `src/pipeline/redactor.ts`,
  `src/pipeline/url-scrubber.ts`, `src/pipeline/control-char-guard.ts`.
- Constant-cost guarantees (Principle VII) are coverage-orthogonal: lightweight-
  logger and scale tests assert structural invariants (zero factory calls,
  zero timers, O(N) allocations) rather than just line execution.

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
- `bundle-shape.security.test.ts` — the published `.d.ts` does not contain
  the strings `opentelemetry` / `@opentelemetry`, `@datadog` / `dd-rum`,
  `@sentry`, or any other observability-vendor package name; and contains
  no vendor-specific identifier (`SeverityNumber`, `LoggerProvider`, `Span`,
  `Trace*`, `Exporter`, `Processor`, `Hub`, etc.). The published runtime
  entry does not import any vendor SDK and does not re-export anything from
  `src/internal/**`.
- `context-through-pipeline.security.test.ts` (new in this revision):
  asserts that every form of context input — `LoggerConfig.context`,
  per-`createLogger` `context`, per-`child()` / `withContext()` context,
  and `correlation()` return values — passes through the sanitizer and
  redactor **before** any transport's `send()` is invoked. Uses
  `makeSecretFixture()` placed in each of those four context slots and
  confirms masking in the `LogEvent` received by an in-memory transport.
  Complements `tests/security/context-boundary-safety.test.ts` (T055) by
  covering every entry point in one sweep.

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
  `secret-leakage.test.ts` running through the full pipeline (NoopBackend +
  in-memory transport) for v1. When the future OTel opt-in feature lands,
  this test sweep extends to cover the OTel backend path as well.
- `host-many-module-loggers.integration.test.ts` (T063): a host calls
  `configureLogging()` once; many simulated module entry points each call
  `createLogger({ module })`. Asserts every module's events reach the host-
  configured transports, the `context.module.name` field is distinct per
  module, and the host's redactor / sanitizerLimits apply uniformly across
  every module's events.
- `reconfigure-existing-references.integration.test.ts` (T061): retains
  multiple `Logger` references created at different times (before and after
  the first `configureLogging()`); calls `configureLogging()` again with a
  fresh transport set; asserts every retained reference emits through the
  new transports and the previous backend/transport `shutdown`/`flush`
  hooks were invoked.

### Performance & scale tests (`tests/performance/`)

New test directory for Principle VII verification:

- `lightweight-logger.contract.test.ts` (T059): asserts that constructing
  `createLogger()`, `child()`, `withContext()`, and `getRootLogger()`
  invokes zero `TransportFactory` calls (factories are wrapped with spies
  installed before construction), zero `setTimeout` / `setInterval` /
  `requestAnimationFrame` / `queueMicrotask` calls, zero global listener
  attachments (asserted by checking `EventTarget.prototype.addEventListener`
  spies before/after), zero `console`/`fetch`/`XMLHttpRequest`/`sendBeacon`
  patches, and zero network calls. Each handle creation is asserted to
  allocate only a constant number of objects (counted via a per-test
  allocation probe). Locks FR-029.
- `many-logger-scale.performance.test.ts` (T060): creates ≥1,000 logger
  instances (mix of root + per-module + derived `child()`/`withContext()`)
  against a single `configureLogging()` call. Asserts (a) the registered
  `TransportFactory` is invoked exactly once during `configureLogging()`
  and zero additional times during the 1,000 logger creations,
  (b) `TelemetryBackend.init()` is invoked exactly once, and (c) total
  allocations are O(N) in logger count (not O(N×K) where K = transports
  or attribute count). Locks SC-011.
- `child-non-mutation.test.ts` (T062): a parent logger creates many
  `child()` derivations; assertions confirm the parent's merged context
  is structurally unchanged (deep-equal before/after) and that mutating
  a derived logger's context cannot mutate the parent.
- `shared-runtime-fanout.test.ts` (also in T060): many module loggers
  emit through one shared runtime; asserts every configured transport
  receives every event exactly once and that fan-out is sequential per
  emission (no event reordering between sibling transports).

### Duplicate-package-copy behavior tests (`tests/integration/`)

- `duplicate-copy-isolation.integration.test.ts` (T064): simulates
  two physical loads of the package (via `vi.isolateModules()` or two
  separate `import()` of distinct path aliases pointing at the same
  source). Asserts the two `ConfiguredRuntime`s are independent: configuring
  one does not affect the other; loggers from one cannot deliver to the
  other's transports. Locks FR-033 for the "isolated" classification.

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

- **Vendor-SDK weight and coupling** (resolved by this revision): the core
  package depends on **no** observability-vendor SDKs. OpenTelemetry,
  Datadog, Sentry, and other vendors are reframed as **future optional
  transport adapters**, peers of each other. The previously inconsistent
  "OTel as hidden default backend / OTel excluded from bundle target" state
  is gone — the dispatcher fan-out is direct (T066) and the dependency-pins
  audit (T070) asserts the core has zero vendor SDKs. See "Vendor-Neutral
  Core Architecture" section above.
- **Multiple package instances under module federation** (resolved by this
  revision): the package classifies duplicate-copy behavior as **isolated**
  (FR-033). Each physical copy owns an independent `ConfiguredRuntime`; no
  global registry. Module-federation singleton sharing is the recommended
  pattern for consumers who need cross-copy sharing. Locked by an
  integration test (T064).
- **Per-Logger expensive resource creation** (mitigated by Principle VII
  enforcement): the lightweight-logger contract test (T059) and the
  ≥1,000-instance scale test (T060) assert that handle construction does
  no init / transport wrapping / global listener / timer / queue work.
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

## Vendor-Neutral Core Architecture (resolved 2026-05-27, second revision)

### Summary of the architectural pivot

The first plan revision selected "OTel deferred, NoopBackend default"
(spec.md Option B). This second revision goes further: it removes the
`TelemetryBackend` layer from the default emit path entirely and reframes
OpenTelemetry as **one of several future optional transport adapters**,
with no privileged status relative to Datadog, Sentry, or other vendors.

The core dispatcher's last pipeline step is **direct `SafeTransport.send()`
fan-out** — there is no intermediate backend object. `NoopBackend` and
`TelemetryBackend` survive in the source tree as documented seams for the
future vendor-adapter feature work, but the v1 default code path does not
construct or call them.

### Why this revision (and not the prior "deferred but wrapped" framing)

1. **Vendor neutrality is the contract**, not "OTel-is-the-blessed-one-pending-
   opt-in." Treating OTel as a hidden default backend — even a no-op one —
   privileges OTel's data model over peers. Future Datadog or Sentry adapters
   would need to either pretend to be `TelemetryBackend`s or carve out
   parallel paths, neither of which scales.
2. **The simplest correct dispatcher is direct fan-out.** With sanitization
   and redaction guaranteed by the pipeline upstream, the dispatcher's only
   remaining job is "deliver `LogEvent` to every configured transport." A
   backend layer between the pipeline and the transports has no behavioral
   role in v1 — it is dead architecture.
3. **Future vendor adapters are peers.** When the follow-up feature(s) ship
   OTel, Datadog, Sentry, or any other vendor support, each lands as an
   optional `Transport` (or as a separately-packaged adapter that returns a
   `Transport`). None of them is the "default" — the host application
   chooses by passing them in `LoggerConfig.transports`.

### What v1 actually ships

1. **No vendor SDKs in the core.** `package.json` `dependencies` carries no
   `@opentelemetry/*`, `@datadog/*`, `@sentry/*`, or any other observability-
   vendor package. The package works installed alone.
2. **Direct transport fan-out from the dispatcher.** `dispatcher.ts` ends
   with `for (transport of runtime.transports) { transport.send(event) }`
   (each transport is `SafeTransport`-wrapped at `configureLogging()` time,
   so sync throws and rejected Promises are isolated). The previous
   `backend.handle(event)` call is removed from the default path by T066
   (new refactor task — see Phase 7 in `tasks.md`).
3. **`TelemetryBackend` and existing OTel adapter retained as documented
   seam.** `src/internal/telemetry/backend.ts` and
   `src/internal/telemetry/otel/{otel-backend, event-bridge, mapping}.ts`
   remain in the source tree with their unit tests. They are dead code on
   the default runtime path (verified by T049 / T070) but document the
   shape the future vendor-adapter feature(s) will likely follow. If the
   future direction makes the backend abstraction superfluous, those files
   may be deleted entirely in that follow-up feature; this revision does
   not commit either way.
4. **No public vendor surface.** `LoggerConfig` carries no `backend` field
   and no vendor-specific knob; consumers cannot opt into OTel/Datadog/
   Sentry in v1 because there is nothing to opt into yet.
5. **Bundle-shape & vendor-free audit enforce the contract**:
   - `tests/security/bundle-shape.security.test.ts` (T049) asserts the
     built default entry does not import any `@opentelemetry/*` /
     `@datadog/*` / `@sentry/*` package and the built `.d.ts` contains no
     vendor-specific identifier (`SeverityNumber`, `LoggerProvider`,
     `Span`, `Trace*`, `Exporter`, `Processor`, etc.).
   - `tests/contract/dependency-pins.test.ts` (T070, renumbered Polish
     audit) asserts `package.json` `dependencies` contains **no**
     `@opentelemetry/*` / `@datadog/*` / `@sentry/*` packages. If the
     existing OTel adapter files need OTel types for their unit tests,
     those types live in `devDependencies` only; this is verified by the
     audit.

### Constitution alignment (v1.2.0)

- **I. Stable Consumer API**: public surface is unchanged and stays
  vendor-neutral. No `backend`, no `exporter`, no `processor`, no
  vendor-specific config field.
- **II. Browser Resilience & Failure Safety**: each transport is
  `SafeTransport`-wrapped at `configureLogging()` time; sync throws and
  rejected Promises are isolated per transport, so direct fan-out
  preserves the no-throw / no-reject invariant.
- **III. Framework-Neutral Structured Observability**: removing the
  backend layer makes neutrality literal — there is no place for a
  vendor data model to hide.
- **IV. Secure & Privacy-Safe Logging by Default**: pipeline order is
  unchanged (sanitize → URL-scrub → redact → guard → freeze → fan-out);
  fail-closed redaction still drops affected events before any transport
  sees them.
- **V. Testable, Minimal, Maintainable**: the dispatcher gets simpler
  (no backend indirection), the bundle gets smaller (no vendor SDK), and
  the test suites gain explicit vendor-free assertions.
- **VI. Log Integrity & Monitoring Suitability**: events still reach
  every configured transport unmutated post-pipeline; transport contract
  (body-only, HTTPS, no URL secrets) is unchanged.
- **VII. Lightweight Logger Instances & Federated Runtime**: handle
  construction does no vendor-SDK init (because there is no vendor SDK
  to init). `ConfiguredRuntime` is one object per `configureLogging()`,
  shared by every handle.

### Future vendor adapter strategy

Each future vendor integration (OTel, Datadog, Sentry, …) ships as a
separate feature spec that delivers:

- A `Transport` implementation (or a factory returning one) that conforms
  to `contracts/transport.md`'s safety contract.
- Either a separate subpath export (e.g., `/otel`, `/datadog`, `/sentry`)
  on this package, or — preferred for SDKs with significant dep weight —
  a separately-published companion package.
- Its own bundle/performance budget defined in its own plan.md; the v1
  core's ≤15 KB target is **not** amortized across these.
- Its own optional/peer-dependency declaration; the core's
  `dependencies` stays vendor-free.

None of those features are committed by this plan.

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
├── runtime/
│   ├── configured-runtime.ts         # ConfiguredRuntime: backend + wrapped
│   │                                 #   transports + redactor + sanitizer limits
│   │                                 #   + onInternalError. Produced by
│   │                                 #   configureLogging(). Owned by a single
│   │                                 #   module-scoped runtimeRef slot.
│   └── runtime-ref.ts                # Module-scoped active-runtime slot used by
│                                     #   every Logger handle at emit time
│                                     #   (no globalThis, no Symbol.for registry —
│                                     #    duplicate copies stay isolated).
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
│   ├── telemetry/                    # FUTURE OPTIONAL ADAPTER WORK — not
│   │                                 # wired into v1 default path. Retained
│   │                                 # as documented seam. Bundle-shape +
│   │                                 # dependency-pins tests assert nothing
│   │                                 # in src/index.ts reaches this subtree.
│   │   ├── backend.ts                # TelemetryBackend interface (future)
│   │   ├── noop-backend.ts           # No-op backend (future, not default)
│   │   └── otel/                     # FUTURE OTel adapter — only directory
│   │                                 # permitted to import @opentelemetry/*
│   │       ├── otel-backend.ts       # (future)
│   │       ├── event-bridge.ts       # (future)
│   │       └── mapping.ts            # (future)
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
│   ├── secret-sweep.integration.test.ts
│   ├── host-many-module-loggers.integration.test.ts
│   ├── reconfigure-existing-references.integration.test.ts
│   └── duplicate-copy-isolation.integration.test.ts
├── performance/
│   ├── lightweight-logger.contract.test.ts
│   ├── many-logger-scale.performance.test.ts
│   ├── child-non-mutation.test.ts
│   └── shared-runtime-fanout.test.ts
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

All seven principles (v1.2.0) PASS after the revised (vendor-neutral, direct-
fan-out) Phase 1 design:

- **I. Stable Consumer API**: surface is tightly scoped, safe path is the easy
  path (no `unknown` in message; constrained `Attributes`; no `dump` API).
  Public API stays vendor-neutral: no `backend`, no `exporter`, no
  `processor`, no vendor-specific config field. `ConfiguredRuntime` is
  internal-only. Public surface in this revision is unchanged from the
  prior plan revision.
- **II. Browser Resilience & Failure Safety**: every consumer-provided callable
  wrapped; fail-closed redaction; sanitizer never throws.
- **III. Framework-Neutral Structured Observability**: object-only output;
  bounded shape (depth/size/count); production defaults preserved.
- **IV. Secure & Privacy-Safe Logging by Default**: sanitize-then-redact
  pipeline upstream of every backend and transport; default denylist;
  sanitizer-limit clamp; URL scrubber; fail-closed. Pipeline order
  (`EventBuilder → LevelFilter → Sanitizer → URLScrubber → Redactor →
  ControlCharGuard → Freeze(dev) → Dispatcher → backend.handle → SafeTransport[]`)
  is unchanged by this revision.
- **V. Testable, Minimal, Maintainable**: dedicated `tests/security/` and new
  `tests/performance/` groups; examples demonstrate safe usage; no insecure
  patterns normalized; OTel deferral simplifies the v1 surface.
- **VI. Log Integrity & Monitoring Suitability**: events reach transports
  unmutated post-pipeline; stable attribution fields; transport contract
  requires POST body delivery (no URL leakage); v1 does not drop/sample/batch.
- **VII. Lightweight Logger Instances & Federated Runtime (new)**: handle
  vs. ConfiguredRuntime separation; logger construction allocates a small
  immutable object with no init/wrap/listener/timer/network/ambient-read
  work; expensive resources shared at the runtime level; host owns the
  configured runtime via the single named `configureLogging()` API;
  duplicate-package-copy classification is **isolated** with module-
  federation singleton sharing as the recommended cross-copy pattern.
  Locked by T058 (`ConfiguredRuntime` implementation), T059 (lightweight-
  logger contract), T060 (≥1,000-instance scale + shared-runtime-fanout),
  T061 (re-configuration semantics), T062 (child non-mutation), T063
  (host + many module loggers), T064 (duplicate-copy isolation),
  T065 (consumer documentation), T066 (dispatcher direct-fan-out
  refactor), and T070 (vendor-free audit).

## Complexity Tracking

*No constitution violations. No entries required.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
