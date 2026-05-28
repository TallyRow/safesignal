# Contract — Beacon Transport Delivery Primitives

**Feature**: 002-beacon-transport · **Spec**: [../spec.md](../spec.md)
· **Plan**: [../plan.md](../plan.md)

This contract locks the per-event delivery behavior of the beacon
transport in **default mode** (no batching). For batching-mode
behavior see [batching.md](./batching.md). For failure-mode
enumeration see [failure-modes.md](./failure-modes.md).

## D-1. `send(event)` is synchronous and returns `void`

`BeaconTransport.send(event: LogEvent): void` does not return a
`Promise`. It does not `await`. It is safe to call from any code path
(the pipeline dispatcher calls it from inside the `SafeTransport`
wrapper, which already isolates throws and rejected Promises).

## D-2. Payload is a JSON-encoded `LogEvent`

The serialized payload is exactly `JSON.stringify(event)`. There is
no envelope, no wrapping object, no leading/trailing whitespace. The
event has already passed through the pipeline (sanitize → URL-scrub →
redact → control-char guard → freeze(dev)) so `JSON.stringify` is
guaranteed not to encounter circular references, `BigInt` values, or
other JSON-fatal inputs — but the transport still wraps the call in a
try/catch to satisfy the no-throw invariant.

## D-3. Size check happens BEFORE the primitive call

Before either `sendBeacon` or `fetch` is invoked, the transport
computes the payload's byte length via
`new TextEncoder().encode(payload).length`. If the result exceeds
**65,536 bytes** (the 64 KiB-per-origin beacon budget), the event is
treated as `oversized_event`:

- The event is dropped.
- One `onInternalError` notice fires per session with code
  `oversized_event` (rate-limited per `notified.oversized_event`).
- Neither `sendBeacon` nor `fetch` is called for this event.

This avoids wasting a network call on a guaranteed-failure payload.

## D-4. Primary primitive: `navigator.sendBeacon(endpoint, blob)`

When `typeof navigator !== 'undefined'` AND
`typeof navigator.sendBeacon === 'function'`, the transport calls:

```ts
const blob = new Blob([payload], { type: 'application/json' });
const ok = navigator.sendBeacon(endpoint, blob);
```

- If `ok === true`, the event is considered delivered. No further
  action.
- If `ok === false`, the transport falls through to the fetch
  fallback (see D-5).

The transport MUST use a `Blob` body — not a `string`, `FormData`,
`URLSearchParams`, or `ArrayBuffer`. The `Blob` form ensures the
browser sends the body as `application/json` and that the request is
unambiguously body-only.

## D-5. Fallback primitive: `fetch(endpoint, { method: 'POST', body, keepalive: true })`

The transport falls through to `fetch` when `sendBeacon` returned
`false` OR `navigator.sendBeacon` is undefined. The call shape is:

```ts
fetch(endpoint, {
  method: 'POST',
  body: payload,                                    // the JSON string
  headers: { 'content-type': 'application/json' },
  keepalive: true,
  credentials: 'same-origin',
});
```

The transport MUST NOT:

- Use `credentials: 'include'` (would send cookies cross-origin).
- Add an `Authorization` header.
- Set any header carrying event content.
- Append a query string to `endpoint`.
- Use any HTTP method other than `POST`.

The `fetch` call is fire-and-forget. The returned Promise's
resolution is observed via `.then(undefined, onReject)`:

- If the Promise resolves AND the response status is in `[200, 299]`:
  the event is considered delivered.
- If the Promise resolves AND the response status is outside that
  range: the event is dropped with `transport_send_failed`.
- If the Promise rejects: the event is dropped with `transport_send_failed`.

## D-6. The fallback runs at most once per `send()` call

There is **no** retry loop. There is **no** "try the other primitive
after the first one succeeded". The lifecycle is:

```text
send(event)
  → size check                  → drop with oversized_event if over budget
  → attempt sendBeacon          → return on success
  → attempt fetch keepalive     → return on success
  → drop with transport_send_failed
```

If `sendBeacon` returned `true` and `fetch` was never called, the
transport does NOT also call `fetch`. If `sendBeacon` was unavailable
and `fetch` was called and succeeded, the transport does NOT also
call `sendBeacon`.

## D-7. Both primitives unavailable → `beacon_unavailable`

If neither `navigator.sendBeacon` nor `fetch` is available in the
runtime (`typeof fetch === 'undefined'`), the transport drops every
emitted event and emits one `onInternalError` notice per session with
code `beacon_unavailable`. Subsequent emissions in the same session
drop silently.

