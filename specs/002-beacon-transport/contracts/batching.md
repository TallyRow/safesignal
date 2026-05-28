# Contract — Beacon Transport Batching Mode

**Feature**: 002-beacon-transport · **Spec**: [../spec.md](../spec.md)
· **Plan**: [../plan.md](../plan.md)

This contract locks the opt-in batching behavior of the beacon
transport. Batching is **off by default**; with no `batching` option
present, the behavior in [delivery.md](./delivery.md) applies and
this document is irrelevant. Batching is enabled by passing a
`batching` block to `createBeaconTransport()`.

## B-1. Batching is opt-in via an explicit constructor flag

`createBeaconTransport({ endpoint: '...' })` (no `batching` field)
→ default mode (one network call per event, see delivery.md).

`createBeaconTransport({ endpoint: '...', batching: { maxBatchSize: N } })`
→ batching enabled with size threshold `N`.

`createBeaconTransport({ endpoint: '...', batching: { maxBatchSize: N, maxBatchAgeMs: T } })`
→ batching enabled with size threshold `N` AND age threshold `T` ms.

No environment variable, no global flag, no runtime setter switches
the mode. The opt-in is visible at the call site (FR-021).

## B-2. Envelope shape

The wire body for a batched flush is exactly:

```json
{ "events": [/* LogEvent, LogEvent, ... */] }
```

- The `events` field is the only field on the envelope.
- `events` is a JSON array of `LogEvent` objects in pipeline-emission
  order (the order in which `send()` was called).
- No additional fields (no `transportName`, no `flushedAt`, no
  `batchId`, no `seq`). See [data-model.md](../data-model.md) §
  `BatchEnvelope` for rationale.

## B-3. Flush triggers

A flush MUST be attempted when **any** of the following becomes true:

| Trigger                                       | Detail                                                                                                                |
|-----------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| Buffer length reaches `maxBatchSize`          | Synchronous flush at the end of the `send()` that pushed the threshold-meeting event.                                  |
| `maxBatchAgeMs` timer fires                    | Async flush from the one-shot `setTimeout` callback. The timer is armed when the first event enters an empty batch.    |
| `pagehide` event fires                         | Synchronous flush from the lazy-installed listener. One final attempt.                                                  |
| `shutdown()` is called                         | Synchronous best-effort flush, then listener removal.                                                                   |
| `flush()` is called                            | Synchronous flush of whatever is currently buffered. No-op if buffer is empty.                                          |

Subsequent triggers that fire after the buffer is already empty are
no-ops.

## B-4. Order preservation

Events MUST appear in the envelope in the order they were pushed.
The transport MUST NOT reorder, deduplicate, or merge events.
Asserted by an integration test that emits 1,000 events with
ascending `attributes.seq` and verifies the resulting envelope's
`events[].attributes.seq` is monotonically increasing.

## B-5. Single-flush-attempt semantics

When a flush triggers, the transport encodes the current buffer to a
single envelope, clears the buffer, and attempts delivery:

1. `envelope = JSON.stringify({ events: buffer })`
2. `buffer = []` (cleared **before** the delivery attempt, so a
   re-entrant `send()` during the flush callback sees an empty
   buffer and starts a new batch).
3. Cancel + clear `maxAgeTimer`.
4. Attempt `sendBeacon(endpoint, blob(envelope))`.
   - On `true`: done.
   - On `false`: fall through to `fetch`.
5. Attempt `fetch(endpoint, { method: 'POST', body: envelope, keepalive: true, headers, credentials: 'same-origin' })`.
   - Resolves 2xx: done.
   - Rejects or non-2xx: drop entire batch with `beacon_batch_drop`
     notice.

There is **no retry**. A failed batch is gone — the events are not
re-pushed onto the buffer.

## B-6. Oversized envelope handling

If the serialized envelope exceeds 65,536 bytes (the 64 KiB
sendBeacon budget) — **regardless of whether individual events in the
batch were under the per-event limit** — the flush is treated as a
batch drop:

- `sendBeacon` will return `false` (or throw on some browsers); we
  short-circuit and treat it as failure.
- `fetch` with `keepalive: true` will reject (Chromium throws
  `TypeError`; Firefox rejects the Promise).
- One `beacon_batch_drop` notice fires for the dropped batch.

This is a **consumer-tuning** problem (their `maxBatchSize` was too
aggressive for their average event size). The documentation
explicitly tells consumers to keep `maxBatchSize × per-event-size`
under 64 KiB.

## B-7. Oversized single event ejection

When a single event being pushed into the batch has a serialized
size > 64 KiB:

- The event is **not** added to the batch.
- One `onInternalError` notice fires with code `oversized_event`
  (rate-limited per session).
- The current batch's other events remain queued.
- The next flush trigger (size, age, pagehide, shutdown) still
  attempts to deliver the remaining batch.

This means an oversized event is dropped surgically, not transitively.
The rest of the batch is unaffected.

(Note: the size check is on the **individual event's** serialized
size, not on the envelope's size. Whether the resulting envelope
exceeds 64 KiB is checked at flush time per B-6.)

