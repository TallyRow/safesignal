# Feature Specification: Beacon Transport (first-party HTTPS peer transport)

**Feature Branch**: `002-beacon-transport`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Add a first-party HTTPS/beacon transport as
the first additive peer to the v1 core (ConsoleTransport, NoopTransport).
This is the package's first concrete validation of the peer-transport
architecture landed in feature 001-structured-logging-core's
'Vendor-Neutral Core Architecture' (plan.md). The transport ships as an
additional named entry in the package's exports map — it MUST NOT be
wired into the default emit path, MUST NOT alter the public surface of
the core, and MUST be opt-in via explicit consumer code."

## Clarifications

### Session 2026-05-27

- Q: FR-009 — Distribution mechanism for the new transport entry: subpath export of this package vs. sibling npm package? → A: Subpath export at `./transport-beacon` of `@your-org/frontend-logging-sdk`. Single `package.json`, single CI, single version; the `exports` map structurally enforces the boundary the same way `./testing` does; no version-skew risk between core and transport.
- Q: FR-016 — Localhost development relaxation pattern for `http://localhost` / `http://127.0.0.1`? → A: Explicit `allowInsecureLoopback?: boolean` constructor flag (default `false`). When `true`, `http://` is permitted **only** when the host is in the loopback allowlist (`localhost`, `127.0.0.1`, `[::1]`); every other non-HTTPS endpoint still throws at construction. Ambient-environment-driven relaxation (NODE_ENV, env vars, hostname sniffing) is explicitly rejected — the flag must be visible at the call site.
- Q: FR-017 — Oversized event body handling when the serialized payload exceeds `sendBeacon`'s ~64 KB limit? → A: Drop the single oversized event, fire `onInternalError` exactly once per session with documented error code `oversized_event` carrying the event message and serialized byte count; never fall back to URL-based delivery; do not attempt the fetch-keepalive fallback for this case (it shares the same effective per-origin budget). Refuse-at-pipeline is explicitly out of scope — this stays at the transport boundary.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Host application configures HTTPS delivery without writing transport plumbing (Priority: P1)

A frontend application developer wants every `warn` and `error` event
their app produces to reach the team's ingestion endpoint over HTTPS,
delivered in the request body, secure against page-unload races. Today
they copy `examples/shared/beacon-transport.ts` by hand, re-deriving the
behavior the package's transport contract already specifies. With this
feature they install the package and pull in the canonical beacon
transport from an explicit named entry; the transport's defaults match
the contract.

**Why this priority**: This is the feature's core value. Without it
every consumer rebuilds the same transport, drift accumulates, and the
secure-by-default posture of the core is undermined at the boundary
the package is supposed to make easy.

**Independent Test**: The host configures logging with a single beacon
transport pointed at an HTTPS endpoint; emits one `warn`-level event;
asserts exactly one HTTPS body-only network call leaves the page,
carrying the post-pipeline event payload and no other content. Tests
intercept network calls via a test double — no real network is needed.

**Acceptance Scenarios**:

1. **Given** a host app configures the beacon transport with an
   `https://logs.example.com/ingest` endpoint, **When** the app emits
   one `warn` event, **Then** exactly one network call is made to that
   endpoint, the request method is POST or `sendBeacon`-equivalent, the
   request body is a JSON-serialized post-pipeline `LogEvent`, and the
   request URL carries no query parameters and no fragment.
2. **Given** the beacon transport is configured, **When** the host app
   emits 100 events at `info`, `warn`, and `error` levels mixed,
   **Then** the transport produces exactly 100 network calls (default
   no-batching mode), each carrying exactly one event.
3. **Given** the host app instantiates the beacon transport with an
   endpoint that does NOT use HTTPS, **When** construction completes,
   **Then** construction throws a documented error before any logger is
   created and before any listener is attached. The error names the
   endpoint and the violated scheme constraint.
4. **Given** the host app calls `shutdown()` on the configured runtime,
   **When** shutdown completes, **Then** every listener the transport
   attached during operation is removed, every in-flight event has been
   delivered or accounted for via the documented drop notice, and the
   transport accepts no further `send()` calls.
