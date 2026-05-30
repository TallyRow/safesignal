# Feature Specification: OTLP Log Transport

**Feature Branch**: `007-transport-otlp`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Add a ./transport-otlp subpath to @tallyrow/safesignal (Feature 007): a vendor-neutral transport that delivers the SDK's already-OTel-formatted events to any OTLP-compatible backend (Datadog, Honeycomb, Grafana Tempo/Loki, self-hosted ClickHouse, and the planned safesignal-server)."

## Overview

SafeSignal already produces fully-processed, OTel-shaped log events internally
(the dormant "vendor-neutral core" seam at `src/internal/telemetry/otel/`). It
ships one delivery transport today — `./transport-beacon` — which posts raw
`LogEvent` JSON to a generic HTTPS endpoint. It does **not** yet speak a
standard observability wire protocol, so adopting SafeSignal means either
running a custom ingestion endpoint or writing a bespoke translator.

This feature adds a second, additive delivery transport on a new
`./transport-otlp` subpath that emits the SDK's events as **OpenTelemetry Logs
(OTLP) LogRecords** to any OTLP-compatible backend. This makes SafeSignal a
drop-in source for the entire OTLP ecosystem (Datadog, Honeycomb, Grafana,
ClickHouse, OpenTelemetry Collector, and the planned `safesignal-server`)
without a backend-specific code path.

**This feature is strictly vendor-neutral.** It ships standard OTLP that any
conformant backend consumes; it MUST NOT contain any `safesignal-server`-
preferential path.

## Deferred Decisions (resolve in `/speckit-clarify`)

The following three decisions are intentionally **not** pinned in this spec.
Each has a documented working assumption (see Assumptions) so the spec is
testable, but the final choice is a `/speckit-clarify` decision and may change
the relevant requirements before `/speckit-plan`:

1. **OTLP encoding** — OTLP/HTTP+JSON vs OTLP/HTTP+protobuf. JSON is
   browser-native and dependency-free; protobuf is the more universally
   accepted OTLP encoding but adds an encoder dependency and bundle weight.
   (OTLP/gRPC is out of scope: no native browser gRPC.)
2. **Batching & retry policy** — flush triggers (size / age), bounded
   retry/backoff behaviour for retryable responses, and whether to reuse the
   `./transport-beacon` batching/delivery machinery or implement a dedicated
   one.
3. **Delivery mechanism** — `fetch(keepalive)` vs `navigator.sendBeacon`.
   `sendBeacon` cannot set the custom request headers most OTLP backends
   require for authentication, which strongly implies `fetch`, but this is to
   be confirmed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export logs to any OTLP backend (Priority: P1)

A host application configures SafeSignal with the OTLP transport, pointing it at
an OTLP logs endpoint URL. From then on, every event the application logs is
delivered to that backend as a valid OTLP `LogRecord`, batched for efficiency,
with the application's SafeSignal identity (application name/version, module
name/version, environment) carried as the OTLP `Resource` so the backend can
attribute and filter the telemetry correctly.

**Why this priority**: This is the feature's reason to exist — it is the bridge
from SafeSignal to the standard observability ecosystem. Without it there is no
feature. It is independently valuable on its own: a team can adopt SafeSignal
and see their logs in their existing OTLP backend with no other story shipped.

**Independent Test**: Configure the OTLP transport against a captured/mock OTLP
logs endpoint, emit a representative set of events at each level, and assert the
captured request body is a well-formed OTLP logs payload whose LogRecords carry
the correct severity, body, timestamp, attributes, and a Resource derived from
SafeSignal context.

**Acceptance Scenarios**:

1. **Given** the OTLP transport configured with a valid HTTPS OTLP logs
   endpoint, **When** the application logs an `info` event with attributes,
   **Then** the backend receives an OTLP logs request whose LogRecord has the
   correct severity, body (message), observed timestamp, and the event
   attributes preserved.
2. **Given** several events are logged in quick succession, **When** the batch
   flush condition is met, **Then** they are delivered together in a single
   OTLP request rather than one request per event.
