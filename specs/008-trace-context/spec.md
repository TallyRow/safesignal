# Feature Specification: W3C Trace-Context Propagation

**Feature Branch**: `008-trace-context`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Add W3C Trace-Context propagation to @tallyrow/safesignal (Feature 008): carry structured trace context (trace_id / span_id) on emitted events so frontend logs correlate with backend traces, and surface it on OTLP LogRecords."

## Overview

SafeSignal emits structured `LogEvent`s carrying `application`, `module`,
`environment`, and `attributes` context — but no **trace context**. Teams that
run distributed tracing cannot currently link a frontend log line to the trace
it belongs to, which is the single most-requested correlation in observability.

This feature lets a host application supply a **W3C Trace Context** (a
`trace_id` / `span_id`, optional flags + `tracestate`) that SafeSignal carries,
in structured form, on every emitted event. When those events are shipped via
the `./transport-otlp` subpath (Feature 007), the trace context populates the
OTLP `LogRecord`'s **standard** `traceId` / `spanId` / `traceFlags` fields, so
any OTLP backend can join the log to its trace with no custom mapping.

**Settled framing**: SafeSignal **consumes and propagates** trace context that
the app provides — it is **not** a tracer (no span creation, timing, or
sampling). The format is vendor-neutral **W3C Trace Context**, working with any
tracer that emits it. There is no `safesignal-server`-preferential path.

> **Dependency**: this feature extends the `./transport-otlp` serializer
> delivered by **Feature 007** (currently in review, MR !23). It is sequenced
> after 007 and assumes 007's vendor-neutral bundle gate (no `@opentelemetry/*`
> in the subpath) continues to hold.

## Deferred Decisions (resolve in `/speckit-clarify`)

These are intentionally **not** pinned here. Each has a documented working
assumption (see Assumptions) so the spec is testable, but the final choice is a
`/speckit-clarify` decision that may change the relevant requirements before
`/speckit-plan`:

1. **Ingestion API shape** — how the app supplies trace context: via the
   existing `correlation()` hook return value, a dedicated per-logger option /
   `withTraceContext()`-style API, and/or a `parseTraceparent(string)` helper.
   Also: is any ambient source ever read (default expectation: **no**, per
   Principle VII)?
2. **Generation vs. carry-only** — does SafeSignal ever generate an id (e.g. a
   page-session/root id when none is supplied), or strictly carry what it is
   given?
3. **Field model + OTLP mapping detail** — the structured shape (likely
   `context.trace = { traceId, spanId, traceFlags?, traceState? }`, hex
   strings) and how it maps onto the OTLP `LogRecord` (hex-string vs. bytes on
   the wire; where/whether `tracestate` lands).
4. **Outbound `traceparent` header injection** — whether the transports inject a
   `traceparent` request header on delivery is in scope here or a follow-up
   (working assumption: **deferred / out of scope** for this feature).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Logs carry trace context to the backend (Priority: P1)

A host application that already has a trace context — from its tracing library,
or a `traceparent` injected by its server-rendered HTML — supplies that context
to SafeSignal. From then on, every event the app logs carries the structured
`trace_id` / `span_id`; when shipped via `./transport-otlp`, those populate the
OTLP `LogRecord`'s standard trace fields, so the backend joins each log to its
trace automatically.

**Why this priority**: This is the feature's reason to exist — logs-to-traces
correlation is the whole point and the natural completion of the OTLP export.
It is independently valuable: a team supplies trace context and immediately sees
linked logs in their tracing backend, with no other story shipped.

**Independent Test**: Supply a valid trace context, emit events, and assert each
event's context carries the structured trace fields and (when serialized for
OTLP) the OTLP `LogRecord` carries the matching `traceId` / `spanId` /
`traceFlags`.

**Acceptance Scenarios**:

1. **Given** a valid trace context is supplied to the runtime, **When** the app
   logs an event, **Then** the emitted event's context carries the structured
   `trace_id` and `span_id`.