5. **Given** a host app configures the beacon transport, **When** the
   browser fires `pagehide` (tab close, navigation), **Then** any
   unsent in-memory event(s) are delivered in one final body-only call
   before the page unloads.

---

### User Story 2 — Federated modules share the host's beacon transport without setup or interference (Priority: P2)

A federated module developer's module loads into a host application
that has already configured the beacon transport at boot. The module
calls `createLogger({ module })` and emits events. Those events flow
through the host's transport, identifiably attributed to the module via
`context.module`, and the module does not — under any circumstance —
need to install its own transport, override the host's transport, or
allocate its own delivery pipeline.

**Why this priority**: This proves the transport composes with FR-029
through FR-033 (the federated/many-Logger architecture from feature
001). A transport that quietly forces per-module state, per-module
listeners, or per-module network setup would break the package's
scale model and the host/module ownership contract.

**Independent Test**: One host configures one beacon transport; 50
synthetic module loggers each emit 20 events through it; assert
exactly 1,000 network calls (default mode) or one batch of 1,000
events (batching mode), no duplication, no loss, every payload carries
correct module identity, no additional listeners were attached after
the first emission.

**Acceptance Scenarios**:

1. **Given** a host configures the beacon transport and 50 module
   loggers are created against the active runtime, **When** each
   module emits 20 events, **Then** the transport produces exactly
   1,000 network calls (default mode); each call's body carries the
   originating `context.module.name`; no two calls carry the same
   event payload.
2. **Given** the same setup with batching enabled, **When** the same
   1,000 events are emitted, **Then** the transport produces N calls
   each containing M events where `N × M == 1,000`, the batch envelope
   names every event, and no event appears in more than one batch.
3. **Given** module code attempts to construct its own beacon transport
   with a different endpoint while the host's transport is already
   active, **When** the module's constructor runs, **Then** the module
   transport is independent of the host's transport — it does not
   share buffers, listeners, or endpoint state with the host's
   instance, and it does not replace the host's active configuration
   unless `configureLogging()` is explicitly called.
4. **Given** the host emits an event after a federated module has
   created its own beacon-transport instance but has NOT called
   `configureLogging()`, **When** the host's event flows through the
   pipeline, **Then** the host's already-active transport receives the
   event, not the module's unwired instance.

---

### User Story 3 — Opt-in micro-batching surfaces every drop through the diagnostic hook (Priority: P3)

A consumer with high-volume telemetry wants to reduce network call
frequency on chatty pages. They opt into the transport's micro-batching
behavior. Any time a batch is forced to drop events (browser refuses
`sendBeacon`, fetch keepalive failure, page unloads mid-flush), the
diagnostic hook (`onInternalError`) is notified exactly once for that
batch with the documented drop count and reason. The consumer can wire
that hook into their existing error reporter.

**Why this priority**: Lower-frequency than P1/P2 in real consumer
usage, but a non-trivial portion of consumers will opt in and the
behavior must be specified so it doesn't undermine Principle VI
(documented drops, no silent loss). Defaults remain "no batching" so
P1/P2 consumers are not silently changed.

**Independent Test**: Enable batching. Drive a scenario where exactly
one batch is forced to drop (test-double `sendBeacon` returns false and
test-double `fetch` rejects). Assert: zero events delivered for that
batch, exactly one `onInternalError` notice with the drop count and a
documented error code, all subsequent batches deliver normally.

**Acceptance Scenarios**:

1. **Given** batching enabled with a small batch size, **When** events
   accumulate up to the size threshold, **Then** the transport
   produces one network call carrying the documented batch envelope
   `{ events: [...] }` with the events in pipeline-emission order.
2. **Given** batching enabled, **When** the network primitives refuse
   a flush (sendBeacon returns false AND fetch rejects), **Then**
   `onInternalError` fires exactly once for that batch with a
   documented error code naming the dropped count; no partial
   delivery; no retry.
3. **Given** batching enabled and a pending in-memory batch, **When**
   the browser fires `pagehide`, **Then** the transport attempts one
   final flush; if the flush succeeds the drop count is 0; if it fails
   the drop notice fires once for the pending batch.
