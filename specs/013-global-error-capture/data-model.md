# Phase 1 Data Model: Catch the Silent Errors — Opt-in `./capture`

The feature's "data" is the small set of runtime entities the capturer creates and the shape of the
event it emits. It reuses the existing `LogEvent` / `ErrorInfo` / `LogContext` types unchanged; it
adds only the capture API's option/disposer types.

## Entities

### GlobalErrorCaptureOptions (new public type)

Options for `installGlobalErrorCapture`.

| Field | Type | Notes |
|-------|------|-------|
| `target` | `EventTarget` (optional) | Where to attach listeners. Default `globalThis`. Enables deterministic tests and non-`window` hosts. |
| `onInternalError` | `(err: Error) => void` (optional) | Diagnostics hook for the **capturer's own** failures (event-build/dispatch throw). Invoked fail-safe (its own throw is swallowed). Distinct from the runtime's `onInternalError`. |

**Validation rules**
- Both optional. If `target` lacks `addEventListener` (e.g., SSR/worker), install is a **safe no-op**
  returning a no-op disposer (never throws).

### GlobalErrorCaptureDisposer (new public type)

`type GlobalErrorCaptureDisposer = () => void` — removes the installed listeners and stops capture.

**Validation rules**
- **Idempotent**: calling it more than once is a no-op after the first (a `disposed` flag guards it).

### Error Capturer (internal)

The installed unit (closure state of one `installGlobalErrorCapture` call).

| Field | Type | Notes |
|-------|------|-------|
| `logger` | `Logger` | The host's handle; captured errors emit via `logger.error`. |
| `target` | `EventTarget` | Resolved attach target. |
| `errorHandler` / `rejectionHandler` | bound functions | The `addEventListener` callbacks. |
| `inFlight` | boolean | Re-entrancy guard (loop-safety, FR-012). |
| `disposed` | boolean | Idempotent-dispose guard. |

**State transitions**
```text
install → (listeners attached, disposed=false)
   on 'error'/'unhandledrejection' → if !inFlight && !disposed:
        inFlight=true → logger.error(...) [pipeline] → inFlight=false   (all in try/catch)
   dispose() → if !disposed: removeEventListener×2, disposed=true
             → (subsequent dispose()/events: no-op)
```

### Captured Error Event (emitted `LogEvent` — existing shape)

What `logger.error` produces for a captured error (no new type; documents the populated fields):

| Field | Value |
|-------|-------|
| `level` | `'error'` |
| `message` | `'Uncaught exception'` or `'Unhandled promise rejection'` |
| `error` | `ErrorInfo` from `reduceError(event.error / event.reason / synthesized)` — `{name, message, stack?}` |
| `attributes` | `{ 'safesignal.source': 'global-error-capture', 'safesignal.errorType': 'uncaught-exception' \| 'unhandled-rejection', …(filename/lineno/colno when synthesized) }` — then sanitized + redacted by the pipeline |
| `context` | the host runtime's identity (application/module/environment) via the `Logger` |

**Validation rules**
- The event MUST pass through the **same** sanitize → URL-scrub → redact → guard → transport pipeline
  as any `logger.error` call (fail-closed: a redactor/sanitizer failure drops the event).
- The source attributes are namespaced (`safesignal.*`) to avoid colliding with consumer attributes.

## Relationships

```text
host: configureLogging(...)            // owns the runtime (Principle VIII)
host: const log = getRootLogger()      // or createLogger({ module }) — a handle over that runtime
host: const dispose =
        installGlobalErrorCapture(log, { /* target?, onInternalError? */ })
                       │
   global 'error' / 'unhandledrejection'  ──▶  Error Capturer (fail-safe, loop-safe)
                       │                          └─ logger.error(msg, sourceAttrs, errorValue)
                       ▼                                        │
            (existing pipeline) sanitize → scrub → redact → guard → SafeTransport[]
                       ▼
            host's configured transports receive a redacted, attributed error event
   host: dispose()                      // removeEventListener×2; idempotent
```

*Federation*: a federated **module** only ever calls `createLogger({ module })` — it never calls
`installGlobalErrorCapture`. Duplicate package copies are **isolated**: each copy's capturer uses a
`Logger` from that copy and emits through that copy's runtime.
