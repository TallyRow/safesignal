# Feature Specification: Outbound `traceparent` Header Injection

**Feature Branch**: `009-traceparent-injection`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "Add outbound W3C `traceparent` header injection to
@tallyrow/safesignal (Feature 009): when the `./transport-otlp` transport delivers a
batch to a backend, optionally set a `traceparent` (and `tracestate`) request header on
the delivery request itself, so the ingest request is joinable to the trace its events
belong to — completing the logs-to-traces correlation that Feature 008 started on the
event payload."

## Overview

Feature 008 lifted **W3C Trace Context** onto SafeSignal's event payload: every event
can now carry a structured `context.trace = { traceId, spanId, traceFlags?, traceState? }`,
and the `./transport-otlp` serializer maps it to the OTLP `LogRecord`'s standard trace
fields. That makes each individual log line joinable to its trace **in the payload**.

This feature completes the picture at the **transport layer**: when `./transport-otlp`
delivers a batch over HTTP, it can optionally set a standard W3C `traceparent` (and,
when applicable, `tracestate`) **request header** on the delivery request itself. An
OTLP backend, collector, or proxy that inspects request headers can then attribute the
ingest request to the trace its events belong to — useful for backends that key off
request-level trace context and for end-to-end tracing of the delivery hop.

**Settled framing**: SafeSignal stays **carry-only** and is **not** a tracer — it never
mints trace or span ids (Feature 008's invariant holds). This feature only **propagates**
the structured trace context events already carry, lifting it onto the request header in
standard `traceparent` form (`00-<trace-id>-<span-id>-<flags>`). It is **off by default**
and strictly additive: when not enabled, no request header, event payload, or bundle
changes.

## Clarifications

### Session 2026-05-30

The feature description supplied three **settled defaults** that fix the decisions a
clarification session would otherwise surface. They are recorded here for traceability
and are **not** re-opened unless a contradiction surfaces during `/speckit-plan`:

- **Scope = `./transport-otlp` only.** Injection applies solely to the `fetch`-based OTLP
  transport, which can set arbitrary request headers. `./transport-beacon` is out of
  scope because `navigator.sendBeacon` cannot set custom request headers (only the Blob
  content-type); beacon-side propagation is a distinct future feature. The spec does not
  imply beacon support.
- **Batch policy = homogeneous-only, fail-closed.** A delivery request carries a batch of
  events that may belong to different traces, or none, while a single `traceparent`
  describes exactly one trace/span. The header is injected **only** when every event in
  the batch shares one identical, valid normalized trace context. An empty batch, a batch
  with no trace context, or a batch spanning two or more differing trace contexts omits
  the header entirely — no arbitrary "representative" event, no misleading correlation.
- **Opt-in surface = a single additive option.** A new optional `injectTraceparent?:
  boolean` (default `false`) on the existing `OtlpTransportOptions`. No new ambient read,
  no new subpath, no new runtime API, and no new exported runtime name.

## Dependency

This feature extends the `./transport-otlp` transport delivered by **Feature 007** and
the trace-context model + normalization delivered by **Feature 008** (both shipped in
**v1.2.0**, 2026-05-30). It preserves 007's vendor-neutral bundle gate (no
`@opentelemetry/*` in the subpath) and the existing bundle-invariance gates.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single-trace batch tags its delivery request (Priority: P1)

A host application enables `injectTraceparent` on its OTLP transport. When SafeSignal
flushes a batch whose events all share one valid trace context (the common case when a
burst of logs is emitted within one active span), the delivery request carries a
`traceparent` header matching that trace, so the backend or collector can attribute the
ingest request to the trace — without any change to the event payload it already
receives.

**Why this priority**: This is the feature's reason to exist — request-level
logs-to-traces correlation and the natural completion of Feature 008's payload-level
mapping. It is independently valuable: a team flips one option and immediately sees the
delivery request joined to its trace, with no other story shipped.

**Independent Test**: With `injectTraceparent: true`, deliver a batch whose events all
carry one identical valid trace context; assert the outbound request bears a
`traceparent` header equal to `00-<trace-id>-<span-id>-<flags>` for that context and the
event bodies are unchanged.

**Acceptance Scenarios**:

1. **Given** `injectTraceparent: true` and a batch whose events all share one valid
   normalized trace context, **When** the batch is delivered, **Then** the request
   carries a `traceparent` header in standard W3C form for that trace context.
2. **Given** the shared trace context also carries an identical valid `traceState` across
   the batch, **When** the batch is delivered, **Then** the request additionally carries a
   matching `tracestate` header (bounded per documented limits).
3. **Given** `injectTraceparent` is enabled, **When** a batch is delivered, **Then** the
   event payload bodies and the OTLP `LogRecord` trace fields are byte-identical to the
   injection-disabled case (the header is purely additive to the request).

---

### User Story 2 - Mixed / absent trace context never produces a misleading header (Priority: P1)

When a batch spans more than one trace, carries no trace context, or is empty, SafeSignal
omits the `traceparent` header rather than pick an arbitrary event — a delivery request
must never claim a trace it doesn't uniformly belong to. Likewise, malformed or partial
trace input drops fail-closed and never blocks delivery.

**Why this priority**: Fail-safe, non-misleading behaviour is a non-negotiable
constitutional invariant (Principles II and VI). A correlation feature that mislabels a
mixed batch, or that could throw from the delivery path, is not shippable — co-equal P1
with the happy path.

**Independent Test**: Deliver (a) a batch spanning two differing valid trace contexts,
(b) a batch with no trace context, (c) an empty batch, and (d) a batch carrying malformed
trace input; assert no `traceparent`/`tracestate` header is set in any case, every batch
still delivers, and no call throws or rejects.

**Acceptance Scenarios**:

1. **Given** a batch whose events carry two or more differing valid trace contexts,
   **When** it is delivered, **Then** no `traceparent` header is set and the batch still
   delivers.
2. **Given** a batch whose events carry no trace context (or an empty batch), **When** it
   is delivered, **Then** no `traceparent` header is set and delivery proceeds normally.
3. **Given** events whose trace input is malformed, partial, or invalid (bad hex, wrong
   length, all-zero id, oversized `tracestate`), **When** the batch is delivered, **Then**
   the invalid context yields no header, the events still ship, and no call throws.
4. **Given** the shared trace ids are valid but the `traceState` differs across the batch
   (or is oversized), **When** the batch is delivered, **Then** the `traceparent` header
   is still set for the shared ids while `tracestate` is omitted — the optional part is
   dropped individually without dropping the valid ids.

---

### User Story 3 - Disabled by default; existing deliveries unchanged (Priority: P1)

A host that does not opt in (the default) sees its OTLP deliveries behave exactly as they
did before this feature: no `traceparent` header, no payload change, no bundle growth past
the recorded gates. Adopting the feature is a deliberate one-line opt-in.

**Why this priority**: Backward compatibility and the no-surprise default are
constitutional (Principles I and VI). Existing consumers must be unaffected unless they
choose otherwise — co-equal P1.

**Independent Test**: Construct an OTLP transport without `injectTraceparent` (and one
with `injectTraceparent: false`); deliver batches that carry valid, shared trace context;
assert no `traceparent`/`tracestate` header is ever set and the request shape matches the
pre-feature baseline.

**Acceptance Scenarios**:

1. **Given** `injectTraceparent` is unset, **When** a batch with valid shared trace
   context is delivered, **Then** no `traceparent` header is set.
2. **Given** `injectTraceparent: false` is set explicitly, **When** a batch is delivered,
   **Then** behaviour is identical to the unset case.
3. **Given** the feature is added to the package, **When** the published bundles are
   measured, **Then** all bundles stay within their invariance gates and the
   `./transport-otlp` bundle stays `@opentelemetry/*`-free.

---

### Edge Cases

- A batch where every event independently normalizes to the *same* trace context but the
  raw inputs differed (e.g. one supplied via `parseTraceparent`, one structured) →
  treated as homogeneous; the header is injected (comparison is on the normalized result).
- A batch where one event's trace context is valid and another's is malformed/absent → the
  malformed/absent event makes the batch non-homogeneous; the header is omitted (a present
  valid context and an absent one are not "the same" context).
- Valid shared ids but per-event differing `traceState` → ids' `traceparent` is set;
  `tracestate` is omitted (optional part dropped, ids kept).
