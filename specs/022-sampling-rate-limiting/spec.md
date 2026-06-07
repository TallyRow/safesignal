# Feature Specification: Opt-In Sampling / Rate-Limiting

**Feature Branch**: `022-sampling-rate-limiting`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "A documented, fail-safe sampler (head-based and/or rate-limit) as a transport wrapper or config option; off by default."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Transport-Level Sampler (Priority: P1)

An application owner wants to cap the volume of events shipped to a particular
backend (e.g., a third-party log ingestion service with a quota) without
modifying their existing transport. They wrap the transport in a sampler that
drops events according to a configured rule, and every drop is surfaced through
a standard observability path so nothing vanishes silently.

**Why this priority**: This is the core feature — if sampling doesn't exist, the
feature doesn't exist. Transport wrapping is the lowest-friction integration path
and matches the existing `SafeTransport` wrapper pattern.

**Independent Test**: Wrap a `ConsoleTransport` in a head-based sampler with a
50% rate, emit 100 events, verify approximately 50 reach the inner transport and
each dropped event fires a `onDrop` callback with the event metadata.

**Acceptance Scenarios**:

1. **Given** a transport wrapped in a head-based sampler configured at 25%,
   **When** 10,000 events are emitted, **Then** roughly 2,500 events reach the
   inner transport and the remaining 7,500 are dropped with a documented reason.
2. **Given** a transport wrapped in a rate-limit sampler configured at 10
   events/second, **When** 100 events are emitted in under 1 second, **Then**
   at most ~10 events reach the inner transport and the rest are dropped with a
   `rate_limited` reason.
3. **Given** a sampler wrapping any transport, **When** the sampler encounters an
   error during its own decision logic, **Then** the event is passed through to
   the inner transport (fail-open for the sampling decision — don't drop events
   because the sampler itself broke).
4. **Given** a sampler with `onDrop` configured, **When** an event is dropped,
   **Then** the `onDrop` callback receives the event's level, message, and the
   drop reason without exposing sensitive attribute values.

---

### User Story 2 - Config-Level Sampling (Priority: P2)

An application owner wants to configure sampling declaratively in
`configureLogging()` without manually constructing sampler wrappers. They add a
`sampling` section to the logging config and every transport inherits the
sampling behavior automatically.

**Why this priority**: Declarative config is the "safe path is the easy path"
pattern (Principle II). It's additive over the transport-wrapper approach from
US1 — the wrapper must work first, then the config shortcut layers on top.

**Independent Test**: Call `configureLogging()` with a `sampling` config section
specifying head-based at 10%, attach a `ConsoleTransport`, emit 100 events, and
verify the transport receives roughly 10 events.

**Acceptance Scenarios**:

1. **Given** `configureLogging()` called with `sampling: { type: 'head', rate: 0.1 }`
   and a `ConsoleTransport`, **When** 100 events are emitted, **Then** the
   console transport receives roughly 10 events.
2. **Given** `configureLogging()` called without a `sampling` section, **When**
   events are emitted, **Then** no sampling occurs (backward compatible — off by
   default).
3. **Given** `configureLogging()` called with `sampling` and multiple transports,
   **When** events are emitted, **Then** each transport independently samples
   (each gets its own sampler instance).

---

### User Story 3 - Observable Drops (Priority: P1)

An SRE investigating a missing log event needs to know definitively whether
sampling dropped it. The sampler MUST surface every drop through a standard
observability path — the existing `onInternalError` callback or an equivalent
structured notification — so downstream monitoring can track drop rates and
alert on unexpected sampling behavior.

**Why this priority**: Principle VII (Log Integrity) requires that any behavior
that drops events is documented and observable. Without this, the sampler would
violate the constitution and create silent data loss. Same priority as US1
because they ship together — no sampler without observability.

**Independent Test**: Configure a sampler with a `onDrop` callback, emit events
until drops occur, and assert the callback fires for every dropped event with
structured metadata (event level, drop reason, sampler name, timestamp).

**Acceptance Scenarios**:

1. **Given** a sampler with a drop callback configured, **When** an event is
   dropped due to sampling, **Then** the callback fires exactly once per
   dropped event with: the event's `level`, `message`, `timestamp`, and the
   `reason` for the drop (`head_sample` or `rate_limited`).
2. **Given** sampling is NOT configured (default), **When** events are emitted,
   **Then** no drop notifications fire (zero overhead when sampling is off).
3. **Given** a sampler configured with `onDrop` but no events are dropped
   (100% pass rate), **When** events are emitted, **Then** the `onDrop`
   callback never fires.
4. **Given** a consumer attempts to configure sampling without an `onDrop`
   callback, **When** `configureLogging()` is called, **Then** the
   configuration is rejected with a clear error (no silent drops — Principle VII).

---

### Edge Cases

- **Sampler error (fail-open)**: If the sampler's own decision logic throws or
  its random number source fails, the event passes through to the inner
  transport. A dropped event is wrong; a swallowed event is catastrophic.
