# Phase 0 Research — Beacon Transport

**Feature**: 002-beacon-transport
**Date**: 2026-05-27
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

The three open clarification candidates from spec.md (FR-009, FR-016,
FR-017) were resolved by `/speckit-clarify` on 2026-05-27 and are
recorded in spec.md's `## Clarifications` section. Phase 0 covers the
remaining technical questions that the plan depends on.

## 1. `navigator.sendBeacon` size limits across modern browsers

### Decision
Treat **~64 KiB** as the effective per-request cap and treat returned
`false` as authoritative for "browser refused this payload". Do not
attempt fragmented re-sends.

### Rationale
- The W3C Beacon spec recommends UA implementations cap the
  per-origin in-flight queue at "at least 64 KiB". Browser
  implementations have converged on this number as a practical hard
  cap per call.
- Chromium and WebKit return `false` from `sendBeacon()` when the
  payload would exceed the queue's remaining budget. This is the
  documented signal we use to trigger the fetch-keepalive fallback.
- Firefox behaves the same way as of recent versions; older Firefox
  variants exist that returned `true` and silently dropped, but the
  package's modern-evergreen target (Firefox last-2-versions) excludes
  them.

### Implementation consequences
- The transport checks the **serialized byte length** of the payload
  *before* calling `sendBeacon` and treats anything over 64 KiB as
  `oversized_event`. We use `new TextEncoder().encode(payload).length`
  to get byte count rather than `payload.length` (which is UTF-16 code
  units). This is the single ambient API call the transport makes
  outside the delivery primitives themselves; `TextEncoder` is part
  of the modern-browser baseline.
- We do **not** attempt a "shrink" path (truncate attributes to fit).
  Truncation at the transport boundary would silently mutate the
  event (violates FR-007 / Principle VI). Size enforcement upstream
  in the core sanitizer is out of scope for this feature
  (spec FR-017 clarification).

### Alternatives considered
- **Probe size via empty `sendBeacon` first**: rejected. Adds network
  cost and races with quota accounting.
- **Use the browser's reported quota** (e.g.,
  `navigator.connection.downlinkMax`): rejected. Not size-related.
  There is no exposed API for the beacon queue's remaining budget.
- **URL-encode small events as a fallback** (use URL when body is
  too big): rejected. Forbidden by T-S1..T-S5.

## 2. `fetch(url, { keepalive: true })` size limits

### Decision
Treat the keepalive budget as **shared with `sendBeacon`** at ~64 KiB
per origin. Do **not** attempt fetch keepalive after `sendBeacon`
refused an oversized payload — the keepalive call will refuse for the
same reason.

### Rationale
- The Fetch spec defines a per-origin "keepalive request size budget"
  matching the beacon budget. A page that has used ~64 KiB of beacon
  keepalive in the current navigation has no budget left for a
  fetch-keepalive of the same size class.
- Chromium throws a `TypeError("Failed to fetch")` on
  budget-exhaustion or oversized keepalive bodies; Firefox returns a
  rejected Promise; behaviour converges on "do not deliver".
- Our fallback path (`navigator.sendBeacon` first, fetch keepalive
  second) is for the **availability** failure case (sendBeacon
  unavailable or browser refused for a transient reason like a
  per-origin queue collision), not the **size** failure case.

### Implementation consequences
- For the `oversized_event` failure class, we drop the event and emit
  one notice per session. We do not waste a network call on a guaranteed
  failure.
- For the generic "sendBeacon returned false" case, we still attempt
  fetch keepalive once — that path covers transient queue collisions,
  the post-pageload behavior in some browsers, and the `sendBeacon
  is undefined` case.
- Documentation explicitly tells consumers that the fetch-keepalive
  fallback is a **best-effort** path, not a retry loop. There is no
  retry beyond it.

### Alternatives considered
- **Unconditional fetch on any sendBeacon failure**: rejected. For
  oversized payloads it would always fail and waste a network call.
- **Attempt non-keepalive `fetch` as a third fallback**: rejected.
  Non-keepalive fetch does not survive page unload, which is exactly
  the scenario where sendBeacon was designed to help.

## 3. `pagehide` vs. `visibilitychange` vs. `beforeunload`