- `traceState` present and identical but over the documented length bound → `traceparent`
  set; `tracestate` omitted (bound enforced; never unbounded).
- Interaction with `options.headers`: the injected `traceparent`/`tracestate` headers must
  not collide with, overwrite, expose, or duplicate any consumer-supplied header value,
  and must carry no secret material.
- Interaction with redaction/sanitization: trace ids are identifiers, not secrets, and are
  carried as supplied; surrounding-field redaction in the payload is unaffected; the
  header path introduces no new secret-serialization route.
- A `keepalive`/page-unload delivery (final flush): header injection follows the same
  homogeneity + fail-closed rules; a partial/odd final batch never throws.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: Adds one optional field `injectTraceparent?: boolean` (default
  `false`) to `OtlpTransportOptions` on the existing `./transport-otlp` subpath. No new
  runtime export, no new subpath, no change to the default entry, `./testing`, or
  `./transport-beacon`. The option type erases at runtime (the runtime export set of
  `./transport-otlp` is unchanged — still exactly `createOtlpTransport`).
- **Compatibility Impact**: Additive and backward compatible. With the option unset or
  `false`, OTLP delivery requests are unchanged (no new header) and event payloads are
  byte-unchanged.
- **Migration Notes**: None required. Opt-in: a consumer sets `injectTraceparent: true`
  on their OTLP transport to start tagging single-trace delivery requests.
- **Host/Module Usage Impact**: The OTLP transport is configured once at the runtime level
  and owned by the host (Feature 007 contract). Modules do not replace it; enabling
  injection is a host-level transport-construction choice. Duplicate-package-copy
  behaviour is unchanged (isolated per Feature 007).
- **Security & Privacy Considerations**: The injected header carries only trace
  **identifiers** (`trace_id` / `span_id` / flags), never secrets. It MUST NOT expose,
  duplicate, or interact with `options.headers` auth/secret values (Feature 007's TO-6
  header/secret isolation holds); `tracestate` is length/shape-bounded (≤ 512 chars, per
  Feature 008) with no secret-leak path. No header value appears in any serialized record,
  request body, `onInternalError` diagnostic, thrown error, or the published bundle. No new
  default captures additional user data (the feature is off by default).
- **Log Integrity Considerations**: No drop, sample, batch-resize, reorder, or transform
  of events is introduced. The header is request-level metadata derived from already-present
  event trace context; its presence/absence rules (homogeneous-only, fail-closed) are
  documented and deterministic. Event payloads and OTLP records are unchanged.
- **Runtime Scale & Federated Deployment Impact**: No per-`Logger` trace state, timers,
  listeners, or ambient reads. The homogeneity check + header build run at delivery time,
  are synchronous, and are bounded by batch size (O(batch)). `child()` / `withContext()`
  stay constant-cost. Host owns the runtime; duplicate copies stay isolated.
- **Verification & Enforcement**: Verified identically in CI and locally via the existing
  `npm` scripts and quality-gate jobs. New enforcement: a contract test for the opt-in
  option + the homogeneous-only injection policy (single-trace batch injects; mixed-trace,
  no-trace, and empty batches omit; default-off omits); a failure-safety test (malformed
  trace → no header, no throw, events still ship); a security test (no secret/auth-header
  leak via the injected header; `tracestate` bounded); and the existing `./transport-otlp`
  bundle-shape + size gates plus the bundle-invariance gates continue to hold.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `./transport-otlp` transport MUST accept a new optional
  `injectTraceparent?: boolean` option (default `false`) on `OtlpTransportOptions`. When
  unset or `false`, delivery requests MUST carry no `traceparent`/`tracestate` header and
  behave exactly as before this feature.
- **FR-002**: When `injectTraceparent` is enabled, the transport MUST set a standard W3C
  `traceparent` request header (`00-<trace-id>-<span-id>-<flags>`) on a delivery request
  **if and only if** every event in that batch shares one identical, valid **normalized**
  trace context (per Feature 008 normalization). It MUST source the header solely from the
  events' existing `context.trace` — it MUST NOT mint trace ids, span ids, spans, timing,
  or sampling decisions (carry-only).
