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
| T-1 | `send()` receives a `LogEvent` matching the `log-event` contract |
| T-2 | The package wraps every transport in `SafeTransport`; consumer code does not have to try/catch |
| T-3 | A synchronous throw from `send()` is caught and does NOT propagate to the emit call site |
| T-4 | A rejected Promise from `send()` is swallowed and does NOT cause an unhandled rejection |
| T-5 | One `onInternalError` notice per transport per session on first failure |
| T-6 | Subsequent failures from the same transport are silent (no log spam) |
| T-7 | A failing transport does NOT prevent other configured transports from receiving the event |
| T-8 | `flush()` and `shutdown()` are optional; the package no-ops if absent |
| T-9 | Replacing the transport list via `configureLogging()` does not require changes to existing logger call sites |

## Built-in: `ConsoleTransport`

```ts
const ConsoleTransport: TransportFactory;
```

- `name`: `'console'`.
- `send(event)`: calls `console[event.level](event.message, event)` (with
  `console.log` substituted for `console.debug` only if `console.debug` is not a
  function — never in modern browsers).
- `flush()` / `shutdown()`: not implemented.

## Built-in: `NoopTransport`

```ts
const NoopTransport: TransportFactory;
```

- `name`: `'noop'`.
- `send(event)`: returns immediately.
- Used as the automatic fallback when `transports` is empty or undefined.

## Multi-transport semantics

- Events are dispatched to all configured transports in registration order.
- Dispatch is fire-and-forget. The pipeline does NOT `await` `Promise`s
  returned by `send()`.
- `flush()` (when called via a future API) iterates all transports and awaits
  each individually; a flush failure on one transport does not block others.

## Forbidden behavior

- A transport MUST NOT mutate the received `LogEvent`. The package may freeze
  events in development builds to enforce this.
- A transport MUST NOT depend on package internals (no imports from
  `src/internal/**`).