## B-8. `maxBatchAgeMs` timer is a one-shot, armed lazily

- When `maxBatchAgeMs` is set and the first event enters an empty
  batch, the transport calls `setTimeout(flushCallback, maxBatchAgeMs)`
  and stores the timer ID in `maxAgeTimer`.
- When the batch is flushed (for any reason), the timer is cancelled
  via `clearTimeout(maxAgeTimer)` and `maxAgeTimer = null`.
- The timer is **never reset on each push**. The age is measured
  from the first event in the batch, not the latest event.
- There is **no periodic timer / interval**. Feature 001's
  lightweight-logger discipline forbids ambient periodic work; the
  one-shot pattern satisfies that.

## B-9. `pagehide` flush is one final synchronous attempt

When `pagehide` fires:

- If the batch is empty, the handler is a no-op.
- If the batch is non-empty, the handler invokes the same flush path
  as a normal trigger. The `sendBeacon`-first path is the right
  primitive here because `sendBeacon` is the only browser primitive
  designed to outlive page unload.
- If the flush fails (sendBeacon returns false AND fetch rejects),
  one `beacon_batch_drop` notice fires before the page actually
  unloads. The notice is observed by the application's
  `onInternalError` synchronously; whether the consumer's error
  reporter manages to deliver it before unload is the consumer's
  problem (no different from any pagehide-time work).

## B-10. `shutdown()` flush is best-effort

When `shutdown()` is called with a non-empty batch:

- The transport attempts one synchronous flush via the same path.
- If the flush succeeds, the batch is delivered and the resolve.
- If the flush fails, one `beacon_batch_drop` notice fires before
  `shutdown()` resolves.
- Listener removal happens regardless of flush outcome.

`shutdown()` is documented as idempotent (D-12): a second call is a
no-op.

## B-11. Drop notice is one-per-batch, not one-per-event

A `beacon_batch_drop` notice carries `droppedCount = events.length`
(the size of the batch at flush time), not N notices for N events.
The notice's payload MUST NOT include the dropped events' content
(no `messages`, no `attrs`, no `error`, no `context`) — structural
metadata only.

Per FS-12 (feature 001), the per-batch notice is itself rate-limited
per session via `notified.beacon_batch_drop`. The first drop fires;
subsequent drops in the same session are silent. This trades early-
detection signal against log-spam protection for long-lived pages
where the endpoint is persistently broken.

Trade-off rationale: a consumer monitoring `onInternalError` sees
**the first failure** of each class. If they want per-occurrence
metrics, they instrument that themselves via a custom transport or
proxy.

## B-12. `flush()` synchronizes against the current batch

`BeaconTransport.flush()` in batching mode:

- If the buffer is empty: resolves immediately.
- If the buffer is non-empty: triggers the same flush path
  synchronously; the returned Promise resolves once the encode +
  primitive call has been initiated (the network call itself is
  fire-and-forget). The Promise does NOT wait for the network
  response.

Consumers wanting "all in-flight requests have completed" semantics
must coordinate at the application level — neither `sendBeacon` nor
`fetch keepalive` exposes a per-call completion signal that survives
page unload.

## Batching test plan

| ID   | File                                                                  | Assertion summary                                                          |
|------|----------------------------------------------------------------------|----------------------------------------------------------------------------|
| B-1  | `tests/contract/transport-beacon.contract.test.ts`                   | Default-mode vs. batching-mode toggle via constructor flag                  |
| B-2  | `tests/integration/transport-beacon-batching.integration.test.ts`    | Envelope shape `{ events: LogEvent[] }`; no extra fields                    |
| B-3  | `tests/integration/transport-beacon-batching.integration.test.ts`    | Triggers (size, age, pagehide, shutdown, flush) all flush                   |
| B-4  | `tests/integration/transport-beacon-batching.integration.test.ts`    | Order preservation across 1,000 events                                      |
| B-5  | `tests/unit/transport-beacon/batcher.test.ts`                        | Single-attempt flush; buffer cleared before delivery; no retry              |
| B-6  | `tests/integration/transport-beacon-batching.integration.test.ts`    | Oversized envelope → `beacon_batch_drop`                                    |
| B-7  | `tests/integration/transport-beacon-batching.integration.test.ts`    | Oversized single event ejected; remaining batch still flushes               |
| B-8  | `tests/unit/transport-beacon/batcher.test.ts`                        | One-shot timer; armed once per batch; cleared on flush                      |
| B-9  | `tests/integration/transport-beacon-batching.integration.test.ts`    | Pagehide → final flush; failure notice on flush failure                     |
| B-10 | `tests/integration/transport-beacon-batching.integration.test.ts`    | `shutdown()` flush + listener removal + idempotency                         |
| B-11 | `tests/integration/transport-beacon-batching.integration.test.ts`    | One notice per batch; rate-limit per session; no event content in notice    |
| B-12 | `tests/integration/transport-beacon-batching.integration.test.ts`    | `flush()` synchronizes against current batch only                           |