- **FR-003**: The transport MUST OMIT the `traceparent` header (fail-closed) when the batch
  is empty, carries no trace context, or spans two or more differing normalized trace
  contexts. It MUST NOT select an arbitrary "representative" event or otherwise inject a
  header that misrepresents a heterogeneous batch.
- **FR-004**: When the header is injected and the batch's events also share one identical,
  valid `traceState` within the documented length bound, the transport MUST additionally
  set a matching `tracestate` request header. When `traceState` differs across the batch,
  is invalid, or exceeds the bound, the transport MUST omit `tracestate` while still
  setting `traceparent` for the shared valid ids (optional part dropped individually).
- **FR-005**: Constructing, evaluating, validating, or attaching the header MUST NEVER
  throw or reject into `send` / `flush` / `shutdown`; malformed, partial, or heterogeneous
  trace context MUST yield no header and the batch MUST still deliver normally.
- **FR-006**: The package MUST preserve browser runtime safety and failure resilience for
  all new behaviour, including fail-closed handling when header construction or trace
  normalization fails.
- **FR-007**: The behaviour MUST stay framework- and vendor-neutral: pure W3C Trace
  Context, working with any tracer that emits it, with no vendor dependency and no
  `@opentelemetry/*` import reaching the `./transport-otlp` bundle.
- **FR-008**: The injected header MUST carry only trace identifiers and `traceState`
  (bounded), in structured, standards-conformant form; it MUST NOT serialize any other
  event field, attribute, or context into the header.
- **FR-009**: The feature MUST be secure by default: it MUST NOT introduce a path that
  exposes secrets, credentials, tokens, session identifiers, or personal data via the
  injected header (including via `tracestate`); MUST NOT collide with, overwrite, expose,
  or duplicate `options.headers` auth/secret values; and the header value MUST NOT appear
  in any serialized record, request body, `onInternalError` diagnostic, thrown error, or
  the published bundle. It MUST NOT weaken existing redaction.
- **FR-010**: The feature MUST preserve log integrity: no drop/sample/resize/reorder/
  transform of events is introduced; the header is request-level metadata whose
  presence/absence (homogeneous-only, fail-closed) is documented and deterministic; event
  payloads and OTLP records are unchanged by enabling injection.
- **FR-011**: The package MUST keep `Logger` creation lightweight and side-effect-free for
  this feature — no per-`Logger` trace state, timer, global listener, ambient read, or
  network work — and MUST perform the homogeneity check + header build synchronously at
  delivery time, bounded by batch size, on the single configured transport instance, with
  host/module ownership unchanged from Feature 007.
- **FR-012**: The package MUST pair every quality gate this feature documents (the opt-in
  option + homogeneous-only injection policy, fail-closed header omission, the
  secure-header/`tracestate` clause, the unchanged `./transport-otlp` vendor-neutral
  bundle + size gates, and the existing bundle-invariance gates) with a machine-executable
  enforcement mechanism that fails closed when violated, AND MUST keep verification
  outcomes identical between CI and local runs for the same source. Test code under
  `tests/` MUST meet the same typing/lint/build/import standards as `src/`; any tolerated
  relaxation MUST carry a written, named, time-bound removal condition in this feature's
  task list.
- **FR-013**: The feature MUST NOT change the runtime behaviour or public API of OTLP
  deliveries made with injection disabled (the default), MUST NOT change event payloads or
  OTLP `LogRecord` output, and MUST keep all published bundles within their invariance
  gates (default / `./testing` / `./transport-beacon` within ±1 KiB; `./transport-otlp`
  within its recorded budget).

### Key Entities *(include if feature involves data)*

- **Batch trace context (derived)**: the single normalized `TraceContext` shared by every
  event in a delivery batch, or "none" when the batch is empty, trace-less, or
  heterogeneous. Computed at delivery time from each event's `context.trace`; drives
  whether a header is injected.
- **`traceparent` request header**: the standard W3C `00-<trace-id>-<span-id>-<flags>`
  string set on the OTLP delivery request when the batch trace context is a single valid
  context; flags sourced from `traceFlags`.
- **`tracestate` request header**: the optional vendor-state header, set only when present,
  identical across the batch, and within the documented length bound; omitted otherwise.