4. **Given** batching enabled, **When** `shutdown()` is called with a
   non-empty pending batch, **Then** the transport attempts one final
   synchronous flush; if any event is dropped, exactly one
   `onInternalError` notice fires before `shutdown()` resolves.
5. **Given** batching disabled (the default), **When** the same events
   are emitted, **Then** each emission produces its own network call
   and no batch-related diagnostic ever fires.

---

### Edge Cases

- **HTTPS scheme violation**: a non-HTTPS endpoint (`http://`, `ws://`,
  `file://`, relative path) supplied at construction MUST be rejected
  at construction time — before any logger derives the runtime — with
  an error that names the violated constraint. The transport MUST NOT
  attempt a runtime probe to "test" the endpoint.
- **Localhost development relaxation**: applications iterating locally
  may need `http://localhost` / `http://127.0.0.1` endpoints. The
  relaxation is gated by an explicit
  `allowInsecureLoopback: true` constructor flag (default `false`).
  When set, `http://` is permitted **only** for hosts in the loopback
  allowlist (`localhost`, `127.0.0.1`, `[::1]`); every other
  non-HTTPS endpoint still throws at construction. The flag is never
  driven by ambient state (`NODE_ENV`, env vars, hostname sniffing).
- **Oversized event body**: when a single event's JSON serialization
  exceeds the browser's `sendBeacon` size limit (~64 KB), the transport
  drops that one event and fires `onInternalError` once per session
  with error code `oversized_event` (payload: event `message` + byte
  count; never the event's attrs/error/context). No URL fallback
  (forbidden by T-S1..T-S5); no fetch-keepalive fallback (same
  effective budget). With batching enabled, an oversized event inside
  a pending batch is ejected from the batch with its own notice
  before the remaining batch is flushed.
- **`sendBeacon` returns false**: browser refused the payload (commonly
  size limit, post-pageload restriction, or quota). The transport
  falls back to `fetch(endpoint, { method: 'POST', body, keepalive:
  true })` exactly once. If the fetch also fails, the event is dropped
  with a notice via `onInternalError`. There is no retry loop.
- **`sendBeacon` unavailable**: legacy browsers without
  `navigator.sendBeacon` (or environments where it is undefined) fall
  through to the keepalive-fetch path immediately. Construction
  succeeds; the transport silently uses the fallback as its primary.
- **`fetch` unavailable**: vanishingly rare in 2026 browsers, but if
  neither primitive is available, every emission produces an
  `onInternalError` notice and no delivery. The notice rate-limit
  guarantee from FS-12 still holds: at most one notice per session for
  this failure class.
- **`pagehide` racing `send()`**: the page begins unloading before the
  transport's in-memory buffer is flushed. The transport's pagehide
  listener attempts the final flush; events that the browser refuses
  at that point are reported via `onInternalError` once.
- **Multiple instances**: a host configures two beacon transports
  pointed at different endpoints. They MUST coexist without sharing
  buffers, listeners, or sequence numbers; both receive every event
  the pipeline emits; their drop notices, if any, are distinguishable
  via the transport `name` field on the error.
- **Reconfigure during in-flight batch**: `configureLogging()` runs
  while a beacon transport from the previous runtime has a pending
  batch. The previous runtime's `shutdown()` flow MUST drive that
  batch to completion (or to one drop notice) before the runtime is
  torn down.
- **Endpoint mutation post-construction**: the endpoint is fixed at
  construction. A consumer who wants to retarget MUST construct a new
  transport and re-`configureLogging()`. The transport MUST NOT expose
  a runtime-mutable endpoint.
- **Body containing pipeline-redacted markers**: the transport
  delivers the post-pipeline event verbatim. `[REDACTED]` and
  `[Circular]` markers MUST appear on the wire exactly as the pipeline
  produced them — no further transform at the transport layer.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**:
  - **New named entry** in the package's `exports` map at
    `./transport-beacon` exposing a transport factory plus its
    configuration option types. Consumer import path:
    `@your-org/frontend-logging-sdk/transport-beacon`.
  - **Zero changes** to the v1 default entry (`@your-org/frontend-
    logging-sdk`). `createLogger`, `configureLogging`, `getRootLogger`,
    `createRedactor`, `scrubUrl`, `ConsoleTransport`, `NoopTransport`,
    and all type re-exports remain bit-identical.
  - **Zero changes** to the existing `./testing` subpath
    (`assertTransportContract`, `makeSecretFixture`). The new beacon
    transport will be validated against the existing
    `assertTransportContract` helper.

- **Compatibility Impact**: **Additive.** No existing consumer
  call-site changes. No existing test changes other than the new
  test suite for this feature.

- **Migration Notes**: None required. The transport is opt-in via
  explicit named import; consumers who do not import it are unaffected.
  Consumers who currently maintain a hand-written beacon transport via
  `examples/shared/beacon-transport.ts` can replace it with the
  first-party transport at a pace they control.

- **Host/Module Usage Impact**:
  - Host applications normally instantiate the beacon transport and
    pass it to `configureLogging({ transports: [...] })`. Federated
    modules emit through the host's already-configured runtime
    (FR-030); no module needs to instantiate the transport for itself.
  - A federated module that instantiates the transport in isolation
    (e.g., during standalone development) is supported — the transport
    is safe for multi-instance coexistence — but the module MUST NOT
    call `configureLogging()` in production unless the documented
    host/module ownership contract intentionally permits override
    (FR-032 from feature 001).
  - Duplicate-package-copy behavior inherits the **isolated**
    classification from feature 001 (FR-033). Each physical copy of
    the package carries its own beacon transport factory; copies do
    not share buffers, listeners, or sequence state.

- **Security & Privacy Considerations**:
  - HTTPS-only enforcement is a structural constraint: non-HTTPS
    endpoints are refused at construction time.
  - Body-only delivery is structural: no URL parameter, no fragment,
    no header carrying event content. Locked by the T-S1..T-S5
    transport security contract (existing).
  - No header injection API. Adding headers in v1 would normalize
    Authorization-in-transport, which the core's security posture
    explicitly forbids. Future authentication patterns may surface
    via a constructor hook in a later feature; not in scope here.
  - No retry beyond the sendBeacon→fetch-keepalive fallback. Retry
    loops on persistent failure would risk amplifying outage signals
    and obscure the drop attribution.
  - Event payload is delivered verbatim from the pipeline output. The
    transport performs zero additional transformation, redaction, or
    sanitization — those are upstream invariants of the core pipeline.

- **Log Integrity Considerations**:
  - **No silent drops.** Every dropped event surfaces through
    `onInternalError` with a documented error code and the count.
  - **No silent reordering, deduplication, or mutation.** Events flow
    through the transport in pipeline-emission order. Batches preserve
    that order in the envelope.
  - **Documented drop scenarios** (updated in `docs/safe-logging.md`
    alongside the existing "Documented drops, transforms, and bounded
    behavior" section):
    - `sendBeacon` refused + fetch fallback failed (per-event in
      no-batch mode; per-batch in batch mode).
    - Both primitives unavailable (per-event; one notice per session
      via the existing FS-12 budget).
    - Oversized event body (serialized payload exceeds ~64 KB) — one
      `oversized_event` notice per session, no URL or keepalive
      fallback. In batch mode the oversized event is ejected from the
      batch with its own notice; remaining batch events still flush.
    - `pagehide` race with pending buffer.
    - `shutdown()` with pending buffer that the final flush cannot
      drain.

- **Runtime Scale & Federated Deployment Impact**:
  - **Construction is side-effect-free.** Constructing a beacon
    transport attaches zero listeners, opens zero network connections,
    reads zero ambient browser state (no `location`, `document.cookie`,
    `localStorage`, `navigator.*` beyond the `sendBeacon` reference at
    the call site of `send()`).
  - **Listener attachment is lazy.** `pagehide` / `visibilitychange`
    listeners (if used) are installed at most once per transport
    instance, gated against double-install, on the first call to
    `send()` — never at construction, never on Logger creation.
  - **Per-instance allocation is constant.** Constructing N beacon
    transports allocates O(N) memory and zero N-amplified resources.
  - **Multi-instance coexistence.** N transports against N endpoints
    keep N independent buffers, N independent listeners (each its own
    instance), N independent sequence numbers. No cross-instance
    coupling.
  - **No effect on Logger creation cost.** Logger creation continues
    to satisfy FR-029 — no per-Logger transport state, no per-Logger
    listener, no per-Logger network setup. The transport's state lives
    once on the `ConfiguredRuntime`, shared across every Logger.

## Requirements *(mandatory)*

### Functional Requirements

#### Constitutional baselines (inherited)

- **FR-001**: The package MUST keep the v1 default entry
  (`@your-org/frontend-logging-sdk`) bit-identical in shape after this
  feature. No new exports, no removed exports, no type signature
  changes on existing exports. (Principle I — Stable Consumer API)
- **FR-002**: The beacon transport MUST be reachable only via an
  explicit named entry distinct from the default entry — either a
  subpath export of this package or a sibling npm package — and
  importing it MUST require the consumer to write that explicit
  import. The default entry MUST NOT re-export the transport.
  (Principle I)
- **FR-003**: The transport MUST NOT propagate any thrown error or
  rejected Promise from `send()`, `flush()`, or `shutdown()` into the
  caller. Sync throws are caught; rejected Promises are swallowed and
  surfaced exactly once per session via the existing `onInternalError`
  hook (inherits FS-1, FS-2, FS-12 from the core). Construction-time
  errors propagate normally — they happen outside the emit hot path
  and the consumer is the one calling the constructor.
  (Principle II — Browser-First Runtime Resilience)
- **FR-004**: The transport MUST emit structured events whose body
  shape is documented and machine-parseable. The body is JSON-encoded
  (one event per call OR a batch envelope of events) using the
  pipeline-produced `LogEvent` shape; the transport MUST NOT mutate,
  reorder, deduplicate, or transform the event payload.
  (Principle III — Framework-Neutral Structured Observability;
  Principle VI — Log Integrity)
- **FR-005**: The transport MUST be secure by default: it MUST refuse
  non-HTTPS endpoints at construction, MUST deliver event content only
  in the request body (never URL params, fragment, or
  header-as-content), MUST NOT introduce a default Authorization or
  authentication mechanism, and MUST NOT enable any behavior whose
  primary risk is leakage of secrets or session identifiers.
  (Principle IV — Secure & Privacy-Safe Logging by Default)
- **FR-006**: The transport MUST be testable against the existing
  `assertTransportContract` helper from the `./testing` subpath. Every
  transport-contract assertion (T-1..T-9) and every transport-security
  assertion (T-S1..T-S5) MUST pass against the beacon transport.
  (Principle V — Testable, Minimal, Maintainable Package Design)
- **FR-007**: The transport MUST document every behavior that drops,
  reorders, batches, or transforms events. Drops fire `onInternalError`
  with a documented error code; reordering does not occur; batching
  only occurs when explicitly enabled and uses a documented envelope;
  the transport performs no event transformation.
  (Principle VI — Log Integrity & Monitoring Suitability)
- **FR-008**: Constructing the transport MUST be lightweight and
  side-effect-free: zero global listeners attached, zero network
  requests, zero ambient browser state reads. Listener attachment, if
  any, MUST happen on first `send()` and MUST be gated against
  double-install. Multiple instances MUST coexist without sharing
  buffers, listeners, or sequence state.
  (Principle VII — Lightweight Logger Instances & Federated Runtime
  Discipline; inherits FR-029 from feature 001 in spirit, applied to
  transport rather than Logger)

#### Distribution & exports surface

- **FR-009**: The new transport entry MUST be a **subpath export at
  `./transport-beacon`** of `@your-org/frontend-logging-sdk` (consumer
  import: `import { createBeaconTransport } from
  '@your-org/frontend-logging-sdk/transport-beacon'`). The entry MUST
  expose exactly one transport factory (a parameterless or
  options-taking function that returns a `Transport`) plus the type
  shape of its options. The subpath MUST be declared in the package's
  `exports` map alongside the default entry and `./testing`. A sibling
  npm package is **not** in scope for this feature; if a future
  independent release cadence becomes necessary, a sibling re-export
  may be added without removing this subpath.
- **FR-010**: The default-entry bundle (`dist/index.{mjs,cjs}`) MUST
  NOT include the beacon transport's code. The transport's bundle MUST
  NOT include the core pipeline's internal modules. One-way dependency:
  the transport may import public types from the core; the core never
  imports the transport. This MUST be locked by automated bundle-shape
  tests at the source-boundary and built-artifact level.
- **FR-011**: The new transport entry MUST be discoverable via the
  same `package.json` `exports` map mechanism that gates the default
  entry and the `./testing` subpath. Side effects flagged on the
  transport's entry MUST remain `false` (transport code is pure until
  consumed).

#### Delivery contract

- **FR-012**: The transport's primary delivery primitive MUST be
  `navigator.sendBeacon(endpoint, body)`. When the function is
  available and returns truthy, the transport considers the event
  delivered and does not retry.
- **FR-013**: When `navigator.sendBeacon` returns falsy OR is
  unavailable in the runtime, the transport MUST fall back to
  `fetch(endpoint, { method: 'POST', body, keepalive: true })`. The
  fallback runs at most once per `send()` call. If the fetch resolves
  successfully (HTTP 2xx), the event is delivered; if it rejects or
  resolves non-2xx, the event is dropped with one notice via
  `onInternalError`.
- **FR-014**: The request body MUST be a JSON-encoded representation
  of the post-pipeline `LogEvent` — exactly one event per call in
  default mode, or a documented envelope `{ events: LogEvent[] }` when
  batching is enabled.
- **FR-015**: The request URL MUST NOT carry any event content. No
  query parameters, no fragment, no path-segment encoding of event
  fields. The endpoint string is consumed exactly as the consumer
  supplied it.
- **FR-016**: The transport MUST refuse non-HTTPS endpoints at
  construction time by throwing an error that names the endpoint and
  the violated scheme constraint. Construction-time refusal predates
  any logger creation and any listener attachment. The **only**
  permitted exception is an explicit opt-in
  `allowInsecureLoopback?: boolean` constructor flag (default
  `false`). When `true`, the construction-time scheme check permits
  `http://` endpoints if and only if the host (per WHATWG URL parsing)
  matches one of `localhost`, `127.0.0.1`, or `[::1]`; every other
  non-HTTPS endpoint MUST still throw. The flag MUST NOT be readable
  from any ambient source (`process.env.*`, `globalThis.*`, URL
  parameters, `window.location`, build-tool define plugins are
  acceptable only insofar as they produce a literal value the consumer
  passes at the call site). Construction MUST throw if
  `allowInsecureLoopback` is `true` but the host is not in the
  loopback allowlist, with an error naming the endpoint, the flag,
  and the allowlist.
- **FR-017**: The transport MUST handle an event whose serialized body
  exceeds the browser's `sendBeacon` size limit (~64 KB) by **dropping
  the single oversized event** and firing `onInternalError` exactly
  once per session with documented error code `oversized_event`. The
  notice payload MUST include the event's `message` field and the
  serialized byte count; it MUST NOT include the event's `attrs`,
  `error`, or `context` content (to avoid leaking the same payload
  whose size was the problem). The transport MUST NOT fall back to
  URL-based delivery (forbidden by T-S1..T-S5) and MUST NOT attempt
  the `fetch` + `keepalive: true` fallback for this case (the
  keepalive budget shares the same ~64 KB-per-origin limit and would
  mask the size signal). When batching is enabled, an oversized
  single event inside a pending batch MUST be ejected from the batch
  with its own `oversized_event` notice before the rest of the batch
  is flushed; the batch flush itself proceeds with the remaining
  events. Detection MUST happen at the transport layer; this feature
  does NOT push size enforcement upstream into the core sanitizer.

#### Lifecycle

- **FR-018**: `shutdown()` on the transport MUST remove every listener
  the transport attached during operation, drive one final flush of
  any pending in-memory state, and accept no further `send()` calls.
  Idempotent: a second `shutdown()` call is a no-op that resolves
  successfully.
- **FR-019**: `flush()` on the transport MUST drive delivery of any
  pending in-memory state to completion or to one drop notice.
  Idempotent: a `flush()` call with no pending state resolves
  immediately.

#### Batching

- **FR-020**: Batching MUST be off by default. With default
  configuration, every accepted event produces exactly one network
  call carrying exactly that event.
- **FR-021**: Batching MUST be opt-in via an explicit constructor flag
  with documented threshold(s) (batch size, optional time window). The
  flag's name MUST make the opt-in nature visible at the call site.
- **FR-022**: When batching is enabled, every flush that drops events
  (sendBeacon refused, fetch fallback failed, page-unload race,
  shutdown drain failure) MUST emit exactly one `onInternalError`
  notice naming the drop count and a documented error code. The notice
  MUST NOT contain raw event content — only counts and structural
  metadata.

#### Federated & multi-instance

- **FR-023**: 1,000 events emitted by 50 distinct module loggers
  against one beacon transport MUST produce exactly 1,000 delivered
  events (default mode) — no duplication, no loss — and every
  delivered event MUST carry its originating module's identity in the
  body's `context.module` field.
- **FR-024**: Two beacon transports against two different endpoints
  configured in the same runtime MUST coexist with no cross-instance
  state sharing: independent buffers, independent listeners,
  independent sequence numbers, independent drop notices.

#### Testing surface

- **FR-025**: An automated end-to-end secret sweep against the beacon
  transport MUST verify no fixture value reaches the wire — mirroring
  feature 001's `tests/integration/secret-sweep.integration.test.ts`
  with the beacon transport as the in-memory observer's replacement
  via test-double `sendBeacon` / `fetch`.
- **FR-026**: A bundle-shape audit MUST verify (a) the transport's
  built bundle imports no observability-vendor SDK and no
  pipeline-internal module from the core's `dist/internal/**`, and
  (b) the default entry's built bundle does not include the
  transport's code.
- **FR-027**: A lightweight-construction sweep MUST verify
  constructing 1,000 beacon transports adds zero listeners, performs
  zero network calls, and performs zero ambient-state reads —
  mirroring T059 from feature 001 applied to the transport rather
  than the Logger.

### Key Entities

- **BeaconTransport (factory + instance)**: a `Transport` produced by
  the new entry's factory function. Carries its own buffer (if
  batching enabled), endpoint, and optional listener state. Honors the
  full `Transport` interface from feature 001.