This is vanishingly rare in 2026 browsers — `fetch` is baseline-
available everywhere the package targets. The notice exists for
completeness and for the legacy-runtime test path.

## D-8. URL is opaque

The transport does NOT modify `endpoint` between construction and
delivery. It does NOT append query parameters, fragments, or path
segments. It does NOT URL-encode any part of the event into the URL.

The endpoint string passed to `createBeaconTransport()` is the exact
string passed to `sendBeacon` / `fetch`. Consumers who want
ingestion-side routing (e.g., per-application paths) construct the
endpoint string accordingly at construction time.

## D-9. Endpoint is fixed at construction

There is no public API to change the endpoint after construction. A
consumer who wants to retarget MUST:

1. Construct a new transport with the new endpoint.
2. Call `configureLogging({ transports: [newTransport] })` to replace
   the active runtime's transports (or supply both old and new and
   let the consumer decide which to keep).

The previous transport's `shutdown()` runs as part of the
`configureLogging()` replacement flow (feature 001 contract).

## D-10. Listener attachment is lazy and gated

On the **first** successful `send()` call (i.e., the first `send()`
that proceeds past the size check) — and only if
`typeof globalThis.addEventListener === 'function'` — the transport
installs a `pagehide` handler:

```ts
const handler = () => {
  // In default mode this handler is a no-op (no batch to flush).
  // In batching mode it triggers a final synchronous flush.
};
globalThis.addEventListener('pagehide', handler);
```

The `pagehideInstalled` flag in instance state prevents a second
install. `shutdown()` removes the handler and clears the flag.

In **default mode** the `pagehide` handler is effectively a no-op
(no buffered state). The transport still installs it for symmetry
with batching mode and to keep the lazy-install gating logic single-
sourced. The installed listener costs O(1) per transport and is
removed on `shutdown()`.

## D-11. `flush()` in default mode is a no-op

`BeaconTransport.flush()` in default-mode configuration resolves
immediately. There is no buffer to drain. Calling `flush()` multiple
times is safe.

## D-12. `shutdown()` removes listeners and rejects further `send()` calls

`BeaconTransport.shutdown()`:

1. If `pagehideInstalled === true`, calls
   `globalThis.removeEventListener('pagehide', handler)`. Sets
   `pagehideInstalled = false`.
2. In batching mode (see [batching.md](./batching.md)): attempts one
   final synchronous flush.
3. Sets `shutdownComplete = true`.
4. Resolves.

Subsequent `send(event)` calls return immediately without
encoding, dispatching, or notifying. They are no-ops, not errors.

A second `shutdown()` call resolves immediately. There is no double
listener-removal, no double flush.

## Delivery test plan

| ID    | File                                                                | Assertion summary                                       |
|-------|---------------------------------------------------------------------|----------------------------------------------------------|
| D-1   | `tests/contract/transport-beacon.contract.test.ts`                  | `send()` returns `void` synchronously                    |
| D-2   | `tests/unit/transport-beacon/delivery.test.ts`                      | Payload is `JSON.stringify(event)` exactly               |
| D-3   | `tests/unit/transport-beacon/delivery.test.ts`                      | Size check precedes primitive call; oversized → drop     |
| D-4   | `tests/unit/transport-beacon/delivery.test.ts`                      | `sendBeacon` called with `Blob('application/json')`      |
| D-5   | `tests/unit/transport-beacon/delivery.test.ts`                      | Fetch fallback call shape (method, body, keepalive, headers, credentials) |
| D-6   | `tests/unit/transport-beacon/delivery.test.ts`                      | No retry; at most one primitive call per `send()` (excluding the single fallback step) |
| D-7   | `tests/unit/transport-beacon/delivery.test.ts`                      | Both-unavailable → `beacon_unavailable` notice once       |
| D-8   | `tests/security/transport-beacon-secret-sweep.security.test.ts`     | URL is unmodified; no event content reaches the URL      |
| D-9   | `tests/unit/transport-beacon/delivery.test.ts`                      | No public API mutates endpoint                            |
| D-10  | `tests/unit/transport-beacon/lifecycle.test.ts`                     | Lazy `pagehide` install; gated; removed on shutdown      |
| D-11  | `tests/contract/transport-beacon.contract.test.ts`                  | Default-mode `flush()` is a no-op                         |
| D-12  | `tests/contract/transport-beacon.contract.test.ts`                  | `shutdown()` idempotent; subsequent `send()` is no-op    |