### Decision
Use **`pagehide`** as the single unload-flush trigger. Do not install
`visibilitychange` or `beforeunload` listeners.

### Rationale
- `pagehide` fires reliably on tab close, navigation, and back/forward
  cache eviction. It is the modern-spec-recommended primitive for
  "the page is about to be unavailable for sending more network
  requests".
- `visibilitychange` fires for backgrounding too (tab becomes
  inactive but page is still alive). Installing a flush there would
  fire on every tab switch, producing many small batched flushes for
  no real benefit and adding noise to drop-notice metrics.
- `beforeunload` is broadly disfavored in modern browsers — it
  triggers the "are you sure you want to leave?" UI prompt in some
  contexts and has unpredictable timing for async work. It is also
  not fired on back/forward cache transitions.

### Implementation consequences
- One listener type per transport instance: `pagehide`. Installed
  lazily on first `send()` (default mode) or first event entering the
  batch (batching mode). Removed on `shutdown()`.
- The `pagehide` handler attempts one final synchronous flush of any
  pending in-memory state. If `sendBeacon` is unavailable at unload
  (rare but possible), the handler falls through to fetch keepalive,
  which is the only primitive guaranteed to outlive an unloading
  page in browsers without a sendBeacon.

### Alternatives considered
- **`visibilitychange` + `pagehide`**: rejected. Double-flush risk
  with no signal benefit.
- **`beforeunload`**: rejected. Modern-browser flakiness, BFCache
  incompatibility.
- **No unload handler at all**: rejected. Spec US1 acceptance
  scenario 5 explicitly requires unload-time delivery.

## 4. Importing the `Transport` and `LogEvent` types into the new subpath without crossing the `src/internal/**` boundary

### Decision
The new subpath imports `LogEvent` and `Transport` from the **package's
own public type module** via the relative path `../api/types.js`. It
does **not** import anything from `src/internal/**` and does **not**
import from `src/runtime/**`. The bundle-shape audit (see §7) verifies
both invariants.

### Rationale
- `src/api/types.ts` is the single source of truth for the public
  type surface; feature 001 set it up precisely so that downstream
  code paths (testing subpath, future adapters) can import types
  without coupling to internals.
- Using the same module the package's own `src/index.ts` re-exports
  from keeps the boundary obvious: anything from `src/api/types.ts`
  is public; anything elsewhere is internal.
- The example consumer transport in `examples/shared/beacon-transport.ts`
  uses `import type { LogEvent, Transport } from
  '@your-org/frontend-logging-sdk'`. The first-party transport can't
  literally write that import because it lives *inside* the package
  — but the relative path to the same module gives the same type
  surface.
- An alternative — duplicating the `LogEvent` and `Transport` type
  shapes inside `src/transport-beacon/` — was considered and rejected
  for drift risk.

### Implementation consequences
- The new subpath's TypeScript imports look like:

  ```ts
  // src/transport-beacon/beacon-transport.ts
  import type { LogEvent, Transport } from '../api/types.js';
  ```

  The boundary is filesystem-visible: any import in
  `src/transport-beacon/**` that resolves outside `../api/types.js`
  or its own files is a contract violation.

- The bundle-shape test
  (`tests/security/transport-beacon-bundle-shape.security.test.ts`)
  asserts the **built** subpath bundle:
  - Does not import any path under `src/internal/**` (via
    transitive-deps scan of the source-map).
  - Does not import any module under `src/runtime/**`,
    `src/pipeline/**`, `src/config/**`, `src/context/**`.
  - Re-imports `LogEvent` and `Transport` types only; the runtime
    code is self-contained.

### Alternatives considered
- **Duplicating type definitions**: rejected. Drift risk; the public
  surface IS the contract, duplicating it inside a subpath creates
  two contracts.
- **Adding a new `src/types-public/` re-export point**: rejected. Adds
  a layer of indirection without benefit. `src/api/types.ts` is
  already the right boundary.
- **Importing `@your-org/frontend-logging-sdk` from the subpath
  itself (package self-import)**: rejected. Creates a build-order
  dependency between the default entry and the subpath. Subpath
  source MUST be buildable without the default entry being built
  first.