3. **Given** the SafeSignal context carries application name/version, module
   name/version, and environment, **When** any event is delivered, **Then**
   those identity fields appear on the OTLP `Resource` (not duplicated onto
   every LogRecord) using standard resource attribute names.
4. **Given** a `debug`, `info`, `warn`, and `error` event, **When** each is
   delivered, **Then** each maps to the corresponding OTLP severity number and
   text.

---

### User Story 2 - Failures never break the page (Priority: P1)

When the OTLP backend is unreachable, slow, returns an error, or the browser is
mid-unload, the transport degrades silently: it drops or retries within bounded
limits, never throws or rejects into the calling code, and never blocks or
breaks the host page. A misconfigured or down telemetry backend can never take
down the application that depends on SafeSignal.

**Why this priority**: Fail-safe browser behaviour is a non-negotiable
constitutional invariant (Principle II). A telemetry transport that can surface
errors into application code, or stall a page on a hanging endpoint, is not
shippable — so this is co-equal P1 with the happy path.

**Independent Test**: Drive the transport against endpoints that reject, return
5xx, time out, and are entirely absent (no `fetch`/network), and assert that no
call into the transport ever throws or rejects to the caller, that retries are
bounded, and that events are dropped (not infinitely buffered) once limits are
reached. Run `assertTransportContract` against the transport and confirm it
passes.

**Acceptance Scenarios**:

1. **Given** the OTLP endpoint returns a non-retryable error, **When** an event
   is delivered, **Then** the event is dropped, the caller's `send()` does not
   throw or reject, and at most one diagnostic notice per failure class is
   surfaced via the configured internal-error channel.
2. **Given** the OTLP endpoint returns a retryable response, **When** delivery
   is attempted, **Then** the transport retries within a bounded limit and
   stops (dropping the batch) rather than retrying unboundedly.
3. **Given** the delivery transport (network primitive) is unavailable, **When**
   an event is logged, **Then** the event is dropped safely with a single
   diagnostic notice and no throw.
4. **Given** the page is unloading, **When** buffered events remain, **Then** a
   best-effort flush is attempted without blocking unload, and no error reaches
   the page.
5. **Given** the transport is shut down, **When** `flush()` or `shutdown()` is
   called more than once, **Then** each call resolves safely (idempotent).

---

### User Story 3 - Authenticated backends without leaking secrets (Priority: P2)

Most hosted OTLP backends require an API key or token, sent as a request header.
The host can supply static request headers (e.g. an API key) at configuration
time. Those headers are sent only on the delivery request to the configured
endpoint — they are never copied into events, never serialized into any
LogRecord or payload, never written to diagnostics or error output, and never
embedded in the published bundle.

**Why this priority**: Required to use any commercial OTLP backend, but the
core export (US1) and fail-safety (US2) must exist first. It is a
security-critical surface (Principle IV): the whole point of SafeSignal is not
leaking secrets, so the transport that newly accepts credentials must hold that
line.

**Independent Test**: Configure the transport with auth headers containing a
known secret fixture value, emit events, and assert (a) the secret appears in
the outbound request headers to the configured endpoint and (b) the secret
appears nowhere in any captured request body, LogRecord, diagnostic message, or
error output. Scan the built bundle to confirm no secret/default token is
embedded.

**Acceptance Scenarios**:

1. **Given** auth headers configured with a secret value, **When** an event is
   delivered, **Then** the secret appears in the outbound request headers but
   in no request body, no LogRecord field, and no diagnostic/error output.
2. **Given** an internal error is surfaced during delivery, **When** the
   diagnostic notice is produced, **Then** it contains no configured header
   value.
3. **Given** the default (no headers configured), **When** the bundle is built
   and published, **Then** it contains no hard-coded credential, token, or
   backend-specific default endpoint.

---

### User Story 4 - Federated/host runtime composition (Priority: P3)

The OTLP transport is configured once at the SafeSignal runtime/package level,
not per `Logger`. Creating a `Logger` (or deriving one via `child()` /
`withContext()`) opens no socket, starts no timer, and does no network or
ambient browser work. Host applications and independently-deployed federated
modules have a clear, documented ownership story for who configures the
transport, and duplicate-copy behaviour is documented.

