# Implementation Plan: Beacon Transport (first-party HTTPS peer transport)

**Branch**: `002-beacon-transport` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Constitution**: `.specify/memory/constitution.md` v1.2.0

**Predecessor**: feature 001 (`specs/001-structured-logging-core/plan.md`)
landed the vendor-neutral core (pipeline, `ConfiguredRuntime`, direct
transport fan-out, `ConsoleTransport`, `NoopTransport`, `./testing`
subpath). This feature is the first additive peer transport on top of
that core.

## Summary

Ship a first-party, HTTPS-only, body-only **beacon transport** as a new
subpath export `./transport-beacon` of `@your-org/frontend-logging-sdk`.
The transport implements the existing `Transport` interface (locked by
feature 001 in `src/api/types.ts`) and conforms to the existing
`assertTransportContract` (`./testing`) battery — including T-1..T-9
(behavioral) and T-S1..T-S5 (security). It introduces zero changes to
the v1 default entry's public surface.

Delivery primitives, in order: `navigator.sendBeacon(endpoint, blob)`
first; on falsy return or absence, exactly one
`fetch(endpoint, { method: 'POST', body, keepalive: true })` fallback.
No retry beyond that. Construction refuses non-HTTPS endpoints at
construction time, with one explicit opt-in escape:
`allowInsecureLoopback: true` permits `http://localhost`,
`http://127.0.0.1`, and `http://[::1]` only. Listeners (`pagehide`)
attach lazily on first `send()`, gated against double-install.

Batching is **off by default**; an explicit `batching` constructor flag
opts in with a documented envelope `{ events: LogEvent[] }`. Every
drop — single-event or batch — surfaces exactly once through
`onInternalError` with a documented `BeaconErrorCode` (`oversized_event`,
`beacon_batch_drop`, `beacon_unavailable`, plus the inherited
`transport_send_failed`).

The transport is opt-in via explicit named import; the default entry
(`@your-org/frontend-logging-sdk`) stays bit-identical. The transport's
bundle stays under 5 KiB gzipped (5120 bytes) and does not include any
pipeline-internal module from the core.

## Technical Context

**Language/Version**: TypeScript 5.4+, ES2020 target with `dom` lib,
strict mode (matches feature 001 — no per-feature toolchain change).

**Primary Dependencies**:
- **Runtime**: zero new runtime dependencies. The transport imports
  **public types only** (`LogEvent`, `Transport`) from
  `src/api/types.js` via a relative path — it does not import anything
  from `src/internal/**`, `src/runtime/**`, `src/pipeline/**`,
  `src/config/**`, `src/context/**`, or `src/transport/**`. The
  subpath defines its own internal `BeaconError` class rather than
  importing the core's `PackageError`. Locked by FR-010 and the new
  bundle-shape audit (TB-11).
- **Dev**: no new devDependencies; reuses `tsup`, `vitest`,
  `happy-dom`, `@vitest/coverage-v8` already pinned for v1.
- **No observability-vendor SDK** is added by this feature. Inherited
  from feature 001's vendor-free core. Verified by extending feature
  001's `tests/contract/dependency-pins.test.ts` to scan the new
  subpath's built bundle.

**Storage**: None. Buffer-state, when batching is enabled, lives in
memory for the duration of the batch and is released on flush / drop /
shutdown.

**Testing**: `vitest` with `happy-dom`. New test groups:
- `tests/contract/transport-beacon.contract.test.ts` — runs the
  existing `assertTransportContract` from `./testing` against the new
  transport in both default and batching configurations.
- `tests/security/transport-beacon-secret-sweep.security.test.ts` —
  end-to-end secret-fixture sweep, mirror of feature 001's
  `tests/integration/secret-sweep.integration.test.ts`, with the
  beacon transport's `sendBeacon` and `fetch` doubled.
- `tests/security/transport-beacon-bundle-shape.security.test.ts` —
  asserts (a) the new subpath's built bundle imports no
  observability-vendor SDK and no `src/internal/**` module, and
  (b) the default entry's built bundle does not include
  beacon-transport code (bit-identical-or-smaller against the
  pre-feature snapshot from SC-007).
