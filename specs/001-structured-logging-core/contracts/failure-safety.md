# Contract: Failure Safety

## Hard invariant

No code path in the package may throw or reject into a consumer call site
during normal logging. All emission methods return synchronously and never
throw. All `Promise`s returned by transports are isolated.

## Required behavior

| ID    | Scenario | Required behavior |
|-------|----------|--------------------|
| FS-1  | `Transport.send()` throws synchronously | Caught in `SafeTransport`; consumer call site sees no error; `onInternalError` invoked once per transport per session |
| FS-2  | `Transport.send()` returns a rejected Promise | Rejection swallowed; no unhandled rejection; `onInternalError` invoked once per transport per session |
| FS-3  | No transports configured | `NoopTransport` installed automatically; emissions succeed silently |
| FS-4  | Configured `Redactor` throws | Event is dropped (fail-closed); `onInternalError` invoked |
| FS-5  | `correlation()` callback throws | Callback output dropped for that event; event is emitted with base context |
| FS-6  | Internal `TelemetryBackend.init()` fails | Backend is swapped for `NoopBackend`; transports still receive events directly; `onInternalError` invoked |
| FS-7  | Internal `TelemetryBackend.handle()` throws | Event is routed to transports through a direct fallback path |
| FS-8  | Non-serializable attribute value | Coerced per `log-event` sanitization rules; never throws |
| FS-9  | Cyclic reference in attributes | Replaced with `"[Circular]"`; never throws |
| FS-10 | Logging called before `configureLogging()` | Root logger uses safe defaults (`warn`+, `NoopTransport`, env-unknown); never throws |
| FS-11 | One transport throws while others succeed | Other transports still receive the event |
| FS-12 | Repeated failures from one transport | No log spam: only the first failure produces an `onInternalError` per transport per session |

## Production-mode no-throw test

A high-volume contract test emits 1000 events in a tight loop with:

- a transport whose `send()` throws on every call
- a transport whose `send()` returns a rejected Promise on every call
- a `correlation()` that throws on every call

The test asserts:
- the loop completes
- no exception escapes any emission
- no unhandled rejection is detected (`process.on('unhandledRejection')` /
  `window.addEventListener('unhandledrejection')` instrumented by the test)
- `onInternalError` is called at most once per failing transport
- the loop's wall-clock time is < 100ms in CI (no synchronous blocking)

## Observability of internal errors

Internal errors are visible to consumers ONLY through the optional
`onInternalError` hook. The package does not call `console.error` itself;
diagnostics are opt-in.

## Forbidden behavior

- The package MUST NOT call `setTimeout(fn, 0)` retries for failing transports
  in v1 (would risk runaway loops on persistent failures).
- The package MUST NOT install a global `unhandledrejection` listener or any
  other global side effect.
- The package MUST NOT throw at import time. All side-effectful work is
  deferred to `configureLogging()` or first emission.