## 5. Subpath-owned `BeaconError` class

### Decision
Define a new `BeaconError extends Error` class **inside the
`./transport-beacon` subpath** (at `src/transport-beacon/errors.ts`,
NOT exported), with `code: BeaconErrorCode` and
`transportName: string` fields. The codes (`oversized_event`,
`beacon_batch_drop`, `beacon_unavailable`, `transport_send_failed`,
`transport_shutdown_failed`) are owned by the subpath. The transport
calls `options.onInternalError(beaconError)` directly for every drop.
The subpath does NOT import from `src/internal/errors/**`.

### Rationale
- The contract (TB-11) keeps the subpath isolated from `src/internal/**`,
  `src/runtime/**`, `src/pipeline/**`, `src/config/**`, and
  `src/context/**`. Importing the core's `PackageError` class would
  violate that.
- Async drop paths (fetch keepalive rejection, timer-fired flush
  failure, pagehide flush failure) execute **outside** the synchronous
  `send()` boundary that `SafeTransport` wraps. `SafeTransport`'s
  try/catch around `send()` does not catch a Promise rejection
  observed via `.catch()` in a deferred callback, and it does not
  observe timer-callback throws at all. The transport therefore needs
  its **own** diagnostics hook — `BeaconTransportOptions.onInternalError`
  — to surface those drops. Routing every notice through this hook
  (sync + async) gives a single, consistent code path.
- The `BeaconError` shape is **by-convention compatible** with the
  core's `PackageError` (`.code: string`, `.transportName: string`,
  optional `.cause`). A consumer's diagnostics handler cannot tell
  the difference. The minor duplication (a 30-line class) is far
  cheaper than the alternatives.

### Implementation consequences
- `src/transport-beacon/errors.ts` is a new internal module owned by
  the subpath. Not exported from the subpath's `index.ts`.
- `BeaconTransportOptions` gains an optional `onInternalError`
  callback. Recommended pattern (documented in quickstart.md): the
  consumer wires the same function into both
  `LoggerConfig.onInternalError` and
  `BeaconTransportOptions.onInternalError`.
- `tests/integration/transport-beacon-batching.integration.test.ts`
  and the secret-sweep / contract tests assert the correct
  `BeaconError.code` reaches the hook for each drop scenario.
- Feature 001's `src/internal/errors/internal-errors.ts` is **not**
  modified by this feature. No new `PackageErrorCode` values are
  added.

### Alternatives considered
- **Extend `PackageErrorCode`** in `src/internal/errors/internal-errors.ts`:
  rejected. Forces the subpath to import from `src/internal/**`,
  violating the boundary in TB-11.
- **Make `send()` return a Promise that rejects on failure, letting
  `SafeTransport` observe it**: rejected. (a) Batched async drops
  fire in timer callbacks that don't run inside any `send()` Promise.
  (b) Returning a Promise that may resolve after page unload has
  weird semantics and breaks the documented "send is synchronous"
  contract (D-1).
- **Encode codes as message-string prefixes (`'beacon: oversized'`)**
  on a plain `Error`: rejected. Less discoverable than a typed
  `.code` field and forces consumers to parse strings.

## 6. Batching strategy: array + length-or-age triggers, single-flush-attempt

### Decision
**Implementation**: one in-memory array (`events: LogEvent[]`), one
`maxBatchSize` trigger, one optional `maxBatchAgeMs` timer trigger,
plus pagehide + shutdown unload flushes. On any trigger, attempt one
flush; on flush failure, fire one `beacon_batch_drop` notice for that
batch and discard. No retry loop.

### Rationale
- The spec's US3 acceptance scenarios require: opt-in batching, one
  network call per envelope, no event reordering, drop notification
  on flush failure, pagehide flush. Those constraints are sufficient
  to describe the design fully — a more complex policy (priority
  queue, per-level batching, sampling) would add capability that the
  spec does not require and would have to be justified against
  Principle V.
- A single array with O(1) push and an O(N) one-time JSON.stringify
  at flush is the simplest correct implementation. Memory bound is
  `maxBatchSize × per-event-size`; the per-event size is already
  bounded by the core's sanitizer limits (8 KiB string × 256
  attributes × depth 8 produces an upper bound much smaller than
  `maxBatchSize`'s product).
