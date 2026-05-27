# Contract: Failure Safety

## Hard invariant

No code path in the package may throw or reject into a consumer call site
during normal logging. All emission methods return synchronously and never
throw. All Promises returned by transports are isolated.

## Required behavior

| ID    | Scenario | Required behavior |
|-------|----------|--------------------|
| FS-1  | `Transport.send()` throws synchronously | Caught in `SafeTransport`; consumer call site sees no error; `onInternalError` invoked once per transport per session |
| FS-2  | `Transport.send()` returns a rejected Promise | Rejection swallowed; no unhandled rejection; `onInternalError` invoked once per transport per session |
| FS-3  | No transports configured | `NoopTransport` installed automatically; emissions succeed silently |
| FS-4  | Configured `Redactor` throws | Event is **dropped** (fail-closed); `onInternalError` invoked |
| FS-5  | `correlation()` callback throws | Callback output dropped for that event; event is emitted with base context |
| FS-6  | Internal `TelemetryBackend.init()` fails | Backend is swapped for `NoopBackend`; transports still receive events directly; `onInternalError` invoked |
| FS-7  | Internal `TelemetryBackend.handle()` throws | Event is routed to transports through a direct fallback path |
| FS-8  | Non-serializable attribute value | Coerced per sanitization rules; never throws |
| FS-9  | Cyclic reference in attributes | Replaced with `"[Circular]"`; never throws |
| FS-10 | Logging called before `configureLogging()` | Root logger uses safe defaults (`warn`+, `NoopTransport`, env-unknown); never throws |
| FS-11 | One transport throws while others succeed | Other transports still receive the event |
| FS-12 | Repeated failures from one transport | No log spam: only the first failure per transport per session produces an `onInternalError` |
| FS-13 | Sanitizer encounters a class instance, DOM node, or framework object | Replaced with `"[<TypeTag>]"`; getters are NOT invoked; never throws |
| FS-14 | Sanitizer hits depth/size/count limits | Truncates with documented marker; never throws |
| FS-15 | URL scrubber fails to parse a URL-shaped string | Returns input unchanged; redactor still gets a shot at it |
| FS-16 | `ControlCharGuard` encounters unexpected input | Escapes what it can; never throws |
| FS-17 | `sanitizerLimits` outside Min..Max | Clamped; one `onInternalError` notice at `configureLogging()` |

## Production-mode no-throw stress test

A contract test emits 1000 events in a tight loop with:

- a transport whose `send()` throws on every call
- a transport whose `send()` returns a rejected Promise on every call
- a `correlation()` that throws on every call
- a custom `redactor` that throws on roughly half the events
- an oversized cyclic attribute object

The test asserts:
- the loop completes
- no exception escapes any emission
- no unhandled rejection (`window.addEventListener('unhandledrejection')` or
  Node `process.on('unhandledRejection')` instrumented by the test)
- `onInternalError` is called at most once per failing transport
- events with a throwing redactor are **not** delivered (fail-closed)
- events with successful redaction ARE delivered to surviving transports
- the loop's wall-clock time is < 100ms in CI (no synchronous blocking)

## Observability of internal errors

Internal errors are visible to consumers ONLY through the optional
`onInternalError` hook. The package does not call `console.error` itself;
diagnostics are opt-in.

## Forbidden behavior

- The package MUST NOT call `setTimeout(fn, 0)` retries for failing
  transports in v1 (would risk runaway loops on persistent failures).
- The package MUST NOT install a global `unhandledrejection` listener or any
  other global side effect.
- The package MUST NOT throw at import time. All side-effectful work is
  deferred to `configureLogging()` or first emission.
- The package MUST NOT emit a partial event when redaction fails. Fail-closed
  means drop, not "best-effort send".