- **`injectTraceparent` option**: the additive optional `boolean` on `OtlpTransportOptions`
  (default `false`) that gates the whole behaviour.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With `injectTraceparent` enabled, 100% of delivery requests for a
  single-shared-valid-trace batch carry a `traceparent` header matching that trace, and the
  event payload + OTLP records are byte-identical to the disabled case — verified by
  automated tests with no custom backend mapping.
- **SC-002**: 100% of empty, trace-less, and multi-trace ("heterogeneous") batches omit the
  `traceparent` header (no arbitrary representative), and 100% of malformed/partial trace
  inputs result in the batch still delivering with no header and zero throws/rejections —
  verified by automated tests.
- **SC-003**: OTLP deliveries made with injection disabled (the default) are unchanged — no
  new request header, byte-unchanged payloads — verified by tests against the pre-feature
  baseline.
- **SC-004**: The `./transport-otlp` bundle remains vendor-neutral (no `@opentelemetry/*`
  reference) and within its recorded size budget after the change, and the default /
  `./testing` / `./transport-beacon` bundles stay within ±1 KiB — verified by the existing
  bundle-shape + invariance gates.
- **SC-005**: No secret or `options.headers` auth value ever appears in, collides with, or
  is duplicated by the injected header, and `tracestate` never exceeds its bound — verified
  by an automated security test with a secret fixture.
- **SC-006**: Runtime failures in trace normalization or header construction degrade safely
  without breaking delivery or normal browser interactions — verified by failure-injection
  tests.
- **SC-007**: Consumer-facing behaviour (the opt-in option, homogeneous-only injection,
  fail-closed omission, default-off) is verified by automated contract tests, and the
  documentation/examples for enabling injection stay accurate; the existing test suite
  stays regression-free aside from this feature's added tests.

## Assumptions

- **Scope (settled)**: `./transport-otlp` only; `./transport-beacon` is out of scope
  because `navigator.sendBeacon` cannot set custom request headers. Beacon-side propagation
  is a distinct future feature.
- **Batch policy (settled)**: homogeneous-only, fail-closed — inject only when the whole
  batch shares one identical valid normalized trace context; omit for empty / trace-less /
  heterogeneous batches; `traceState` rides along only when present and identical across
  the batch and within bound.
- **Opt-in (settled)**: a single additive optional `injectTraceparent?: boolean` (default
  `false`) on `OtlpTransportOptions`; no new ambient read, subpath, runtime API, or
  exported runtime name.
- **Normalization reuse**: each event's trace context is decided using Feature 008's
  fail-closed normalization (both ids required, 32/16 lowercase-hex non-zero; invalid
  optional parts omitted) **before** the homogeneity comparison.
- **Carry-only**: SafeSignal never mints trace/span ids; absent trace context means no
  header. Session-style correlation ids remain out of scope.
- **Header form**: standard W3C `traceparent` (`00-<trace-id>-<span-id>-<flags>`) and the
  `tracestate` header; lowercase-hex ids; `flags` from `traceFlags`.
- **Dependencies**: extends Feature 007 (`./transport-otlp`, `fetch`+`keepalive` delivery)
  and Feature 008 (trace-context model + normalization), both shipped in v1.2.0; preserves
  007's vendor-neutral bundle gate and the existing bundle-invariance gates.
- **Constitution**: governed by Constitution v1.3.0 (Principles I–IX), especially II
  (fail-safe), III (neutral), IV (secure), VI (integrity), VII (lightweight/federated),
  VIII (reproducible), IX (mechanical enforcement).

## Out of Scope

- Becoming a tracer: span creation, span timing, span lifecycle, or sampling decisions.
- Generating any trace/span id or a page-session correlation id (carry-only).
- `./transport-beacon` header injection (see Settled Default 1 — a distinct future
  feature).
- Per-event header injection or any non-homogeneous batch policy (e.g. picking a
  representative event, splitting a mixed batch by trace) — see Settled Default 2.
- Auto-discovery or auto-instrumentation of `fetch`/XHR or automatic trace-context
  discovery (RUM territory).
- Injecting trace headers into requests other than SafeSignal's own OTLP delivery.
- OTLP/HTTP+protobuf encoding; RUM features.
- Any change to event payloads, OTLP `LogRecord` output, or the behaviour of OTLP
  deliveries made with injection disabled.
