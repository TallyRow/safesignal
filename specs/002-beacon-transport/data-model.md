# Phase 1 Data Model — Beacon Transport

**Feature**: 002-beacon-transport
**Date**: 2026-05-27
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

The beacon transport adds **no new entities** to the consumer-facing
event model — events on the wire are exactly the post-pipeline
`LogEvent` shape locked by feature 001's `contracts/log-event.md`
(LE-1..LE-11). The data model here covers (a) the new public option
types exposed at the subpath, (b) the internal batch envelope used
on the wire when batching is enabled, (c) the internal state shape
of a single transport instance, and (d) the new internal error
codes carried on `PackageError`.

## Public types — `src/transport-beacon/index.ts`

### `BeaconTransportOptions`

```ts
export interface BeaconTransportOptions {
  /**
   * The HTTPS ingestion endpoint. MUST start with `https://` unless
   * `allowInsecureLoopback` is `true`, in which case `http://localhost`,
   * `http://127.0.0.1`, and `http://[::1]` are permitted. Any other
   * scheme (`ws://`, `file://`, `data:`, relative paths) is rejected
   * at construction time.
   */
  endpoint: string;

  /**
   * Optional opt-in batching. Off by default — every event produces
   * one network call carrying exactly that event.
   *
   * When set, events accumulate in memory until `maxBatchSize` events
   * have been queued OR `maxBatchAgeMs` milliseconds have elapsed
   * since the first event in the current batch was queued — whichever
   * is sooner.
   */
  batching?: {
    /**
     * Maximum number of events in one batch envelope. MUST be a
     * positive integer; values > 1000 are rejected at construction
     * (a 1000-event envelope is already at risk of exceeding the
     * 64 KiB sendBeacon budget).
     */
    maxBatchSize: number;

    /**
     * Maximum age in milliseconds of the oldest event in the current
     * batch before a flush is forced. MUST be a non-negative
     * finite number. Omit to disable the age trigger; the batch
     * then flushes only on `maxBatchSize`, `pagehide`, or
     * `shutdown()`.
     */
    maxBatchAgeMs?: number;
  };

  /**
   * Default `false`. When `true`, the construction-time HTTPS check
   * additionally permits `http://` for hosts `localhost`,
   * `127.0.0.1`, and `[::1]` only. Every other non-HTTPS endpoint
   * still throws at construction with an error naming the endpoint,
   * the flag, and the allowlist.
   *
   * The flag's value MUST be a literal passed at the call site. It
   * MUST NOT be sourced from ambient state (`process.env`,
   * `import.meta.env`, `window.location`, etc.). Build-tool
   * `define`-plugins are acceptable insofar as they substitute a
   * literal at compile time.
   */
  allowInsecureLoopback?: boolean;

  /**
   * Optional `Transport.name` override for diagnostic attribution
   * (e.g., when configuring two beacon transports against different
   * endpoints in the same runtime). Defaults to `'beacon'`.
   */
  name?: string;
}
```

**Validation rules** (enforced at `createBeaconTransport(options)`
construction time, before any state allocation):

| Field                                | Rule                                                                                  | Error on violation                                              |
|--------------------------------------|---------------------------------------------------------------------------------------|-----------------------------------------------------------------|
| `endpoint`                           | Must parse via `new URL(endpoint)`                                                    | Throws `TypeError` naming the field                             |
| `endpoint` scheme                    | `'https:'` always permitted; `'http:'` permitted iff `allowInsecureLoopback === true` AND host is in loopback allowlist | Throws naming endpoint + violated scheme constraint             |
| `endpoint` query / fragment / userinfo | None of these MUST carry credentials in any case (the transport will pass the URL through, but this contract documents that consumers SHOULD NOT embed secrets here — body-only is the wire-level rule) | Documented in `docs/safe-logging.md`; not enforced (consumer's URL is consumer's choice) |
| `batching.maxBatchSize`              | Integer in `[1, 1000]`                                                                | Throws `RangeError` naming field and bounds                     |
| `batching.maxBatchAgeMs`             | Finite number in `[0, +∞)` (if provided)                                              | Throws `RangeError` naming field and lower bound                |
| `allowInsecureLoopback`              | Boolean (if provided)                                                                 | Throws `TypeError` naming field                                 |
| `name`                               | Non-empty string (if provided)                                                        | Throws `TypeError` naming field                                 |

### `Transport` (re-export of the existing public type)

The factory returns a `Transport` (the existing interface from
`@your-org/frontend-logging-sdk`'s `src/api/types.ts`). The
returned object's shape matches the existing contract:

```ts
{
  name: string;                       // 'beacon' by default, or options.name
  send(event: LogEvent): void;        // synchronous; never throws
  flush?(): Promise<void>;            // resolves once pending batch drained
  shutdown?(): Promise<void>;         // resolves once cleanup complete; idempotent
}
```

`send()` is synchronous and never returns a Promise — the underlying
network call is fire-and-forget. `flush()` and `shutdown()` are
provided in both default and batching modes (in default mode they
are no-ops that resolve immediately).

## Internal entity — `BatchEnvelope`

When batching is enabled and the transport flushes a batch, the wire
body is:

```ts
interface BatchEnvelope {
  events: LogEvent[];
}
```

That's the entire envelope. There are **no** additional
transport-level metadata fields (no `transportName`, no `flushedAt`,
no `seq`). Rationale: every field on the envelope is implicitly
delivered with every event the envelope contains; adding fields
would either duplicate `LogEvent.timestamp` / `LogEvent.context` (no
new signal) or introduce transport-specific schema that ingestion
endpoints would have to learn (couples consumers to the transport).

If a future feature needs envelope metadata (e.g., a `seq` for
ingestion-side ordering guarantees), it MUST be added in a separate
versioned envelope shape.

**Envelope size constraint**: the serialized envelope MUST fit in
~64 KiB (the effective sendBeacon budget). When the size check at
flush time finds the envelope oversized, the entire batch is treated
as a failed flush and surfaces via `beacon_batch_drop`. This is a
consumer-tuning problem (their `maxBatchSize` was too aggressive for
their event size) and is documented in `quickstart.md`'s batching
section.

## Internal entity — `BeaconTransportState`

The per-instance state of a single transport. Not exported. Lives in
the closure returned by `createBeaconTransport()`.

```ts
interface BeaconTransportState {
  readonly endpoint: string;
  readonly name: string;
  readonly batching: BeaconTransportOptions['batching'] | undefined;