- **Rate-limit clock across browser tab throttling**: When a tab is
  backgrounded and `setTimeout`/`requestAnimationFrame` are throttled, the
  rate-limit sampler's time window accounting must remain correct (no burst
  when the tab regains focus) or the behavior must be documented as a known
  limitation.
- **Head sampling with very low rates**: At 0% rate, every event is dropped
  (the sampler is effectively a no-op transport). At 100% rate, every event
  passes through (identity sampler). Both extremes must work correctly.
- **Rate limiting at zero**: A rate limit of 0 events/second drops everything.
  Must be distinguishable from "sampling not configured" in drop
  notifications.
- **Multiple samplers chained**: If a transport is wrapped in multiple
  samplers, each layer operates independently. The outermost sampler's drop is
  final — inner samplers never see already-dropped events.
- **Drop callback failure**: If the `onDrop` callback itself throws, the
  sampler MUST NOT propagate the error (Principle III — never-throw boundary).
  The sampler logs its own internal error and continues.
- **Sampling and redaction**: Sampler configuration (rate, type) and drop
  notifications MUST NOT leak sensitive event data. Drop callbacks receive
  level + message + reason only — never attribute values, context, or error
  objects.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: New exports: `SamplerConfig` type, `HeadSampler`
  transport wrapper factory, `RateLimitSampler` transport wrapper factory.
  Optional `sampling` field added to `LoggerConfig`. No existing exports
  changed or removed.
- **Compatibility Impact**: Additive — fully backward compatible. Default
  behavior unchanged (no sampling). Existing `Transport` implementations
  require zero changes.
- **Migration Notes**: None required. Consumers who want sampling wrap their
  transports or add the `sampling` config section.
- **Deprecation & Migration**: No contract is being deprecated or removed.
- **Host/Module Usage Impact**: The sampler is a transport wrapper — it follows
  the same transport lifecycle as other transports. Host owns sampler
  configuration; federated modules inherit host-configured sampling without
  re-configuring. Sampler state (rate-limit token buckets) is per-transport,
  not per-`Logger`. Duplicate-package-copy behavior: isolated (each copy's
  samplers operate independently, which is correct for independent configured
  runtimes).
- **Security & Privacy Considerations**: Drop notifications include event level,
  message, timestamp, sampler name, and drop reason only — NOT attribute values,
  context, error objects, or any data that might contain secrets, tokens, or PII.
  The sampler's decision function (FR-007a) does not inspect event attributes —
  it only uses its own internal state (random seed, token bucket) to make the
  pass/drop decision, so no new sensitive-data path exists within sampling logic.
  Sampler configuration (rate, type) is not sensitive.
- **Log Integrity Considerations**: The sampler INTENTIONALLY drops events —
  this is the first feature that introduces event loss as designed behavior.
  Per Principle VII, every drop is documented and observable. The `onDrop`
  callback is **required** when sampling is configured (no silent drops).
  Attempting to configure sampling without `onDrop` is rejected at
  configuration time. The sampler does NOT reorder, batch, or transform events
  that pass through. Drop rate is observable through the `onDrop` callback and
  downstream monitoring can alert on sampling behavior. The transport
  abstraction's integrity boundary is preserved — drops happen before the
  transport sees the event, which is preferable to the transport silently
  dropping them.
- **Runtime Scale & Federated Deployment Impact**: Sampler instances are
  created once at transport configuration time (not per-`Logger`). Per-event
  overhead is a single random number generation (head sampler) or token bucket
  check (rate-limit sampler) — both O(1) operations. No timers, no global
  listeners, no ambient reads at `Logger` creation time. Sampler state lives at
  the transport level in the shared runtime.
- **Supply-Chain / Distribution Impact**: No change to release pipeline,
  publish path, dependency set, or distributed surface beyond the new exports
  listed above. Attested publishing, signed tags, DCO attribution, and
  pinned/screened dependencies remain intact.
- **Verification & Enforcement**: Every quality requirement is verified through
  the existing `npm test` entrypoint. New enforcement mechanisms:
  - `tests/contract/sampler-contract.test.ts` — verifies Transport interface
    compliance (name, send, optional flush/shutdown)
  - `tests/unit/sampler/head-sampler.test.ts` — distribution accuracy,
    fail-open behavior
  - `tests/unit/sampler/rate-limit-sampler.test.ts` — token bucket accuracy,
    clock behavior
  - `tests/unit/sampler/drop-callback.test.ts` — callback fires per drop,
    callback failure doesn't propagate
  - `tests/security/sampler-no-leak.security.test.ts` — drop callbacks never
    receive attribute values, context, or error objects
  - Bundle-size increase is tracked against the existing bundle-size budget
    check in CI.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a head-based sampler that drops events with
  a configurable probability (0.0–1.0), where each event is independently
  sampled.
- **FR-002**: System MUST provide a rate-limit sampler that drops events when
  the event rate exceeds a configurable threshold (events per second), using a
  token bucket or equivalent algorithm with bounded state.
- **FR-003**: System MUST implement the sampler as a `Transport` wrapper so it
  can wrap any existing or future transport without the transport knowing about
  sampling.
- **FR-004**: System MUST provide a declarative `sampling` configuration
  section in `LoggerConfig` that automatically wraps all configured transports.
