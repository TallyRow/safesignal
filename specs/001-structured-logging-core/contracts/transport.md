# Contract: Transport

## Interface

```ts
interface Transport {
  name: string;
  send(event: LogEvent): void | Promise<void>;
  flush?(): Promise<void>;
  shutdown?(): Promise<void>;
}

type TransportFactory = () => Transport;
```

## Required behavior

| ID | Behavior |
|----|----------|
| T-1 | `send()` receives a `LogEvent` that has already passed the package pipeline (sanitized, redacted, control-char escaped) |
| T-2 | The package wraps every transport in `SafeTransport`; consumer code does not need to try/catch |
| T-3 | A synchronous throw from `send()` is caught and does NOT propagate to the emit call site |
| T-4 | A rejected Promise from `send()` is swallowed and does NOT cause an unhandled rejection |
| T-5 | One `onInternalError` notice per transport per session on first failure |
| T-6 | Subsequent failures from the same transport are silent (no log spam) |
| T-7 | A failing transport does NOT prevent other configured transports from receiving the event |
| T-8 | `flush()` and `shutdown()` are optional; the package no-ops if absent |
| T-9 | Replacing the transport list via `configureLogging()` does not require changes to existing logger call sites |

## Required behavior for consumer transports (security)

| ID | Behavior |
|----|----------|
| T-S1 | A consumer transport MUST NOT include any `LogEvent` data in a URL path, query string, or fragment |
| T-S2 | A consumer transport that delivers over the network MUST use request body (POST/PUT JSON, or `navigator.sendBeacon` with a JSON `Blob`) |
| T-S3 | A consumer transport MUST use HTTPS for any cross-origin delivery |
| T-S4 | A consumer transport MUST treat the received `LogEvent` as immutable |
| T-S5 | A consumer transport SHOULD tolerate `flush()` / `shutdown()` being called more than once |

These properties are testable via `assertTransportContract(transport)` from
the `/testing` subpath. The helper:
- intercepts global `fetch` and `navigator.sendBeacon` for the duration of
  the test
- emits several `LogEvent`s through the transport
- asserts every `fetch` URL contains no event-shaped data and no value from
  the test fixture (T-S1)
- asserts every `fetch`/`sendBeacon` call uses POST/PUT with a body or
  `Blob` (T-S2)
- asserts every URL starts with `https://` unless same-origin (T-S3)
- asserts the transport does not mutate `event` (T-S4)
- asserts `flush()`/`shutdown()` are idempotent (T-S5)

## Built-in: `ConsoleTransport`

```ts
const ConsoleTransport: TransportFactory;
```

- `name`: `'console'`.
- `send(event)`: calls `console[event.level](event.message, event)` where
  `event.message` is the already-escaped string and `event` is the full
  structured object. The message is **never** interpolated with attribute
  values into a single string at this layer.
- Falls back to `console.log` only if `console[level]` is not a function.
- `flush()` / `shutdown()`: not implemented.

## Built-in: `NoopTransport`

- `name`: `'noop'`.
- `send(event)`: returns immediately.
- Used as the automatic fallback when `transports` is empty or undefined.

## Multi-transport semantics

- Events dispatched to all configured transports in registration order.
- Dispatch is fire-and-forget. The pipeline does NOT `await` Promises
  returned by `send()`.
- `flush()` iterates all transports and awaits each individually; one
  transport's flush failure does not block others.

## Forbidden behavior

- A transport MUST NOT mutate the received `LogEvent`. The package freezes
  events in dev builds.
- A transport MUST NOT depend on package internals (no imports from
  `src/internal/**`).
- A transport MUST NOT attempt to re-emit events back through the package
  (no `logger.info(...)` from inside `send()` — risks infinite recursion).
- A transport MUST NOT block the calling thread (no `Atomics.wait`, no
  synchronous XHR).