- `tests/integration/transport-beacon-host-module.integration.test.ts`
  — host configures one beacon transport; 50 module loggers each
  emit 20 events through it; asserts 1,000 events delivered with
  correct `context.module.name` per event.
- `tests/integration/transport-beacon-batching.integration.test.ts` —
  batching-enabled scenarios: normal flush, forced-drop (sendBeacon
  false + fetch reject), pagehide race, oversized-eject.
- `tests/performance/transport-beacon-construction.performance.test.ts`
  — constructing 1,000 transports adds zero listeners, performs zero
  network calls, performs zero ambient-state reads (mirror of feature
  001's T059 logger sweep, applied to transports).

**Target Platform**: Modern evergreen browsers (Chromium, Firefox,
Safari, Edge — last 2 versions). Same target as feature 001.
`navigator.sendBeacon` and `fetch(..., { keepalive: true })` are both
baseline-available; the fallback path covers older runtimes that lack
either.

**Project Type**: Subpath export of the existing reusable browser
package. No new repository, no new package.

**Performance Goals**:
- **Construction**: side-effect-free, constant-cost per instance.
  Constructing N transports allocates O(N) memory, attaches zero
  listeners, performs zero network calls, performs zero ambient reads.
  Locked by SC-006 and the new construction-sweep test.
- **Hot-path overhead**: `send()` does one JSON.stringify + one
  primitive dispatch in default mode; with batching, an O(1) push
  onto the in-memory buffer plus a flush check.
- **Bundle**: the new subpath's built artifact is under 5 KiB gzipped
  (5120 bytes — SC-008). The default entry's built bundle is bit-
  identical or smaller versus the pre-feature snapshot (SC-007).

**Constraints**:
- HTTPS-only at construction (`allowInsecureLoopback` exception
  documented in spec FR-016).
- Body-only delivery; no query params, no fragment, no header carrying
  event content. Inherits T-S1..T-S5 from the core.
- No retry loop beyond the single sendBeacon→fetch-keepalive fallback.
- No header injection API. No mutable endpoint. No global registry.
- The transport's source code MUST NOT read `process.env`,
  `import.meta.env`, `location`, `document.cookie`, or any other
  ambient state. Enforced by extending feature 001's
  `tests/contract/no-ambient-state.test.ts` to scan the new subpath.

**Scale/Scope**: One transport instance per (runtime, endpoint) tuple
is the typical case. Multi-instance coexistence (N transports against
N endpoints in the same runtime) is supported and locked by
FR-024 / SC-005.

## Constitution Check

*GATE: Passes against constitution v1.2.0. Re-checked post-design at
end of plan.*

- **I. Stable Consumer API & Clear Boundaries**:
  - Default-entry surface is **bit-identical** to v1. No new exports,
    no removed exports, no signature changes on `createLogger`,
    `configureLogging`, `getRootLogger`, `createRedactor`, `scrubUrl`,
    `ConsoleTransport`, `NoopTransport`, or any type. The beacon
    transport is reachable **only** via the explicit subpath import
    `@your-org/frontend-logging-sdk/transport-beacon` (FR-001, FR-002,
    FR-009). The default entry does not re-export it.
  - The safe path stays the easy path: the factory accepts an
    `endpoint` plus an optional `batching` flag plus an explicit opt-in
    `allowInsecureLoopback` flag; there is no header-injection API,
    no mutable endpoint, no per-call bypass of body-only delivery.
  - Compatibility: **additive**. No consumer call-site changes for
    existing v1 users.
- **II. Browser-First Runtime Resilience**:
  - `send()`, `flush()`, and `shutdown()` MUST NOT propagate a throw or
    rejected Promise to the caller (FR-003). The transport's internal
    code wraps every primitive (`sendBeacon`, `fetch`, JSON.stringify)
    in try/catch; on failure the event is dropped with one
    `onInternalError` notice per failure class per session, and the
    `SafeTransport` wrapper from feature 001 provides a second layer
    of failure isolation at the `ConfiguredRuntime` boundary.
  - Construction-time errors (non-HTTPS endpoint, invalid options)
    propagate normally — they happen outside the emit hot path and
    the consumer is the one calling the constructor.
- **III. Framework-Neutral Structured Observability**:
  - Body shape is documented and machine-parseable: a JSON-encoded
    `LogEvent` per call in default mode, or a JSON-encoded
    `{ events: LogEvent[] }` envelope in batch mode. No vendor-specific
    field. The transport MUST NOT mutate, reorder, deduplicate, or
    transform event content (FR-004, FR-007).
- **IV. Secure & Privacy-Safe Logging by Default**:
  - HTTPS-only at construction (FR-016). The `allowInsecureLoopback`
    escape requires an explicit constructor flag whose name makes the
    opt-in visible at the call site; the flag is never readable from
    `process.env`, build defines, URL params, or any other ambient
    source.
  - Body-only delivery (FR-015) — no event content in URL paths,
    queries, fragments, or headers.
  - No default Authorization header. No header-injection API. No
    cookies sent cross-origin by default (the fetch fallback uses
    `credentials: 'same-origin'`).
  - The transport delivers the post-pipeline `LogEvent` verbatim — it
    performs zero additional transformation, redaction, or
    sanitization. Defense-in-depth lives upstream in the pipeline
    (Sanitizer → URLScrubber → Redactor → ControlCharGuard →
    Freeze(dev)).
- **V. Testable, Minimal, Maintainable Package Design**:
  - The transport is a small, single-file (`beacon-transport.ts`)
    implementation with a separate `batcher.ts` for the optional
    batching state. Tests live in `tests/contract/`,
    `tests/security/`, `tests/integration/`, and
    `tests/performance/` — same organization as feature 001.
  - Documentation: `docs/safe-logging.md` gains a "Beacon transport"
    section; the README and `quickstart.md` show the import path; the
    `examples/shared/beacon-transport.ts` consumer example is replaced
    by an import of the first-party transport.
  - No new top-level abstractions; the transport implements the
    existing `Transport` interface and the existing
    `assertTransportContract` battery.
- **VI. Log Integrity & Monitoring Suitability**:
  - No silent drops. Every drop fires `onInternalError` exactly once
    per drop occurrence (single-event mode) or per batch (batch mode)
    with a documented `BeaconErrorCode`. No silent reordering, no
    deduplication, no mutation. Batching, when enabled, preserves
    pipeline-emission order inside the envelope.
- **VII. Lightweight Logger Instances & Federated Runtime Discipline**:
  - This feature is about a *transport*, not a `Logger` — but the
    same discipline applies. Constructing N transports allocates O(N)
    memory and zero N-amplified resources (FR-008). Listener
    attachment is lazy on first `send()`, gated against double-install.
    Multiple instances coexist without sharing state (FR-024).
  - Federated module support is preserved: the host configures the
    beacon transport at app boot; module loggers emit through the
    host's runtime via the same `createLogger({ module })` API. The
    transport is multi-instance-safe but the federated story is
    "host owns the transport, modules emit through it" (spec US2).
  - Duplicate-package-copy behavior inherits **isolated** from feature
    001 (FR-033) — each physical copy of the package carries its own
    beacon transport factory; copies do not share state.

**Result**: PASS. No violations; Complexity Tracking left empty.

## Technical Architecture Overview

### Where the transport lives

```text
@your-org/frontend-logging-sdk
├── . (default entry)         # unchanged from v1
│   └── createLogger, configureLogging, ConsoleTransport, NoopTransport, ...
├── ./testing                 # unchanged from v1
│   └── assertTransportContract, makeSecretFixture
└── ./transport-beacon        # NEW
    └── createBeaconTransport, BeaconTransportOptions
```

The new subpath is a peer of `./testing`. It is reachable only via
the explicit import path
`@your-org/frontend-logging-sdk/transport-beacon`. The `exports` map
in `package.json` gates discoverability.

### Where the code lives

```text
src/
├── index.ts                          # unchanged (default entry)
├── api/, runtime/, pipeline/, ...    # unchanged
├── transport/                        # existing v1 transports
│   ├── console-transport.ts
│   ├── noop-transport.ts
│   └── safe-transport.ts
├── transport-beacon/                 # NEW — new subpath source
│   ├── index.ts                      # subpath entry (only public exports)
│   ├── beacon-transport.ts           # factory + Transport implementation
│   ├── delivery.ts                   # sendBeacon → fetch fallback primitive
│   ├── batcher.ts                    # opt-in batching state machine
│   ├── endpoint-validation.ts        # HTTPS + allowInsecureLoopback check
│   ├── lifecycle.ts                  # pagehide listener install/cleanup
│   └── errors.ts                     # subpath-owned BeaconError + BeaconErrorCode
└── testing/                          # unchanged
    ├── assert-transport-contract.ts
    └── secret-fixtures.ts
```

The new subpath imports **only** public types (`LogEvent`,
`Transport`) from `../api/types.js` via a relative path. Drop notices
are routed through `BeaconTransportOptions.onInternalError` carrying
`BeaconError` instances owned by the subpath; the core's
`PackageError` is **not** imported. See research §4 and §5.

### Build output

`tsup.config.ts` gains one new entry:

```ts
entry: {
  index: 'src/index.ts',
  testing: 'src/testing/index.ts',
  'transport-beacon': 'src/transport-beacon/index.ts',  // NEW
},
```

This produces `dist/transport-beacon.mjs`, `dist/transport-beacon.cjs`,
and `dist/transport-beacon.d.ts`. `package.json` `exports` gains:

```json
"./transport-beacon": {
  "types": "./dist/transport-beacon.d.ts",
  "import": "./dist/transport-beacon.mjs",
  "require": "./dist/transport-beacon.cjs"
}
```

`sideEffects` stays `false` at the package level. The transport's
own code is pure until `createBeaconTransport()` is invoked.

### Public surface of the subpath

```ts
// @your-org/frontend-logging-sdk/transport-beacon
export function createBeaconTransport(
  options: BeaconTransportOptions,
): Transport;

export interface BeaconTransportOptions {
  endpoint: string;
  batching?: {
    maxBatchSize: number;     // >= 1, <= 1000
    maxBatchAgeMs?: number;   // >= 0, no upper bound (consumer judgment)
  };
  allowInsecureLoopback?: boolean;  // default false
  name?: string;                    // default 'beacon'
  /** Async-drop diagnostics hook. See "Failure Modes & Error Codes". */
  onInternalError?: (err: Error) => void;
}
```

The factory returns a `Transport` (the same interface from
`@your-org/frontend-logging-sdk`) — consumers pass the result directly
into `configureLogging({ transports: [...] })`.

The `onInternalError` option is the channel through which **async**
drop paths (fetch keepalive rejection, timer-fired batch flush
failure, pagehide flush failure) surface. Sync drops also route
through the same hook for consistency. Recommended pattern: the
consumer passes the same callback to both
`LoggerConfig.onInternalError` and
`BeaconTransportOptions.onInternalError`.

### Delivery pipeline (single event, default mode)

```text
configuredTransport.send(event)
  → SafeTransport.send(event)               # feature 001's failure-isolation wrapper
      → BeaconTransport.send(event)
          → JSON.stringify(event)           # may throw on circular refs (shouldn't — sanitizer normalized)
          → if size > 64 KiB:
              → onInternalError(oversized_event); return
          → if first-send AND not yet attached:
              → lazyAttachPagehideListener()
          → tryBeacon(blob)                  # navigator.sendBeacon(endpoint, blob)
              → returned true? done.
              → returned false / unavailable? fall through.
          → tryFetchKeepalive(payload)       # fetch POST keepalive
              → resolves 2xx? done.
              → rejects / non-2xx? onInternalError(transport_send_failed); return
```

### Delivery pipeline (batching mode)

```text
configuredTransport.send(event)
  → SafeTransport.send(event)
      → BeaconTransport.send(event)
          → JSON.stringify(event)
          → if size > 64 KiB:                 # oversized single event
              → onInternalError(oversized_event); return     # never enters batch
          → if first-send AND not yet attached:
              → lazyAttachPagehideListener()
              → if maxBatchAgeMs is set:
                  → startMaxAgeTimer()        # one-shot setTimeout per batch lifetime
          → batch.push(event)
          → if batch.length >= maxBatchSize OR maxAgeTimer fired:
              → flushBatch()

flushBatch()
  → envelope = JSON.stringify({ events: batch })
  → batch = []                                # clear buffer BEFORE attempting send so a re-entrant call sees empty
  → cancelMaxAgeTimer()
  → tryBeacon(envelope) || tryFetchKeepalive(envelope)
      → success: done.
      → both failed: onInternalError(beacon_batch_drop, { droppedCount: batch.length })

pagehide handler
  → if batch is non-empty: flushBatch()       # one final attempt

shutdown()
  → if batch is non-empty: synchronous best-effort flushBatch()
  → cancelMaxAgeTimer()
  → removeListener()
  → mark shut-down; subsequent send() calls are no-ops
```

### Constructor — side-effect-free

`createBeaconTransport(options)` does **only**:

1. Validate `options.endpoint` (scheme check, optional loopback
   allowlist). Throw on violation.
2. Validate `options.batching` shape if present (positive integer
   `maxBatchSize` ≤ 1000; non-negative `maxBatchAgeMs`). Throw on
   violation.
3. Allocate the small instance state object (endpoint, name, batching
   config, in-memory buffer if batching, listener-installed flag,
   shutdown flag).
4. Return the `Transport`-shaped object.

It does **not**:
- Attach any global listener (deferred to first `send()`).
- Start any timer (deferred to first `send()` in batching mode).
- Read any ambient browser state (`location`, `document.cookie`, env
  vars, `navigator.userAgent`).
- Call `navigator.sendBeacon` or `fetch`.
- Allocate any per-Logger or per-runtime state — there is no Logger
  or runtime visible to the transport at construction.

### Listener attachment — lazy, gated, single-install

On the first `send()` call (default mode) or the first `send()` that
enters the batch (batching mode), the transport attaches a `pagehide`
handler to `globalThis` (gated by `typeof window !== 'undefined'`).
A `installed` flag prevents a second install. `shutdown()` removes
the listener and clears the flag.

A `visibilitychange` listener is **not** installed in v1 — `pagehide`
covers the unload race and a `visibilitychange === 'hidden'` listener
would duplicate that work without adding signal. This decision is
captured in research §3.

### Multi-instance coexistence

Each call to `createBeaconTransport(options)` returns a fresh closure
with its own buffer, its own endpoint, its own listener-installed
flag, and its own `name`. The transport holds no module-scoped
mutable state. Two beacon transports against two endpoints in one
runtime each receive every event from the pipeline (the runtime
iterates `transports`), each install their own `pagehide` handler
(both gated by their own `installed` flag), and report drops with
their own `transport.name` distinguishing the error notice.

## Failure Modes & Error Codes

This feature introduces a **subpath-owned** `BeaconError` class
(`extends Error`) with five `BeaconErrorCode` values. The class lives
at `src/transport-beacon/errors.ts` and is **not** exported. The codes
are **not** added to feature 001's `PackageErrorCode` union — the
subpath has zero runtime imports from `src/internal/**` per TB-11.

`BeaconError` shape is by-convention compatible with `PackageError`:

```ts
class BeaconError extends Error {
  readonly code: BeaconErrorCode;
  readonly transportName: string;
  declare cause?: unknown;
}
```

So a consumer's `onInternalError` handler reading `err.code` and
`err.transportName` sees a unified shape regardless of whether the
notice came from `SafeTransport` (a `PackageError`) or the beacon
transport itself (a `BeaconError`).

The five codes:

- `oversized_event` — single event's serialized body exceeds the
  ~64 KiB sendBeacon size limit. One notice per session. Payload
  metadata: event `message` (≤ 256 chars) + serialized byte count.
- `beacon_batch_drop` — a batch flush attempt failed (sendBeacon
  refused, fetch fallback rejected, or serialized envelope > 64 KiB).
  One notice per session. Payload metadata: drop count + reason
  summary.
- `beacon_unavailable` — the transport saw no usable delivery
  primitive (neither `navigator.sendBeacon` nor `fetch` is available).
  One notice per session. No drop count.
- `transport_send_failed` — default-mode single-event drop after
  sendBeacon refused and fetch fallback rejected.
- `transport_shutdown_failed` — shutdown-flush threw unexpectedly
  (defense-in-depth).

All drop paths — sync and async — route through
`BeaconTransportOptions.onInternalError` (defaults to a no-op). This
is the ONLY notification channel; the transport never throws from
`send()`/`flush()`/`shutdown()` and never returns a rejecting Promise.
Feature 001's `SafeTransport` still wraps the beacon transport for
defense-in-depth, but in normal operation its notify path is
unreachable.

| Failure                                             | Behavior                                          | Code                  |
|-----------------------------------------------------|----------------------------------------------------|-----------------------|
| Construction with non-HTTPS endpoint                | Throw at construction (a plain `Error` / `TypeError`, NOT a `BeaconError`) | — (thrown to caller)  |
| Construction with non-loopback `http://` AND `allowInsecureLoopback: true` | Throw at construction                              | —                     |
| Construction with invalid `batching.maxBatchSize`   | Throw at construction                              | —                     |
| `JSON.stringify(event)` throws                      | Drop event; one notice                             | `transport_send_failed` |
| Serialized body > 64 KiB (default mode)             | Drop event; one notice per session                 | `oversized_event`     |
| Serialized body > 64 KiB (batch mode, single event) | Eject from batch; one notice per session; remaining batch still flushes | `oversized_event`     |
| Serialized batch envelope > 64 KiB                  | Same as batch-flush-failure path                   | `beacon_batch_drop`   |
| `sendBeacon` returned false (default mode)          | Try fetch keepalive; on failure drop with notice  | `transport_send_failed` |
| `sendBeacon` returned false (batch mode)            | Try fetch keepalive; on failure drop entire batch | `beacon_batch_drop`   |
| `fetch` rejected / non-2xx                          | Drop event/batch; one notice per session          | `transport_send_failed` / `beacon_batch_drop` |
| Both `sendBeacon` AND `fetch` unavailable           | Drop event; one notice per session                | `beacon_unavailable`  |
| `pagehide` fires with empty buffer                  | No-op                                              | —                     |
| `pagehide` fires with non-empty buffer; flush fails | One drop notice                                    | `beacon_batch_drop`   |
| `shutdown()` with empty buffer                      | Remove listener; resolve                          | —                     |
| `shutdown()` with non-empty buffer; flush fails     | One drop notice; resolve                          | `beacon_batch_drop`   |
| Second `shutdown()`                                 | No-op; resolve                                     | —                     |

## Security & Privacy Review

Required by the constitution's Delivery Workflow gate. Confirmed:

(a) **No new path can leak secrets.** The transport delivers the
    post-pipeline `LogEvent` verbatim. Sanitization, URL scrubbing,
    redaction, and control-char escaping all ran upstream. The
    transport does not add headers carrying event content, does not
    compose query params, does not enrich the event with any local
    state.
(b) **Redaction and fail-closed behavior still hold.** The pipeline
    upstream of the transport is unchanged. If the redactor failed,
    the dispatcher dropped the event and `onInternalError` already
    fired — the transport never sees it. The transport itself does
    not run any redactor; it has nothing to fail-close.
(c) **Integrity-relevant behavior is documented.** Every drop path
    surfaces through `onInternalError` with a documented
    `PackageErrorCode`. No silent reorder, no silent deduplicate, no
    silent transform. Batching preserves emission order inside the
    envelope.
(d) **Loopback relaxation is opt-in and visible.** The
    `allowInsecureLoopback: true` flag is at the call site, refuses
    any host other than `localhost`/`127.0.0.1`/`[::1]`, is never
    readable from ambient state, and the construction-time error on a
    non-loopback `http://` host names the endpoint, the flag, and the
    allowlist.
(e) **No new vendor surface.** The transport adds no Authorization
    header, no cookie write, no third-party SDK. The fetch fallback
    uses `credentials: 'same-origin'` to avoid sending cookies
    cross-origin by default.

## Lightweight & Federated Runtime Check

Required by the constitution's Lightweight Logger & Federated Runtime
gate. Confirmed:

(a) **Many transport instances per page do not incur per-instance
    initialization.** Constructing N transports = N closure
    allocations and N small state objects. Zero listener
    installations, zero network calls, zero timers, zero ambient
    reads. Locked by SC-006 and the construction-sweep test.
(b) **Federated module loggers do not accidentally replace the
    host's configured runtime.** The transport instance is owned by
    the host's `ConfiguredRuntime` (via `LoggerConfig.transports`).
    Federated module loggers emit through the host's runtime via
    `createLogger({ module })` — they neither construct nor configure
    a beacon transport in the normal path. A module that does
    construct one in isolation (standalone dev mode) is supported but
    MUST NOT call `configureLogging()` in production unless the
    documented host/module ownership contract intentionally permits
    override (FR-032 from feature 001, unchanged).
(c) **Duplicate-package-copy behavior matches the documented
    classification.** Inherits **isolated** from feature 001 (FR-033).
    Each physical copy of the package carries its own
    beacon transport factory. Copies do not share buffers, listeners,
    or sequence state.

## Project Structure

### Documentation (this feature)

```text
specs/002-beacon-transport/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── transport-beacon-public-api.md
│   ├── delivery.md
│   ├── batching.md
│   └── failure-modes.md
├── checklists/          # Per-phase review checklists and the final-review record (T037)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by this command)
```

### Source Code (repository root)

```text
src/
├── index.ts                          # default entry — UNCHANGED
├── api/, runtime/, config/, context/,
│   pipeline/, transport/, testing/,
│   internal/                         # all UNCHANGED
└── transport-beacon/                 # NEW subpath source
    ├── index.ts                      # subpath public exports
    ├── beacon-transport.ts           # createBeaconTransport factory + Transport
    ├── delivery.ts                   # sendBeacon + fetch keepalive primitives
    ├── batcher.ts                    # opt-in batching state machine
    ├── endpoint-validation.ts        # HTTPS + loopback allowlist check
    ├── lifecycle.ts                  # pagehide listener attach/detach
    └── errors.ts                     # subpath-owned BeaconError + BeaconErrorCode

tests/
├── contract/
│   └── transport-beacon.contract.test.ts                  # NEW
├── security/
│   ├── transport-beacon-secret-sweep.security.test.ts     # NEW
│   └── transport-beacon-bundle-shape.security.test.ts     # NEW (extends T049 pattern)
├── integration/
│   ├── transport-beacon-host-module.integration.test.ts   # NEW
│   └── transport-beacon-batching.integration.test.ts      # NEW
├── performance/
│   └── transport-beacon-construction.performance.test.ts  # NEW
└── unit/
    └── transport-beacon/                                  # NEW directory
        ├── endpoint-validation.test.ts
        ├── delivery.test.ts
        ├── batcher.test.ts
        └── lifecycle.test.ts

examples/
├── host-app/                         # updated to import the first-party transport
├── federated-module/                 # updated to import the first-party transport
└── shared/
    └── beacon-transport.ts           # REMOVED (replaced by the first-party import)

docs/
└── safe-logging.md                   # gains a "Beacon transport" section

package.json                          # exports map gains './transport-beacon'
tsup.config.ts                        # entry gains 'transport-beacon'
README.md                             # quickstart updated to show the new import
```

**Structure Decision**: The single-package layout from feature 001 is
preserved. The new subpath lives at `src/transport-beacon/` so the
boundary between it and the core is filesystem-visible. The new
subpath's `index.ts` re-exports the factory and types — that is the
**only** module reachable through the `./transport-beacon` entry.

## Phase 0: Research

See [research.md](./research.md) for full findings. Topics covered:

1. **sendBeacon size limits across modern browsers** (~64 KiB
   per-origin queue is the effective cap to design against).
2. **fetch keepalive size limits** (same effective ~64 KiB cap;
   keepalive shares the budget with in-flight beacon calls).
3. **pagehide vs. visibilitychange vs. beforeunload** for unload
   delivery (pagehide is the right primitive in 2026 browsers).
4. **`Transport` interface re-import strategy** from the new subpath
   without crossing the `src/internal/**` boundary (re-import the
   public type from the package's own root via the same import path
   consumers use, gated by a build-time path alias in tests and a
   relative path in the source).
5. **Subpath-owned `BeaconError` class** — the new subpath defines
   its own `BeaconError extends Error` instead of extending the core's
   `PackageErrorCode` union. Keeps the subpath boundary clean
   (no `src/internal/**` imports) while preserving a consistent
   `.code` / `.transportName` shape for diagnostics handlers.
6. **Batching strategy** — single in-memory array, length + age
   triggers, flush-on-pagehide, flush-on-shutdown. Why not a
   ring buffer / priority queue / per-level batching.
7. **Subpath bundle shape verification** — extending feature 001's
   T049 / T070 audits to scan the new subpath's built output.

All [NEEDS CLARIFICATION] from spec.md were resolved by the
`/speckit-clarify` session on 2026-05-27 (FR-009, FR-016, FR-017 →
`## Clarifications` in spec.md). Phase 0 research surfaces no
additional unresolved decisions.

## Phase 1: Design & Contracts

See:

- [data-model.md](./data-model.md) — `BeaconTransport` instance shape,
  `BeaconTransportOptions`, `BatchEnvelope`, `DropNotice`, and the
  internal state-machine of the batcher.
- [contracts/transport-beacon-public-api.md](./contracts/transport-beacon-public-api.md)
  — TB-1..TB-N public-surface contract assertions for the new
  subpath.
- [contracts/delivery.md](./contracts/delivery.md) — delivery
  primitive selection, fallback rules, and the per-emit lifecycle.
- [contracts/batching.md](./contracts/batching.md) — opt-in
  batching state-machine, envelope shape, flush triggers,
  drop-notice rules.
- [contracts/failure-modes.md](./contracts/failure-modes.md) — full
  enumeration of failure modes, the `BeaconErrorCode` mapping, and
  the rate-limit guarantees mirroring FS-12.
- [quickstart.md](./quickstart.md) — consumer-facing five-minute
  walkthrough, including the federated-module pattern.

### Agent context update

This plan replaces the active SPECKIT pointer in `CLAUDE.md` (the
agent context file) so future Claude sessions opened against this
branch read this plan first.

## Post-Design Constitution Re-check

All seven principles (v1.2.0) PASS after Phase 1 design:

- **I. Stable Consumer API**: default entry unchanged; new subpath is
  the only reachable path; safe defaults at the call site.
- **II. Browser Resilience**: all primitives wrapped; `SafeTransport`
  + per-transport try/catch; no path can propagate to caller.
- **III. Framework-Neutral Structured Observability**: JSON-encoded
  `LogEvent` or `BatchEnvelope`; no vendor data model; bounded shape
  inherited from the pipeline.
- **IV. Secure & Privacy-Safe Logging by Default**: HTTPS at
  construction (loopback opt-in only); body-only; no Authorization;
  no cross-origin cookies by default.
- **V. Testable, Minimal, Maintainable**: dedicated test groups;
  small source footprint; first-party transport replaces the
  `examples/shared/` consumer example.
- **VI. Log Integrity & Monitoring Suitability**: every drop
  surfaces with a documented code; no silent reorder/dedup/mutate;
  batching preserves emission order.
- **VII. Lightweight Logger Instances & Federated Runtime**:
  construction side-effect-free; lazy gated listener; multi-instance
  coexistence; isolated duplicate-copy classification preserved.

## Complexity Tracking

*No constitution violations. No entries required.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| —         | —          | —                                    |