- **FR-005**: System MUST default to sampling OFF — no events are dropped
  unless the consumer explicitly configures a sampler.
- **FR-006**: System MUST fire a documented `onDrop` callback for every dropped
  event. The callback is **required** when sampling is configured (no silent
  drops — Principle VII). The callback receives a `DropNotification` with: the
  event's `level`, `message`, `timestamp` (milliseconds since epoch, matching
  `LogEvent.timestamp` format), `samplerName`, and the drop `reason`
  (`head_sample` or `rate_limited`). The callback MUST NOT receive attribute
  values, context, error objects, or any other potentially sensitive event data.
- **FR-007**: System MUST fail open on sampler decision errors — if the
  sampler's own logic throws or produces an unexpected result, the event passes
  through to the inner transport rather than being dropped.
- **FR-007a**: The sampler's decision function MUST NOT inspect event attribute
  values, context, or error objects. It receives only the subset of the event
  needed for its sampling strategy (level, timestamp, and its own internal
  state). This prevents any new path for sensitive data exposure through
  sampling logic.
- **FR-008**: System MUST preserve the never-throw boundary (Principle III):
  sampler failures, including `onDrop` callback failures, MUST NOT propagate
  throws or rejected Promises into the caller's logging call site. Drop
  callback failures are reported through the existing `onInternalError`
  mechanism exactly once per session.
- **FR-009**: System MUST preserve browser runtime safety and failure
  resilience for all new behavior, including fail-closed handling when
  redaction, serialization, or transport delivery fails (FR-006 in the
  template).
- **FR-010**: System MUST keep consumer-visible behavior framework-neutral and
  implementation details hidden behind the package interface (FR-007 in the
  template).
- **FR-011**: System MUST be secure by default — no new path exposes secrets,
  credentials, tokens, or PII (FR-009 in the template). Drop callbacks
  receive only metadata (level, message, timestamp, reason).
- **FR-012**: System MUST document every drop behavior, making it observable
  for downstream monitoring and forensic use (Principle VII). Drop rate is
  surfaced through the `onDrop` callback.
- **FR-013**: System MUST keep `Logger` instance creation lightweight and
  side-effect-free — sampler state is transport-level, not per-`Logger`
  (FR-011 in the template).
- **FR-014**: System MUST pair every quality gate with a machine-executable
  enforcement mechanism (FR-012 in the template).

### Key Entities *(include if feature involves data)*

- **Sampler**: A `Transport` wrapper that decides whether each `LogEvent`
  reaches the inner transport. Has a `name`, a decision function, and an
  optional `onDrop` callback. Two concrete types: `HeadSampler` and
  `RateLimitSampler`.
- **SamplerConfig**: Declarative configuration shape — `{ type: 'head' | 'rateLimit', rate: number, onDrop: (drop: DropNotification) => void }`.
  `onDrop` is **required** — if you opt into sampling, you MUST supply a drop
  handler (no silent drops, per Principle VII).
- **DropNotification**: Structured metadata for a dropped event — `{ level: LogLevel, message: string, timestamp: number, reason: 'head_sample' | 'rate_limited', samplerName: string }`.
  `timestamp` is milliseconds since epoch, matching the `LogEvent.timestamp`
  format for consistency with downstream monitoring systems.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Head sampler with rate 0.5 drops approximately 50% of events
  across 10,000 trials (within 5% at 99% confidence).
- **SC-002**: Rate-limit sampler configured at 10 events/second allows at most
  1 event per 100ms window on average, with bounded burst behavior documented.
- **SC-003**: When sampler decision logic throws, 100% of events pass through
  to the inner transport (fail-open validated by contract test).
- **SC-004**: Drop callback fires exactly once per dropped event with the
  correct metadata fields (contract test with a counting callback).
- **SC-005**: Setting `sampling` to off (default) adds zero additional
  allocation and zero per-event state mutation beyond a single branch to check
  whether sampling is configured.
- **SC-006**: Sampler wrapper conforms to the `Transport` interface
  (contract test using `assertTransportContract`).
- **SC-007**: Bundle size increase for the sampling feature is ≤ 2 KB gzipped
  over baseline (measured in CI).

## Assumptions

- Head-based sampling uses `Math.random()` or `crypto.getRandomValues()` as the
  randomness source — `crypto` preferred for uniformity, `Math` as fallback
  with documented tradeoff.
- Rate-limiting uses a token bucket algorithm with a configurable bucket size
  (default: equal to the rate, allowing one burst of the full rate per second).
- The `sampling` config section wraps transports at `configureLogging()` time,
  before the dispatcher sees them — same lifecycle as `SafeTransport` wrapping.
- The `onDrop` callback is called synchronously during `send()` for both
  sampler types. It is the consumer's responsibility to avoid heavy work in
  the callback.
- Browser tab throttling (background timer clamping) may cause rate-limit
  burst on tab refocus — this is a documented known limitation of
  browser-based rate limiting, not a defect.
- Sampling is per-transport, not global. Two transports with the same sampler
  config operate independently.