**Why this priority**: SafeSignal targets federated/micro-frontend deployments
where many modules derive loggers cheaply (Principle VII). It matters, but the
transport is usable in a single-app deployment without resolving every
federation nuance, so it is P3.

**Independent Test**: Create and derive many `Logger` instances and assert no
per-instance timers, listeners, sockets, or network calls are created; confirm
batching/timers/connection state live at the configured-runtime level and are
shared, and that the documented host/module ownership and duplicate-copy
behaviour match observed behaviour.

**Acceptance Scenarios**:

1. **Given** the OTLP transport is configured at the runtime level, **When**
   many `Logger` instances are created and derived, **Then** no per-`Logger`
   timer, listener, socket, or network call is created.
2. **Given** a host and a federated module both load SafeSignal, **When** the
   documented ownership rule is followed, **Then** a module does not silently
   replace the host's configured transport, per the documented behaviour.

---

### Edge Cases

- What happens when the configured endpoint URL is missing, malformed, or not
  HTTPS? (Construction-time rejection at the consumer's call site — never a
  throw from the emit hot path; loopback/insecure allowance, if any, is opt-in.)
- What happens when a single event or a batch exceeds a reasonable payload size
  limit? (Bounded; oversized payloads are dropped with a single diagnostic
  notice rather than sent or retried forever.)
- How does the transport handle a backend that returns 2xx but a partial-success
  OTLP response indicating some rejected records?
- What happens when many events arrive while a delivery is already in flight or
  while offline? (Bounded buffering; drop-oldest or drop-on-limit rather than
  unbounded memory growth.)
- How does the transport behave when the OTel/event-bridge mapping cannot
  represent a particular event field? (Fail-closed for that field; never throw
  into the caller.)
- How does the transport preserve safe behaviour when event attributes contain
  values that were already sanitized/redacted upstream? (The transport MUST NOT
  undo or bypass upstream redaction; it serializes events as received.)

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: Adds one new subpath export `./transport-otlp`
  exposing exactly a factory (working name `createOtlpTransport`) plus its
  type-only options shape (working name `OtlpTransportOptions`) — mirroring the
  `./transport-beacon` two-name surface. Adds a corresponding `exports` map
  entry and build target. **No change** to `.`, `./testing`, or
  `./transport-beacon` exports.
- **Compatibility Impact**: Additive and backward compatible. No existing
  export, type, default, or behaviour changes. Consumers not importing
  `./transport-otlp` are unaffected.
- **Migration Notes**: None required. Opt-in: consumers add the new transport to
  their `configureLogging` transports list.
- **Host/Module Usage Impact**: The transport is supplied to the runtime
  configuration (a `TransportFactory`), invoked once at configuration time, the
  same way `./transport-beacon` is. Host owns runtime configuration; federated
  modules follow the documented ownership rule and do not replace host config.
- **Security & Privacy Considerations**: The transport receives only
  fully-processed `LogEvent`s (already sanitized, URL-scrubbed, redacted
  fail-closed, control-char-escaped) and MUST NOT undo that processing. It
  newly accepts optional auth headers: these are sent only on the delivery
  request, never serialized into events/LogRecords/payloads, never written to
  diagnostics/errors, and never embedded in the bundle. No event data ever
  travels in a URL (T-S1); cross-origin delivery is body-only (T-S2) over HTTPS
  (T-S3); events are treated as immutable (T-S4). No new default captures or
  transmits any additional data.
- **Log Integrity Considerations**: Events are translated to OTLP LogRecords
  losslessly with respect to severity, message/body, timestamp, attributes, and
  SafeSignal identity (mapped to the OTLP Resource). Batching groups records but
  does not reorder within a backend-visible guarantee beyond what OTLP defines;
  any drop (oversized, over-limit, retry-exhausted, partial-success rejection)
  is documented and surfaced via a rate-limited diagnostic notice. Records
  remain machine-parseable and origin-attributable.
