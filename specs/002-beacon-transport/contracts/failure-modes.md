# Contract — Beacon Transport Failure Modes

**Feature**: 002-beacon-transport · **Spec**: [../spec.md](../spec.md)
· **Plan**: [../plan.md](../plan.md)

This contract enumerates every failure mode of the beacon transport,
the resulting behavior, and the `BeaconErrorCode` that surfaces
through `BeaconTransportOptions.onInternalError`. It is the single
source of truth for the drop-and-notify behavior — the spec, plan,
and other contracts cross-reference this document.

All notices are subject to a per-session, per-instance rate-limit
(one notice per failure class per beacon transport instance per
session), modeled after feature 001's FS-12.

**Routing**: every notice goes through
`BeaconTransportOptions.onInternalError` (passed at construction
time). This is the ONLY notification channel for the transport. The
transport never throws from `send()`/`flush()`/`shutdown()`, and
never returns a rejecting Promise. Feature 001's `SafeTransport`
still wraps the beacon transport at `configureLogging()` time as
defense-in-depth, but in normal operation its notify path is
unreachable for beacon-emitted failures (the inner hook already
caught everything). A consumer who wires the same callback into both
`LoggerConfig.onInternalError` and
`BeaconTransportOptions.onInternalError` sees each failure exactly
once.

## F-1. Construction-time failures (do NOT route through `onInternalError`)

Construction-time failures throw synchronously to the consumer
calling `createBeaconTransport()`. They are NOT routed through
`onInternalError` because the call stack is the consumer's own and
no runtime is yet configured.

| Failure                                            | Thrown error                                                                        |
|----------------------------------------------------|--------------------------------------------------------------------------------------|
| `endpoint` is not a string                         | `TypeError: endpoint must be a string, got <typeof>`                                |
| `endpoint` fails URL parsing                       | `TypeError: invalid endpoint URL: '<endpoint>'`                                      |
| `endpoint` scheme is not `https:` AND `allowInsecureLoopback !== true` | `Error: beacon transport refuses non-HTTPS endpoint '<endpoint>'`                    |
| `endpoint` scheme is `http:` AND `allowInsecureLoopback === true` AND host is not in loopback allowlist | `Error: allowInsecureLoopback permits only localhost/127.0.0.1/[::1]; got '<host>' in '<endpoint>'` |
| `batching.maxBatchSize` is not in `[1, 1000]`      | `RangeError: batching.maxBatchSize must be an integer in [1, 1000], got <value>`     |
| `batching.maxBatchAgeMs` is not finite non-negative| `RangeError: batching.maxBatchAgeMs must be a non-negative finite number, got <value>` |
| `allowInsecureLoopback` is not a boolean           | `TypeError: allowInsecureLoopback must be a boolean, got <typeof>`                  |
| `name` is set but not a non-empty string           | `TypeError: name must be a non-empty string`                                         |

Every thrown error has a meaningful `.message`. None of them are
caught silently by the package — the consumer's call site sees them.

## F-2. `oversized_event` (per-event size limit)

**Trigger**: a single event's serialized size exceeds 65,536 bytes.

**Behavior** (default mode):
- The event is dropped.
- One notice fires per session with code `oversized_event`.
- Neither `sendBeacon` nor `fetch` is called for this event.

**Behavior** (batching mode):
- The oversized event is **not added** to the buffer.
- One notice fires per session with code `oversized_event`.
- The remaining buffered events continue to accumulate; the next
  flush trigger still attempts to deliver them.

**Notice payload** (a `BeaconError` instance):
- `error instanceof Error === true`
- `error.message`: `'beacon transport dropped oversized event: bytes=<N>, message=<first-256-chars-of-event.message>'`
- `error.code`: `'oversized_event'`
- `error.transportName`: the transport's `name` (default `'beacon'`)

## F-3. `beacon_unavailable` (no usable primitive)

**Trigger**: `typeof navigator?.sendBeacon !== 'function'` AND
`typeof fetch !== 'function'`.

**Behavior**:
- The event is dropped.
- One notice fires per session with code `beacon_unavailable`.
- No primitive is called.