  /** Events accumulated since the last flush. Empty array when no batch is pending. */
  buffer: LogEvent[];

  /** One-shot age timer for the current batch (when `maxBatchAgeMs` is set). `null` when no batch is pending or the age trigger is disabled. */
  maxAgeTimer: ReturnType<typeof setTimeout> | null;

  /** Whether the `pagehide` listener has been installed. Lazy: set true on first `send()`. */
  pagehideInstalled: boolean;

  /** Reference to the installed `pagehide` handler so `shutdown()` can remove it. */
  pagehideHandler: (() => void) | null;

  /** Whether `shutdown()` has been called. Subsequent `send()` calls are no-ops. */
  shutdownComplete: boolean;

  /** Single-notify guards per error code per session (FS-12 — once per failure class per transport per session). */
  notified: {
    oversized_event: boolean;
    beacon_unavailable: boolean;
    transport_send_failed: boolean;
    beacon_batch_drop: boolean;
  };
}
```

**Lifecycle of `BeaconTransportState`**:

| Phase                              | State change                                                                                                                                  |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| Construction                       | All fields initialized. `buffer = []`, `maxAgeTimer = null`, `pagehideInstalled = false`, `pagehideHandler = null`, `shutdownComplete = false`, all `notified.*` keys false. |
| First `send(event)`                | Lazy install pagehide listener; set `pagehideInstalled = true`. If batching, push event; if first-in-batch and `maxBatchAgeMs` set, arm the timer.  |
| Subsequent `send(event)` — default | Encode + dispatch event; no state change beyond `notified.*` flags on failure.                                                                |
| Subsequent `send(event)` — batching | Push to `buffer`. If `buffer.length >= maxBatchSize`, flush.                                                                                  |
| Timer fires (`maxBatchAgeMs`)      | Flush. Timer reference cleared.                                                                                                               |
| Pagehide handler fires             | If `buffer.length > 0`, attempt one final flush.                                                                                              |
| Flush (success)                    | `buffer = []`; cancel + clear `maxAgeTimer`.                                                                                                  |
| Flush (failure)                    | `buffer = []`; cancel + clear `maxAgeTimer`; one `beacon_batch_drop` notice (gated by `notified.beacon_batch_drop`).                          |
| `shutdown()` — first call          | If `buffer.length > 0`, attempt synchronous flush; remove pagehide listener; cancel timer; set `shutdownComplete = true`.                     |
| `shutdown()` — subsequent calls    | No-op; resolve immediately.                                                                                                                   |
| `send()` after `shutdownComplete`  | No-op; no event delivered; no notice (the consumer chose to shut down; further sends are application bugs not transport drops).               |

Multi-instance coexistence is enforced by this state being **per
closure**: each call to `createBeaconTransport()` allocates an
independent `BeaconTransportState`. There is no module-scoped state
shared across instances.

## Internal entity — `DropNotice` shape

Drop notices are `PackageError` instances passed to
`LoggerConfig.onInternalError`. They carry the documented internal
`code` and the transport's `name`. New code values for this feature:

| Code                    | Meaning                                                                  | Per-session rate-limit | Extra fields on the error message                            |
|-------------------------|--------------------------------------------------------------------------|------------------------|--------------------------------------------------------------|
| `oversized_event`       | Single event's serialized body > ~64 KiB                                 | Once per session       | `event.message` (sanitized; ≤ 256 chars), `bytes` (number)   |
| `beacon_batch_drop`     | Batch flush failed (sendBeacon + fetch both refused/rejected)            | Once per dropped batch | `droppedCount` (number)                                      |
| `beacon_unavailable`    | Neither `navigator.sendBeacon` nor `fetch` is available in this runtime | Once per session       | none                                                         |

`transport_send_failed` (existing) is reused for the default-mode
single-event drop after the fetch fallback also fails; one notice per
session per transport.

`transport_shutdown_failed` (existing) is reused if the shutdown
flush attempt throws unexpectedly; one notice per session per
transport.

**Notice payload integrity**: the notice's `message` field MUST NOT
include the dropped event's `attrs`, `error`, or `context` — those
might contain the same payload whose size or content was the problem.
For `oversized_event`, only the **first 256 chars of the event's
`message` field** plus the byte count are included, since the
`message` field already passed the sanitizer's control-char guard.
The notice is a **structural** signal, not a data carrier.

## Relationships to feature 001 entities

| Entity (this feature)      | Relation to feature 001                                                              |
|----------------------------|--------------------------------------------------------------------------------------|
| `BeaconTransport`          | Implements `Transport` from `src/api/types.ts`. Wrapped by `SafeTransport` at `configureLogging()` time. |
| `BeaconTransportOptions`   | New public type at the `./transport-beacon` subpath. Not referenced by the default entry. |
| `BatchEnvelope`            | Internal wire shape. Receives `LogEvent[]` (the existing public type, unchanged).    |
| `BeaconTransportState`     | Internal closure state. Not exported.                                                |
| New `PackageErrorCode`s    | Extend the existing internal `PackageErrorCode` union in `src/internal/errors/internal-errors.ts`. Not exported. |

## State transition diagrams

### Default mode (no batching)

```text
[Construct] ──→ [Idle]
  send(event):
    [Idle] ── lazyAttachPagehide ──→ [Listening]
    [Listening] ── encode + dispatch ──→ [Listening]    (success)
    [Listening] ── encode + dispatch ──→ [Listening + Notified(transport_send_failed)]  (first failure)
    [Listening + Notified(*)] ── encode + dispatch ──→ [same state, no new notice]      (subsequent failures of same class)
  shutdown():
    [Listening*] ── detach ──→ [Shutdown]
    [Shutdown] ── send() ──→ [Shutdown]   (no-op)