- **Runtime Scale & Federated Deployment Impact**: `Logger` creation/derivation
  stays lightweight and side-effect-free — no per-`Logger` socket, timer,
  listener, global patch, network work, or ambient read. Batching state,
  timers, and any connection/keepalive state are owned at the configured
  runtime/package level and shared, not per `Logger`. Host vs. module
  configuration ownership is explicit and documented. Duplicate-package-copy
  behaviour MUST be documented as one of: isolated, shared, or explicitly
  unsupported (expected: each configured transport instance is isolated, like
  `./transport-beacon`).
- **Verification & Enforcement**: Every gate this feature adds is verified
  identically in CI and locally via the existing documented `npm` scripts (no
  environment-dependent outcomes), reusing the established quality-gate jobs
  (build → typecheck ×2 → test ×2 on Node 20+22, lint, format-check, coverage,
  secret-scan, bundle-invariance, dependency-pins, DCO). New enforcement:
  (a) the OTLP transport passes `assertTransportContract` via a contract test;
  (b) OTLP payload-shape correctness is verified by a contract test asserting a
  conformant OTLP logs structure; (c) a security/privacy test asserts auth
  headers never appear in body/records/diagnostics and no event data appears in
  URLs; (d) a new bundle-size baseline for `dist/transport-otlp.mjs` is recorded
  and gated by the ±1 KiB bundle-invariance check; (e) the existing
  `@opentelemetry/*` source-boundary test continues to gate which files may
  import OTel APIs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The package MUST expose a new `./transport-otlp` subpath that
  provides a factory producing a `Transport`-shaped object (with `name`,
  `send`, and optional idempotent `flush`/`shutdown`) and a type-only options
  shape, and nothing else, mirroring the `./transport-beacon` surface.
- **FR-002**: The transport MUST translate each fully-processed `LogEvent` into
  a valid OpenTelemetry Logs `LogRecord`, populating at minimum severity
  number/text, body (message), observed timestamp, and event attributes, by
  building on the existing internal OTel event seam rather than inventing a new
  event model.
- **FR-003**: The transport MUST carry SafeSignal identity context (application
  name/version, module name/version, environment) on the OTLP `Resource` of the
  emitted payload using standard resource attribute naming, rather than
  duplicating it onto every LogRecord.
- **FR-004**: The transport MUST batch multiple events into a single OTLP logs
  request under a documented flush policy, and MUST deliver to a
  consumer-configured OTLP logs endpoint URL.