2. **Given** an event with trace context is delivered via `./transport-otlp`,
   **When** the OTLP payload is produced, **Then** the `LogRecord` carries the
   correct `traceId` / `spanId` / `traceFlags` in OTLP's standard fields.
3. **Given** no trace context is supplied, **When** the app logs an event,
   **Then** the event and its OTLP `LogRecord` omit trace fields entirely (no
   empty/zero ids).
4. **Given** trace context is supplied, **When** events are delivered via a
   transport that does not understand trace fields (e.g. `./transport-beacon`),
   **Then** the structured trace context still appears in the event payload and
   nothing breaks.

---

### User Story 2 - Bad trace input never breaks logging (Priority: P1)

When the supplied trace context is malformed, partial, or invalid (a bad
`traceparent` string, wrong-length or all-zero ids, an oversized `tracestate`),
SafeSignal drops the invalid trace data fail-closed and logs the event normally.
Trace correlation is a best-effort enrichment; it can never throw into the emit
path or block a log line.

**Why this priority**: Fail-safe browser behaviour is a non-negotiable
constitutional invariant (Principle II). A correlation feature that could throw
from a logging call, or suppress a log because the trace id was malformed, is
not shippable — co-equal P1 with the happy path.

**Independent Test**: Feed malformed/invalid trace inputs (bad hex, wrong
lengths, all-zero ids, oversized `tracestate`) and assert the event is still
emitted, the invalid trace field is omitted, and no call throws or rejects.

**Acceptance Scenarios**:

1. **Given** a malformed `traceparent` is supplied, **When** the app logs,
   **Then** the event is emitted without trace fields and no error reaches the
   caller.
2. **Given** an all-zero or wrong-length `trace_id`/`span_id`, **When** the app
   logs, **Then** the invalid id is omitted (fail-closed) and the event still
   ships.
3. **Given** an oversized `tracestate`, **When** the app logs, **Then** the
   `tracestate` is bounded or omitted per documented limits, with no throw.
4. **Given** trace context that is valid only in part (e.g. valid `trace_id`,
   invalid `span_id`), **When** the app logs, **Then** the valid portion is
   kept and the invalid portion is omitted, documented deterministically.

---

### User Story 3 - Ergonomic ingestion + dynamic correlation (Priority: P2)

A developer can turn the `traceparent` (and optional `tracestate`) string their
framework already has into SafeSignal's structured trace context with a small
helper, and can feed a *changing* trace context (e.g. the currently-active span)
through the existing per-emit `correlation()` hook so each event gets the right
trace context cheaply, without re-configuring the runtime.

**Why this priority**: Required for real adoption (most apps hold a
`traceparent` string, not a pre-parsed object), but the core carry + fail-safe
behaviour (US1/US2) must exist first.

**Independent Test**: Parse a representative `traceparent` (+`tracestate`)
string into the structured shape and assert correctness; supply a dynamic trace
context via the `correlation()` hook and assert successive events pick up the
current value.

**Acceptance Scenarios**:

1. **Given** a valid `traceparent` string, **When** it is parsed via the helper,
   **Then** it yields the correct structured `trace_id` / `span_id` / flags.
2. **Given** the `correlation()` hook returns a trace context, **When** two
   events are emitted at different times with different active traces, **Then**
   each event carries the trace context current at its emit time.
3. **Given** an invalid `traceparent` string, **When** it is parsed, **Then**
   the helper reports invalidity in a documented, non-throwing way.

---

### User Story 4 - Federated correlation without per-Logger cost (Priority: P3)

In a federated/micro-frontend page, the host and independently-deployed modules
can each contribute or override trace context through SafeSignal's documented
context-merge precedence (root config → logger chain → `correlation()`), and
deriving loggers stays constant-cost — no per-`Logger` trace state, timers, or
ambient reads.