- The `maxBatchAgeMs` timer is a one-shot `setTimeout` armed when the
  first event enters an empty batch and cancelled at flush. There is
  **no** periodic timer / interval — feature 001's lightweight-logger
  discipline forbids that.

### Implementation consequences
- The batcher exposes `push(event)`, `flush()`, and `shutdown()`
  methods. State is `{ buffer: LogEvent[]; maxAgeTimer: ReturnType<typeof setTimeout> | null }`.
- The flush attempt encodes the envelope with
  `JSON.stringify({ events: buffer })`. If serialization fails (it
  shouldn't — the events are already sanitized — but for safety) the
  batch is dropped with a `beacon_batch_drop` notice.
- The serialized envelope is then size-checked against 64 KiB. An
  oversized **envelope** (rather than oversized single event) is
  treated as a batch flush failure (`beacon_batch_drop`) — the
  consumer's `maxBatchSize` was too aggressive for their event size.
  Documentation explicitly tells consumers to tune `maxBatchSize`
  against their average event size to stay under 64 KiB.

### Alternatives considered
- **Ring buffer with overwrite-on-overflow**: rejected. Overwrite
  would silently drop events without notice — violates Principle VI.
- **Per-level batching** (separate batches for warn vs. error):
  rejected. Adds complexity for no spec'd benefit; correlation
  between adjacent events is best preserved with a single ordered
  batch.
- **Adaptive batch size based on the previous flush's success
  rate**: rejected. Adds policy that the spec doesn't require and
  would obscure drop-attribution.
- **Retry the failed batch on the next `send()`**: rejected. Spec
  US3 acceptance scenario 2 says "no partial delivery, no retry."

## 7. Verifying the new subpath's bundle shape

### Decision
Add a new security test
`tests/security/transport-beacon-bundle-shape.security.test.ts` that
reads the built `dist/transport-beacon.{mjs,cjs,d.ts}` and asserts:

1. **No internal imports**: no source-map reference to any module
   under `src/internal/**`, `src/runtime/**`, `src/pipeline/**`,
   `src/config/**`, or `src/context/**`.
2. **No vendor SDK imports**: no string match for `@opentelemetry`,
   `@datadog`, `dd-rum`, `@sentry`, or any other observability-vendor
   package name in the built bundle (mirror of feature 001's T049
   pattern).
3. **Default-entry isolation**: `dist/index.{mjs,cjs,d.ts}` does not
   contain the beacon transport's code. Asserted by string-matching
   distinctive symbols from the transport's source (`createBeaconTransport`,
   the `pagehide` listener install path, `oversized_event` string
   literal) and verifying their absence in the default bundle.
4. **Gzip budget**: the built `dist/transport-beacon.mjs` is under
   5 KiB gzipped (SC-008). Computed via the same `zlib.gzipSync`
   helper feature 001 uses for its bundle-size assertions.

### Rationale
- Extends the same boundary discipline feature 001 established for
  the core. No new approach; just a new entry point to audit.
- Catches the "consumer accidentally imports a transport-beacon
  symbol into the default entry" regression class before it ships.

### Implementation consequences
- The test runs after `npm run build`. The vitest config already
  invokes the build for the existing T049 / T070 audits; the new
  test reuses the same `dist/` artifacts.
- If gzip size exceeds 5 KiB, the test fails with the actual size
  reported. This is a hard ceiling — exceeding it is a plan
  violation, not a soft warning.

### Alternatives considered
- **Run-time assertion at construction**: rejected. Bundle shape is a
  build-time invariant, not a runtime one.
- **Lint rule against forbidden imports in `src/transport-beacon/**`**:
  rejected. ESLint config is out of scope for this feature; the
  built-bundle check covers the same ground and is closer to what
  consumers actually receive.

## Summary

All Phase 0 research questions resolved. No outstanding decisions
block Phase 1 design. The new subpath introduces no new runtime
dependencies, no new vendor SDKs, and no new ambient-state reads. The
core's transport-and-failure-handling architecture (`Transport`,
`SafeTransport`, `PackageError`, `onInternalError`) is reused unchanged.