This is vanishingly rare in 2026 browsers — `fetch` is baseline-
available everywhere the package targets — but the path exists for
legacy / test environments.

**Notice payload** (a `BeaconError` instance):
- `error.message`: `'beacon transport has no usable delivery primitive (sendBeacon and fetch both unavailable)'`
- `error.code`: `'beacon_unavailable'`
- `error.transportName`: the transport's `name`

## F-4. `transport_send_failed` (default-mode single-event delivery failure)

**Trigger** (default mode only):
- `sendBeacon` returned `false` (or was unavailable) AND
- The `fetch` fallback rejected, threw, or resolved with a status
  outside `[200, 299]`.

**Behavior**:
- The event is dropped.
- One notice fires per session with code `transport_send_failed`.

**Notice payload** (a `BeaconError` instance):
- `error.message`: `'beacon transport '<name>' failed: <cause description>'`
- `error.code`: `'transport_send_failed'`
- `error.cause`: the original cause if available (the rejected
  Promise's reason, or a synthetic `Error('sendBeacon returned false; fetch fallback failed')`).
- `error.transportName`: the transport's `name`

**Note**: `SafeTransport` from feature 001 wraps the beacon transport
at `configureLogging()` time. Its try/catch around `send()` would emit
a `PackageError(transport_send_failed)` if the beacon transport ever
threw — but the beacon transport's own try/catch prevents that, so
`SafeTransport`'s path is unreachable in normal operation. The beacon
transport's own `BeaconError(transport_send_failed)` notice is the
one consumers observe.

## F-5. `beacon_batch_drop` (batching-mode flush failure)

**Trigger** (batching mode only):
- A flush attempt's `sendBeacon` returned `false` (or was unavailable) AND
- The flush attempt's `fetch` fallback rejected, threw, or resolved
  with a status outside `[200, 299]`.

OR

- The serialized envelope exceeded 65,536 bytes (the size check
  happens BEFORE the primitive call, so this short-circuits the
  primitives and fires directly).

**Behavior**:
- The entire batch is dropped (buffer was cleared before the flush
  attempt — events are gone).
- One notice fires per session with code `beacon_batch_drop`.

**Notice payload**:
- `error.message`: `'beacon transport dropped batch: droppedCount=<N>, reason=<short-description>'`
- `error.code`: `'beacon_batch_drop'`
- `error.transportName`: the transport's `name`

The notice payload does NOT include any of the dropped events'
content (`message`, `attrs`, `error`, `context`). Structural metadata
only.

## F-6. `transport_shutdown_failed` (shutdown flush failure)

**Trigger**: `shutdown()` invoked a final flush and that flush
threw unexpectedly (the underlying primitive raised an error not
caught by the inner try/catch).

This is defense-in-depth; the inner code paths catch all primitive
errors. The notice exists to preserve symmetry with
`SafeTransport`'s shutdown-failure routing.

**Behavior**:
- `shutdown()` resolves regardless.
- One notice fires per session with code `transport_shutdown_failed`.

## F-7. Cause chains

Where a notice originates from an upstream cause (a rejected
`fetch` Promise, a thrown `JSON.stringify` error, a thrown
`addEventListener` error), the `BeaconError.cause` field carries
the original value via the ES2022 `Error.cause` mechanism. This lets
a consumer's diagnostic reporter chain back to the underlying reason
if desired. The `BeaconError` constructor sets `.cause` directly; no
helper-function dependency on the core's `wrapAsPackageError`.

## F-8. Rate-limit semantics

For every code, the transport's `notified.<code>` flag is set to
`true` the **first** time the code is emitted. Subsequent emissions
of the **same code** in the **same session** by the **same
transport instance** are silent.

| Code                       | Rate-limit semantics                                          |
|----------------------------|----------------------------------------------------------------|
| `oversized_event`          | One notice per transport per session (regardless of how many oversized events occur) |
| `beacon_unavailable`       | One notice per transport per session                            |
| `transport_send_failed`    | One notice per transport per session (inherited from feature 001) |
| `beacon_batch_drop`        | One notice per transport per session                            |
| `transport_shutdown_failed`| One notice per transport per session (inherited)                |

The rate-limit is **per transport instance**. Two beacon transports
configured in the same runtime each have their own `notified.*`
flags. Locked by FR-024.

The rate-limit is **per session**. A reload resets the flags (a new
transport instance is constructed). A `configureLogging()`
replacement that swaps in a new beacon transport instance resets
the flags for the new instance. The old instance's flags don't
matter — `shutdown()` already cleaned it up.

## F-9. What the transport does NOT do on failure

- Does NOT retry.
- Does NOT queue dropped events for later delivery.
- Does NOT escalate to a higher severity / different transport.
- Does NOT log to `console.*` directly (only `onInternalError` is
  routed).
- Does NOT mutate any global state (no `window.__beaconDrops` counter).
- Does NOT throw to the caller of `send()`.

These exclusions are deliberate. Retries amplify outage signal and
obscure attribution. Queueing dropped events to memory grows
unbounded memory. Escalation across transports defeats the
explicit-configuration contract.

## F-10. Interaction with feature 001's `SafeTransport`

Every transport configured via `LoggerConfig.transports` is wrapped
in feature 001's `SafeTransport` at `configureLogging()` time. This
outer wrapper holds the `LoggerConfig.onInternalError` callback and
emits a `PackageError(transport_send_failed)` or
`PackageError(transport_shutdown_failed)` if the inner transport
throws or returns a rejecting Promise.

The beacon transport NEVER throws and NEVER returns a rejecting
Promise from `send()` / `flush()` / `shutdown()`. Every drop path
inside the beacon transport is caught by its own try/catch and
routed through `BeaconTransportOptions.onInternalError`. The outer
`SafeTransport`'s notify path is therefore unreachable in normal
operation — but it remains as defense-in-depth for unexpected runtime
bugs.

A consumer wiring the same callback into both
`LoggerConfig.onInternalError` and
`BeaconTransportOptions.onInternalError`:

- Beacon-recognized drops (every code in this contract) fire
  `BeaconError` instances through the inner hook.
- The outer `SafeTransport` path fires `PackageError` instances —
  but in practice never does, because the inner path captures
  everything.
- The consumer sees each failure exactly once.

A consumer wiring `LoggerConfig.onInternalError` but NOT
`BeaconTransportOptions.onInternalError` will see **no** beacon
drops — async failures (fetch keepalive rejection, timer-fired
flush failure) are invisible to `SafeTransport` because they execute
outside the synchronous `send()` boundary. This is documented in
quickstart.md as a configuration pitfall: pass the hook to **both**
places.

In every case, `error.transportName === transport.name` (defaults to
`'beacon'`) distinguishes beacon notices from notices emitted by
other transports configured in the same runtime.

## Failure-mode test plan

| ID    | File                                                                      | Assertion summary                                                  |
|-------|---------------------------------------------------------------------------|---------------------------------------------------------------------|
| F-1   | `tests/unit/transport-beacon/endpoint-validation.test.ts`                 | Every construction-time error throws with documented message       |
| F-2   | `tests/integration/transport-beacon-batching.integration.test.ts`         | `oversized_event` fires correctly in both modes; rate-limited      |
| F-3   | `tests/unit/transport-beacon/delivery.test.ts`                            | `beacon_unavailable` when both primitives undefined                |
| F-4   | `tests/unit/transport-beacon/delivery.test.ts`                            | `transport_send_failed` when sendBeacon false + fetch rejects      |
| F-5   | `tests/integration/transport-beacon-batching.integration.test.ts`         | `beacon_batch_drop` in all flush-failure scenarios                 |
| F-6   | `tests/unit/transport-beacon/lifecycle.test.ts`                           | `transport_shutdown_failed` defense-in-depth path                  |
| F-7   | `tests/unit/transport-beacon/delivery.test.ts`                            | `Error.cause` chain preserved                                       |
| F-8   | `tests/integration/transport-beacon-batching.integration.test.ts`         | Rate-limit per code per transport per session                      |
| F-9   | `tests/contract/transport-beacon.contract.test.ts`                        | No retry; no console; no global mutation; no throw to caller       |
| F-10  | `tests/integration/transport-beacon-batching.integration.test.ts`         | `SafeTransport` + inner try/catch interaction with two transports  |