**Why this priority**: SafeSignal targets federated deployments (Principle VII),
but trace context is usable in a single-app deployment without resolving every
federation nuance, so it is P3.

**Independent Test**: Create/derive many loggers across simulated host + module
boundaries, supply trace context at different layers, and assert merge
precedence is honored and no per-`Logger` trace work occurs.

**Acceptance Scenarios**:

1. **Given** trace context set at the runtime root and overridden via
   `withContext()` / `correlation()`, **When** an event is emitted, **Then** the
   highest-precedence trace context wins per the documented order.
2. **Given** many derived loggers, **When** they are created, **Then** no
   per-`Logger` trace state, timer, listener, or ambient read is incurred.

---

### Edge Cases

- What happens when the supplied `trace_id` is the all-zero invalid value, or
  not 32 hex chars? (Omit fail-closed; event still ships.)
- What happens when `span_id` is missing but `trace_id` is valid (or vice
  versa)? (Documented deterministic handling of the valid portion.)
- How is `tracestate` bounded (max length / entry count), and what happens past
  the bound? (Bounded or omitted per documented limits; never unbounded.)
- How does trace context interact with redaction/sanitization — are trace ids
  ever redacted, and is surrounding-attribute redaction unaffected? (Trace ids
  are not secrets and pass through; redaction of other fields is unchanged;
  `tracestate` carries no secret-leak path.)
- What happens when a transport that predates trace fields (`./transport-beacon`)
  receives an event with trace context? (Structured context is included in the
  payload; nothing breaks.)