- **BeaconTransportOptions**: the constructor options shape, including
  at minimum: `endpoint: string`, `batching?: { maxBatchSize: number;
  maxBatchAgeMs?: number }` (optional, off by default),
  `allowInsecureLoopback?: boolean` (default `false`; when `true`
  permits `http://` for hosts `localhost`, `127.0.0.1`, `[::1]` only).
- **BatchEnvelope**: the documented body shape when batching is
  enabled. Carries an `events: LogEvent[]` field in pipeline-emission
  order. No additional transport-level metadata fields beyond what is
  necessary to distinguish a batched body from a single-event body.
- **DropNotice**: an `Error`-shaped value passed to `onInternalError`
  when the transport drops events. Carries a documented error code
  (e.g., `oversized_event`, `transport_send_failed`,
  `beacon_batch_drop`, `beacon_unavailable`), the transport's `name`,
  the dropped count where applicable, and a non-leaky message. The
  `oversized_event` code additionally carries the originating event's
  `message` field and the serialized byte count, never its
  `attrs`/`error`/`context`. Concrete class is a design-time decision
  (see plan.md / data-model.md).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new consumer who follows the package's quickstart can
  configure HTTPS event delivery in **under 5 minutes** with **no
  hand-written transport code** — they import the beacon transport
  factory, supply an endpoint, and pass the result to
  `configureLogging({ transports: [...] })`.