```

### Batching mode

```text
[Construct] ──→ [Idle]
  send(event):
    [Idle] ── lazyAttachPagehide ──→ [Buffering(buffer=[event], timer=armed?)]
    [Buffering(n, timer)] ── push ──→ [Buffering(n+1, timer)]   if n+1 < maxBatchSize
    [Buffering(n, timer)] ── push + flush ──→ [Idle]            if n+1 >= maxBatchSize, flush succeeded
    [Buffering(n, timer)] ── push + flush ──→ [Idle + Notified(beacon_batch_drop)]   flush failed
  timer fires:
    [Buffering(n, armed)] ── flush ──→ [Idle]                  flush succeeded
    [Buffering(n, armed)] ── flush ──→ [Idle + Notified(beacon_batch_drop)]   flush failed
  pagehide:
    [Buffering(n, *)] ── flush ──→ [Idle | Idle+Notified]
  shutdown():
    [Buffering(n, *)] ── flush + detach ──→ [Shutdown | Shutdown+Notified]
    [Shutdown] ── send() ──→ [Shutdown]
```

## Bounded sizes summary

| Bound                                          | Value                                                              | Source                                          |
|------------------------------------------------|--------------------------------------------------------------------|-------------------------------------------------|
| Single-event serialized size                   | ≤ ~64 KiB (after sanitizer's max-depth=8, maxStringLength=8192, maxArrayLength=1000, maxAttributeCount=256 already bounded the event) | sendBeacon budget; spec FR-017            |
| Batch envelope serialized size                 | ≤ ~64 KiB                                                          | sendBeacon budget; spec FR-017                  |
| `batching.maxBatchSize`                        | 1..1000                                                            | research §6                                     |
| `batching.maxBatchAgeMs`                       | 0..+∞ (consumer judgment)                                          | research §6                                     |
| `notified.*` per-session-per-code flag         | 1 bit per code per transport                                       | feature 001 FS-12 (one notice per failure class per transport per session) |