- What happens when two layers (host root vs. module `correlation()`) supply
  conflicting trace context? (Documented merge precedence resolves it.)

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: Adds an optional structured trace field to the event
  `context` model (working name `context.trace`), an optional way to supply it
  (final shape deferred — see Deferred Decisions #1), and likely a small
  `traceparent` parsing helper. Extends the `./transport-otlp` serializer's
  `LogRecord` output with OTLP's standard trace fields. **No** removal or change
  of existing `LogContext` fields, transports, or their public surfaces.
- **Compatibility Impact**: Additive and backward compatible. Events without
  trace context are byte-unchanged; existing consumers and transports are
  unaffected. New optional context field + optional helper.
- **Migration Notes**: None required. Opt-in: consumers supply trace context to
  start getting correlation.
- **Host/Module Usage Impact**: Trace context layers through the existing
  context-merge precedence (root config → logger chain → `correlation()`); host
  owns the runtime, modules contribute/override via the documented path without
  replacing host configuration.
- **Security & Privacy Considerations**: `trace_id` / `span_id` are identifiers,
  not secrets, and are carried as supplied; `tracestate` is length/shape-bounded
  with no path that serializes a secret. Existing attribute/context/error
  redaction is unchanged and still runs before any transport sees the event.
  Malformed trace input is dropped fail-closed. No new default captures any
  additional user data.
- **Log Integrity Considerations**: Trace fields are stable, machine-parseable,
  and origin-attributable; they strengthen correlation (Principle VI). Their
  presence/absence and the valid/invalid-portion handling are documented; no
  drop/sample/reorder of events is introduced.
- **Runtime Scale & Federated Deployment Impact**: No per-`Logger` trace state,
  timers, listeners, or ambient reads; trace resolution stays cheap and
  synchronous (the `correlation()` contract). Derived loggers stay constant-cost.
  Host/module ownership is explicit; duplicate-package-copy behaviour is
  unchanged from the existing core classification.
- **Verification & Enforcement**: Verified identically in CI and locally via the
  existing `npm` scripts and quality-gate jobs. New enforcement: a contract test
  for the trace-context field model + merge precedence; a failure-safety test
  for malformed input (fail-closed, no throw); a security test that surrounding
  redaction is unaffected and no secret leaks via `tracestate`; an OTLP
  trace-mapping test asserting `LogRecord` `traceId`/`spanId`/`traceFlags`; and
  the existing `./transport-otlp` bundle-shape + invariance gates continue to
  hold (no `@opentelemetry/*`; sizes in budget).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The event `context` model MUST support an optional structured
  trace context (W3C Trace Context: `trace_id`, `span_id`, optional trace flags
  and `tracestate`) that, when present, appears on every emitted `LogEvent`.
- **FR-002**: The system MUST accept trace context supplied by the host
  application (consume/propagate) and MUST NOT generate spans, timing, or
  sampling decisions — SafeSignal is not a tracer.
- **FR-003**: When an event carrying trace context is delivered via
  `./transport-otlp`, the system MUST populate the OTLP `LogRecord`'s standard
  `traceId` / `spanId` / `traceFlags` fields from that context; when no trace
  context is present, those fields MUST be omitted (no empty/all-zero ids).
- **FR-004**: The system MUST validate trace context against W3C Trace Context
  rules (id lengths/hex, non-zero ids, `tracestate` bounds) and MUST drop
  invalid or malformed parts **fail-closed**, keeping any valid portion, with
  documented deterministic handling.
- **FR-005**: Supplying, parsing, validating, or attaching trace context MUST
  never throw or reject into the emit path; a logging call with bad trace input
  MUST still emit the event without trace fields.
- **FR-006**: The package MUST preserve browser runtime safety and failure
  resilience for all new behaviour, including fail-closed handling when trace
  parsing/validation/serialization fails.
- **FR-007**: The package MUST keep behaviour framework- and vendor-neutral:
  pure W3C Trace Context, working with any tracer that emits it, with no vendor
  dependency and **no `@opentelemetry/*` import reaching the `./transport-otlp`
  bundle**.
- **FR-008**: The system MUST define the structured trace metadata shape and its
  privacy-safe handling: trace ids are carried as identifiers (not secrets);
  `tracestate` is bounded; surrounding redaction is unaffected; output stays
  structured and machine-parseable.
- **FR-009**: The system MUST be secure by default: trace context MUST NOT
  introduce a path that exposes secrets, credentials, tokens, session
  identifiers, or unnecessary personal data (including via `tracestate`), and
  MUST NOT weaken existing redaction or encourage unsafe patterns.
- **FR-010**: The system MUST preserve log integrity: trace fields are stable,
  machine-parseable, and origin-attributable; presence/absence and
  partial-validity handling are documented; no new drop/sample/reorder of events
  is introduced.
- **FR-011**: The package MUST keep `Logger` creation lightweight and
  side-effect-free for this feature — no per-`Logger` trace state, timer, global
  listener, ambient read, or network work — and MUST resolve trace context
  through the existing cheap, synchronous context-merge precedence (root config
  → logger chain → `correlation()`), keeping host/module ownership explicit.
- **FR-012**: The package MUST pair every quality gate this feature documents
  (trace field model + merge precedence, fail-closed validation, OTLP
  trace-field mapping, the secure-`tracestate` clause, the unchanged
  `./transport-otlp` vendor-neutral bundle + size gates, and the existing
  bundle-invariance gates) with a machine-executable enforcement mechanism that
  fails closed when violated, AND MUST keep verification outcomes identical
  between CI and local runs for the same source. Test code under `tests/` MUST
  meet the same typing/lint/build/import standards as `src/`; any tolerated
  relaxation MUST carry a written, named, time-bound removal condition in this
  feature's task list.
- **FR-013**: The feature MUST NOT change the runtime behaviour or public API of
  events that carry no trace context, and MUST keep all published bundles within
  their invariance gates (existing default / `./testing` / `./transport-beacon`
  within ±1 KiB; `./transport-otlp` within its recorded budget).

### Key Entities *(include if feature involves data)*

- **TraceContext** (structured): `trace_id` (32-hex), `span_id` (16-hex),
  optional trace flags (e.g. sampled), optional `tracestate`. Carried on
  `LogEvent.context` when present. (Exact field names finalized in
  `/speckit-clarify` + `/speckit-plan`.)
- **Traceparent (W3C string)**: the `00-<trace-id>-<span-id>-<flags>` header
  form a host supplies; parsed into `TraceContext` by the helper.
- **OTLP LogRecord trace fields**: the standard `traceId` / `spanId` /
  `traceFlags` populated on the OTLP payload when trace context is present.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A host that supplies a valid trace context sees every emitted
  event carry structured `trace_id` / `span_id`, and OTLP-delivered logs carry
  the matching standard OTLP trace fields — verified by automated tests with no
  custom backend mapping.
- **SC-002**: 100% of malformed/invalid trace inputs (bad hex, wrong length,
  all-zero id, oversized `tracestate`, partial validity) result in the event
  still being emitted, the invalid part omitted, and zero throws/rejections to
  the caller — verified by automated tests.
- **SC-003**: Events that carry no trace context are unchanged (byte-for-byte
  for the default/`./testing`/`./transport-beacon` bundles within their
  invariance gates; OTLP records omit trace fields), verified by tests + bundle
  gates.
- **SC-004**: The `./transport-otlp` bundle remains vendor-neutral (no
  `@opentelemetry/*` reference) and within its size budget after the serializer
  extension — verified by the existing bundle-shape security test.
- **SC-005**: Consumer-facing trace behaviour (field model, merge precedence,
  OTLP mapping, parsing helper) is verified by automated contract tests.
- **SC-006**: Runtime failures in trace parsing/validation/serialization degrade
  safely without breaking normal browser interactions — verified by
  failure-injection tests.
- **SC-007**: Documentation/examples for host-app and module-based integration
  show supplying trace context safely and stay accurate; the existing test suite
  stays regression-free aside from this feature's added tests.

## Assumptions

- **Ingestion API (deferred to `/speckit-clarify`)**: Working assumption —
  trace context is **app-supplied** through the existing context-merge path
  (root config / `withContext()` / `correlation()` return value), plus a
  `parseTraceparent(string)` helper for the common header-string case. No
  ambient global source is read by default (Principle VII).
- **Generation (deferred)**: Working assumption — **carry-only** for v1
  (SafeSignal does not mint trace/span ids); any page-session id generation is a
  clarify decision.
- **Field model (deferred)**: Working assumption — `context.trace =
  { traceId, spanId, traceFlags?, traceState? }` as hex strings, mapped to the
  OTLP `LogRecord` standard trace fields. Finalized in clarify/plan.
- **Outbound header injection (deferred)**: Working assumption — **out of
  scope** for this feature; injecting a `traceparent` request header on
  transport delivery is a candidate follow-up.
- **Format**: Vendor-neutral **W3C Trace Context** only; works with any tracer
  that emits a `traceparent`. No vendor SDK dependency.
- **Dependency on Feature 007**: This feature extends the `./transport-otlp`
  serializer from Feature 007; it is sequenced after 007 (MR !23) and preserves
  007's vendor-neutral bundle gate.
- **Pipeline ordering**: Trace context is attached as part of context
  resolution, before redaction/sanitization run; trace ids pass through
  redaction unchanged while surrounding-field redaction is unaffected.
- **Constitution**: Governed by Constitution v1.3.0 (Principles I–IX),
  especially II (fail-safe), III (neutral), IV (secure), VI (integrity), VII
  (lightweight/federated), VIII (reproducible), IX (mechanical enforcement).

## Out of Scope

- Becoming a tracer: span creation, span timing, span lifecycle, or sampling
  decisions.
- Traces or metrics as OTLP signals (this feature only enriches **logs** with
  trace context).
- Auto-instrumentation of `fetch`/XHR or automatic trace-context discovery (RUM
  territory).
- Outbound `traceparent` header injection into transport delivery requests
  (candidate follow-up).
- OTLP/HTTP+protobuf encoding; RUM features.
- Any change to the runtime behaviour or public API of events that carry no
  trace context.