- **FR-005**: The transport MUST accept the endpoint as required configuration
  and reject a missing/malformed/non-HTTPS endpoint at construction time (at the
  consumer's call site), never from the emit hot path; any insecure-loopback
  allowance MUST be explicit opt-in.
- **FR-006**: The package MUST preserve browser runtime safety and failure
  resilience for all new behaviour, including fail-closed handling when
  redaction, serialization, or transport delivery fails — `send()`, `flush()`,
  and `shutdown()` MUST never throw or reject to the caller.
- **FR-007**: The package MUST keep consumer-visible behaviour framework-neutral
  and vendor-neutral: the transport works with any conformant OTLP backend and
  contains no backend-specific or `safesignal-server`-preferential code path,
  and implementation details stay hidden behind the subpath interface.
- **FR-008**: The transport MUST define structured logging metadata, level/
  severity mapping, and privacy-safe handling for the OTLP output: events remain
  structured and machine-parseable, and the level→OTLP-severity mapping is
  documented and total over the SDK's levels.
- **FR-009**: The transport MUST be secure by default: it MUST NOT expose
  secrets, credentials, tokens, session identifiers, authorization headers,
  cookies, or unnecessary personal data; configured auth headers MUST be sent
  only on the delivery request and MUST NOT appear in events, LogRecords,
  payload bodies, diagnostics, errors, or the published bundle; no event data
  MUST appear in any request URL; cross-origin delivery MUST be body-only over
  HTTPS; events MUST be treated as immutable. Defaults and examples MUST NOT
  encourage unsafe patterns (raw object dumping, disabling redaction, embedding
  tokens).
- **FR-010**: The transport MUST preserve log integrity and monitoring
  suitability: emitted records remain structured, machine-parseable, and
  origin-attributable, and any drop/sample/batch/retry-exhaustion/partial-
  rejection behaviour is documented and surfaced via a rate-limited diagnostic
  notice (one per failure class per instance per session).
- **FR-011**: The package MUST keep `Logger` instance creation lightweight and
  side-effect-free (no per-instance backend init, socket/transport open, timer,
  global listener, console patch, network work, or ambient browser read), MUST
  share expensive runtime resources (batching, timers, connection/keepalive
  state) at the configured runtime/package level rather than per `Logger`, MUST
  keep host/module ownership of the configured runtime explicit so federated
  modules do not accidentally replace host configuration, and MUST document
  duplicate-package-copy behaviour as isolated, shared, or explicitly
  unsupported.
- **FR-012**: The package MUST pair every quality gate this feature documents
  (the OTLP transport contract conformance, OTLP payload-shape correctness, the
  auth-header non-leak/security clauses, the new `dist/transport-otlp.mjs`
  bundle baseline within the ±1 KiB invariance gate, the `@opentelemetry/*`
  source-boundary rule, and the unchanged existing bundle baselines) with a
  machine-executable enforcement mechanism — test, CI job, lint rule, or
  publish-time hook — that fails closed when violated, AND MUST keep
  verification outcomes identical between CI and local invocations for the same
  source state. Test code under `tests/` MUST be held to the same typing, lint,
  build, and import-resolution standards as `src/`; any tolerated relaxation
  MUST carry a written, named, time-bound removal condition in this feature's
  task list.
- **FR-013**: The transport MUST bound its memory and retry behaviour: events/
  batches MUST be dropped (not buffered or retried unboundedly) once documented
  size, buffer, or retry limits are reached.
- **FR-014**: The feature MUST NOT change the runtime behaviour of the default
  entry, `./testing`, or `./transport-beacon`, and MUST keep their published
  bundles within the ±1 KiB bundle-invariance gate (current baselines:
  `dist/index.mjs` ≈ 8,166 B gz, `dist/transport-beacon.mjs` ≈ 3,106 B gz,
  `dist/testing.mjs` ≈ 2,724 B gz).

### Key Entities *(include if feature involves data)*

- **OtlpTransportOptions**: The consumer-facing configuration — required OTLP
  logs endpoint URL; optional static request headers (e.g. auth); optional
  batching policy; optional transport name; optional internal-error callback;
  optional insecure-loopback allowance. (Exact field shape finalized in
  `/speckit-clarify` + `/speckit-plan`.)
- **OTLP Logs Payload**: The outbound request body — an OTLP logs structure
  (`ResourceLogs` → `ScopeLogs` → `LogRecord[]`) carrying a `Resource` derived
  from SafeSignal identity context and one `LogRecord` per processed event.
- **LogRecord (OTLP)**: Per-event OTLP record with severity number/text, body,
  observed/emitted timestamp, and attributes derived from the SafeSignal
  `LogEvent`.
- **Resource (OTLP)**: Identity attributes (application/module/environment)
  shared across the batch's records.
- **Diagnostic Notice**: A rate-limited internal-error signal for each failure
  class (oversized, delivery-unavailable, send-failed, retry-exhausted,
  partial-rejection, shutdown-failed), surfaced via the configured callback and
  containing no secret/header values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A host can configure the OTLP transport with only an endpoint URL
  (plus optional auth headers) and see SafeSignal logs arrive in any conformant
  OTLP logs backend with correct severity, message, timestamp, attributes, and
  identity — no bespoke ingestion endpoint or translator required.
- **SC-002**: 100% of delivery failure modes (non-retryable error, retryable
  error, timeout, transport unavailable, page-unload, oversized payload) result
  in zero throws/rejections to the caller and zero unbounded memory or retry
  growth, verified by automated tests.
- **SC-003**: A configured auth-header secret appears in 0 captured request
  bodies, 0 LogRecord fields, 0 diagnostic/error messages, and 0 bytes of the
  published bundle, verified by automated security tests and a bundle scan.
- **SC-004**: The OTLP transport passes the existing `assertTransportContract`
  battery (T-S1..T-S5) with no contract relaxations.
- **SC-005**: Consumer-facing OTLP output shape is verified by automated
  contract tests asserting a conformant OTLP logs payload.
- **SC-006**: Runtime delivery failures degrade safely without breaking normal
  browser interactions, verified by failure-injection tests.
- **SC-007**: Documentation/examples remain accurate for host-app and
  module-based integration paths, and the existing default / `./testing` /
  `./transport-beacon` bundles stay within the ±1 KiB invariance gate (test
  suite remains 48 files / 1,088 passing / 10 todo / 0 failing, plus the new
  transport's tests).
- **SC-008**: A new `dist/transport-otlp.mjs` gzipped bundle baseline is
  recorded and gated; subsequent changes to it are caught by the
  bundle-invariance check.

## Assumptions

- **Encoding (deferred to `/speckit-clarify`)**: Working assumption is
  OTLP/HTTP with **JSON** encoding (browser-native, dependency-light, leaner
  bundle). Protobuf remains an option if broader backend acceptance outweighs
  the added encoder dependency and bundle cost. OTLP/gRPC is excluded (no native
  browser gRPC).
- **Delivery mechanism (deferred to `/speckit-clarify`)**: Working assumption is
  `fetch` (with `keepalive` for unload resilience), because OTLP backends
  require custom auth headers that `navigator.sendBeacon` cannot set. The
  beacon transport's `fetch`-keepalive path is the reference.
- **Batching & retry (deferred to `/speckit-clarify`)**: Working assumption is
  to reuse the `./transport-beacon` batching shape (max batch size / max batch
  age) plus a small bounded retry with backoff for retryable status codes
  (e.g. 429/5xx), dropping after a fixed retry ceiling. Exact triggers and
  bounds are a clarify/plan decision.
- **Signal scope**: OTLP **Logs** only (`/v1/logs` semantics). Traces, metrics,
  and W3C trace-context propagation are separate future features and are out of
  scope here.
- **OTel seam reuse**: The transport builds on the existing internal OTel event
  seam (`src/internal/telemetry/otel/`, e.g. the `LogEvent`→`LogRecord`
  mapping) and respects the existing `@opentelemetry/*` source-boundary rule
  that restricts which files may import OTel APIs.
- **Transport contract reuse**: The Feature 002 `Transport` contract
  (T-S1..T-S5) and `assertTransportContract` testing helper apply unchanged; the
  internal `SafeTransport` wrapper continues to provide failure isolation.
- **Events are pre-secured**: By the time the transport receives a `LogEvent`,
  it has already been sanitized, URL-scrubbed, redacted (fail-closed),
  control-char-escaped, and (in dev) frozen. The transport serializes events as
  received and never re-opens or bypasses that processing.
- **No long-lived CI secrets**: The OIDC-only publish posture and committed-
  secret-free CI from Features 005/006 are preserved; no backend token is
  committed or required to build, test, or publish.
- **CI conventions**: New CI work reuses the existing `.gitlab-ci.yml`
  quality-gate jobs and conventions (Node 20+22 matrix where it matters,
  `needs: build` for anything consuming `dist/`); no new long-lived secrets.
- **Constitution**: Governed by Constitution v1.3.0 (Principles I–IX),
  particularly II (fail-safe browser behaviour), III (framework/vendor
  neutrality), IV (secure by default), VI (log integrity), VII (lightweight
  federated runtime), VIII (reproducible verification), IX (mechanical
  enforcement).

## Out of Scope

- Traces and metrics signals; OTLP trace/metric export.
- W3C trace-context propagation (candidate Feature 008).
- RUM / Web-Vitals capture.
- The `safesignal-server` backend itself (separate repository).
- OTLP/gRPC transport.
- Any change to the runtime behaviour or public API of the default entry,
  `./testing`, or `./transport-beacon`.