- **SC-002**: 100% of the existing `assertTransportContract` helper's
  assertions (T-1..T-9 transport contract + T-S1..T-S5 transport
  security contract) pass against the beacon transport with default
  configuration.
- **SC-003**: 100% of the existing `assertTransportContract`
  assertions pass against the beacon transport with batching enabled.
- **SC-004**: An end-to-end secret sweep emits 100+ events carrying
  every documented fixture value across attributes, message, error,
  context, child loggers, and URL params; **zero fixture values reach
  the wire** as observed by the test-double network primitives.
- **SC-005**: A federated scenario with 50 module loggers emitting 20
  events each through one beacon transport produces **exactly 1,000
  network calls** in default mode (or **exactly one batch envelope
  containing all 1,000 events** with batching enabled). No
  duplication, no loss, every body carries correct module identity.
- **SC-006**: Constructing 1,000 beacon transports in a tight loop
  attaches **zero listeners**, performs **zero network calls**,
  performs **zero ambient-state reads** (no `location`,
  `document.cookie`, `localStorage`, `navigator.*` beyond the
  function-reference dereference at `send()` time).
- **SC-007**: The default-entry built bundle (`dist/index.{mjs,cjs}`)
  is **bit-identical or smaller** to the pre-feature snapshot — no
  beacon-transport code appears in it.
- **SC-008**: The new transport's built bundle is **under 5 KB
  gzipped** (subpath/sibling-package equivalent), since it carries
  only the delivery logic and not any pipeline machinery.
- **SC-009**: When batching is enabled and a drop is forced, exactly
  **one** `onInternalError` notice fires per dropped batch (rate-limit
  preserved per FS-12).
- **SC-010**: Reconfiguring logging with a different transport while a
  beacon transport from the previous runtime has a pending batch
  drives the pending batch to completion or to exactly one documented
  drop notice — **no silent loss**.
- **SC-011**: Documentation (`docs/safe-logging.md`, README, and the
  package's quickstart) shows the beacon transport as the recommended
  HTTPS path; the `examples/shared/beacon-transport.ts` consumer
  example is either replaced by an import of the first-party transport
  or kept only as a documented historical reference.
- **SC-012**: The `tests/security/bundle-shape.security.test.ts` and
  `tests/contract/dependency-pins.test.ts` suites from feature 001
  pass **unchanged** after this feature lands. The new transport
  introduces zero observability-vendor packages into `dependencies`
  (or, if delivered as a sibling package, into either package's
  `dependencies`).

## Assumptions

- The core's `Transport` interface from feature 001 — specifically the
  `send(event) -> void | Promise<void>`, optional `flush()`, optional
  `shutdown()` shape — is the surface this transport implements. No
  changes to that interface are in scope.
- The `onInternalError` diagnostic hook from feature 001 is the
  channel for drop notices on the runtime side. The beacon transport
  additionally accepts its own `onInternalError` hook via
  `BeaconTransportOptions` so async drops (timer-fired batch flush,
  pagehide-fired flush, fetch keepalive rejection observed outside
  the synchronous `send()` boundary) can surface. Consumers wire the
  same callback to both hooks; the hook receives an `Error` with a
  documented `code` and `transportName`.
- The browser environment provides `navigator.sendBeacon` and `fetch`
  with `keepalive: true` support — both are baseline-available in
  every modern browser in scope for this package. Legacy fallback
  paths cover the cases where they are not.
- Consumer-supplied endpoints are owned by the consumer's
  infrastructure team. This feature does NOT specify or constrain the
  ingestion-side protocol, schema, or response shape — the transport
  produces the body, the receiver decides what to do with it.
- The `assertTransportContract` helper from feature 001 is the
  canonical conformance bar. Any transport-contract behavior not yet
  captured there but exercised by this feature is a candidate for
  adding to that helper, but adding new assertions to
  `assertTransportContract` itself is out of scope for this feature.
- The "secure-by-default" posture inherited from feature 001 means the
  transport refuses obviously-unsafe configurations (non-HTTPS
  endpoints, ambient-state-driven relaxations) at construction time
  rather than attempting runtime detection or warning-only paths.
- Browser support targets match feature 001 (modern browsers, no
  IE11, no legacy WebView). Older environments without `sendBeacon`
  are covered by the keepalive-fetch fallback; environments without
  either produce one notice per session and otherwise no delivery.
