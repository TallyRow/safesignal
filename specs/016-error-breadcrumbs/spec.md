# Feature Specification: Opt-In Error Breadcrumbs (Bounded Recent-Event Context on Errors)

**Feature Branch**: `016-error-breadcrumbs`

**Created**: 2026-06-01

**Status**: Draft

**Input**: GitHub issue #15 — "feat: opt-in error breadcrumbs (bounded recent-event context on errors)" (roadmap V3)

> **Why this exists (visible developer value).** When an error is logged, the single hardest question in
> debugging is "what happened *just before* this?" Today each `LogEvent` stands alone. This feature, when
> opted in, makes an **error log automatically carry a short trail of the most recent events** plus the
> **error's cause chain** — a Sentry-style breadcrumb trail, vendor-free and built only from SafeSignal's
> own already-safe events. The developer (or their backend) sees the lead-up to a failure without
> threading context by hand. **Off by default**; pairs with the V1 `./capture` global error capturer.
>
> **Constitution fit:** a single runtime-level **bounded ring buffer** — O(1) per log, **constant
> memory** regardless of volume, configured once and shared across every `Logger` (Principle VIII); a
> **documented, additive enrichment** of the error event that never mutates a delivered event, drops,
> reorders, or dedupes anything (Principle VII); built only from the **post-pipeline, already
> sanitized + redacted** event, so it adds no new leakage (Principle IV/V); **fail-safe** (Principle III);
> and **off by default** (secure-by-default — Principle V).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An error log carries the events that led up to it (Priority: P1)

A developer enables breadcrumbs once at runtime configuration. From then on, every error their app
logs automatically includes a bounded trail of the most recent preceding events (each a compact,
already-redacted summary: time, level, message, bounded attributes). When triaging the error — locally
or in their backend — the lead-up is right there on the error event, no manual correlation required.

**Why this priority**: This is the entire visible value and the MVP. The recent-event trail is what
turns an isolated error into a debuggable story.

**Independent Test**: With breadcrumbs enabled, log a sequence of events (info/warn/debug), then log an
error; confirm the delivered error event carries the preceding events as a documented, bounded,
already-redacted trail (and that non-error events are unchanged).

**Acceptance Scenarios**:

1. **Given** breadcrumbs enabled and several events already logged, **When** an error is logged, **Then**
   the delivered error event carries the most recent preceding events (up to the configured limit) as a
   documented, machine-parseable trail of compact summaries.
2. **Given** breadcrumbs enabled, **When** a non-error event is logged, **Then** it is delivered
   unchanged (no trail attached) and is recorded into the buffer for future errors.
3. **Given** breadcrumbs enabled and fewer events logged than the configured limit, **When** an error is
   logged, **Then** the trail contains exactly the available events (no padding, no empty entries).

---

### User Story 2 - The error's cause chain is unrolled (Priority: P2)

A developer logs an error that wraps another error (`new Error('checkout failed', { cause: paymentErr })`,
possibly nested further). The error event automatically carries the **ordered cause chain** — each
underlying cause's name and message — so the root cause is visible without re-throwing or manual
unwrapping.

**Why this priority**: The cause chain is the other half of "what led to this error." High value, but the
recent-event trail (P1) is the headline; this complements it.

**Independent Test**: With breadcrumbs enabled, log an error whose value has a nested `cause` chain;
confirm the delivered error event carries the chain as an ordered, bounded, cycle-safe list of
name/message entries.

**Acceptance Scenarios**:

1. **Given** an error value with a nested `cause` chain, **When** it is logged, **Then** the error event
   carries the chain as an ordered list (outermost → root), each entry a redacted name/message.
2. **Given** an error whose cause chain is cyclic or very deep, **When** it is logged, **Then** the chain
   is flattened to a bounded number of entries with no infinite loop and no thrown error.
3. **Given** an error with no `cause`, **When** it is logged, **Then** no cause-chain field is added (no
   empty-field noise).

---

### User Story 3 - Breadcrumbs are safe, bounded, and invisible until enabled (Priority: P3)

The capability is off by default and, once enabled, stays within strict bounds: the buffer holds at most
N entries (constant memory) no matter how many events are logged; recording is cheap; breadcrumbs carry
only already-redacted data; and a failure in recording or enrichment never breaks the page or prevents
the error from being delivered. Creating loggers stays free of any per-logger buffer or listener.

**Why this priority**: Principles V (secure/off-by-default), VIII (constant memory / lightweight loggers),
VII (integrity), and III (fail-safe) all bind here. Necessary for correctness; it hardens P1/P2.

**Independent Test**: Confirm that disabled = no buffer / no recording / unchanged behavior; that logging
far more than N events keeps memory bounded to N entries; that a secret in pre-redaction data never
appears in a breadcrumb; that a throwing recorder/enricher is swallowed and the error still delivers;
and that creating many loggers adds no per-logger cost.

**Acceptance Scenarios**:

1. **Given** breadcrumbs **disabled** (the default), **When** events and errors are logged, **Then**
   behavior, output, and per-event cost are identical to today — no buffer is allocated and nothing is
   recorded.
2. **Given** breadcrumbs enabled, **When** many more than N events are logged, **Then** the buffer never
   holds more than N entries (oldest evicted first) and total memory stays constant.
3. **Given** breadcrumbs enabled, **When** recording or enrichment throws internally, **Then** the
   failure is swallowed (routed to the diagnostics hook) and the error event is still delivered.

---

### Edge Cases

- **No prior events before the first error**: the trail is empty/omitted — no placeholder noise.
- **Error logged from within breadcrumb processing** (re-entrancy): guarded so enrichment cannot
  recursively trigger itself; never loops.
- **Cyclic or extremely deep `cause` chain**: bounded depth + cycle detection stops it; never throws.
- **Very large attributes on a recorded event**: already bounded by the sanitizer before recording; each
  breadcrumb is *additionally* size-bounded so total buffer memory stays constant.
- **An event dropped by the pipeline** (fail-closed redaction, sanitizer drop): a dropped event is **not**
  recorded as a breadcrumb (only successfully-processed, transport-bound events are).
- **Breadcrumbs + the `./capture` global error capturer (V1)**: captured uncaught errors flow through
  `logger.error`, so they are enriched like any other error.
- **Federated page with many module loggers**: one shared buffer per configured runtime; module and host
  breadcrumbs remain origin-attributable.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: Adds an **opt-in, runtime-level** breadcrumbs configuration option on the core
  runtime config (off by default — RESOLVED Option A), plus the documented structured shape of the trail
  and cause-chain fields that appear on an enriched error event. No existing export is removed or changed;
  existing event shapes are unchanged when the feature is disabled. The public surface stays minimal — one
  additive configuration option, no new extension point and no new subpath.
- **Compatibility Impact**: Additive / backward compatible. Disabled by default → no consumer sees any
  change until they opt in.
- **Migration Notes**: One opt-in step at runtime configuration to enable breadcrumbs; nothing changes
  for consumers who do not enable it.
- **Deprecation & Migration**: Nothing deprecated or removed.
- **Host/Module Usage Impact**: The buffer is a host-owned, runtime-level shared resource configured once;
  federated modules do not each create one. Enabling is the host's decision (it owns the configured
  runtime).
- **Security & Privacy Considerations**: Breadcrumbs are built **only** from the post-pipeline event —
  already sanitized, URL-scrubbed, redacted, control-char-guarded, bounded. No raw application object is
  captured; no pre-redaction value is stored. The enriched error event carries only this already-safe
  data; enabling breadcrumbs introduces **no new sensitive-data path**. Off by default.
- **Log Integrity Considerations**: Enrichment is **additive and documented**: it adds trail + cause-chain
  fields to the **error** event only, with a stable machine-parseable shape. It MUST NOT drop, reorder,
  dedupe, or mutate any other event, MUST NOT change what non-error events carry, and MUST NOT mutate an
  event already delivered to a transport (the buffer stores snapshots). This is a documented enrichment
  per Principle VII.
- **Runtime Scale & Federated Deployment Impact**: Recording is **O(1)** per log; the buffer is a single
  **bounded** (constant-memory) runtime-level resource shared across all loggers. `Logger` creation and
  derivation stay lightweight and side-effect-free — **no** per-`Logger` buffer, timer, or listener.
  Duplicate-package-copy behavior is documented (each copy's runtime owns its own buffer — **isolated**).
- **Supply-Chain / Distribution Impact**: **No new runtime dependency** (a plain in-memory ring buffer).
  Delivered as a **core runtime option** (Option A), so **no new subpath** is added; the `exports` map is
  unchanged. The default `.` entry's bundle-invariance budget is **re-baselined with a documented
  justification** (the established mechanism, e.g. Feature 008) to account for the small, off-by-default
  buffer + enrichment code. Attested publishing, signed tags, DCO, and pins are unchanged.
- **Verification & Enforcement**: Contract tests (trail + cause-chain shape and bounds; disabled = no
  change), security tests (only post-redaction data in breadcrumbs; no secret leakage), integrity tests
  (other events untouched; delivered events not mutated), scale/performance tests (constant memory over
  M ≫ N events; no per-`Logger` cost), and failure-safety tests (recorder/enricher throw is swallowed;
  error still delivered). All run identically locally and in CI through the existing `npm` scripts, and
  the relevant bundle gate (default-entry budget and/or parity gate, per the chosen delivery).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The capability MUST be **opt-in and OFF by default**. While disabled, no buffer is
  allocated, **no** event is recorded, and behavior, output, and per-event cost are **identical** to
  today.
- **FR-002**: When enabled, the runtime MUST maintain a **single bounded ring buffer** of the most recent
  successfully-processed (post-pipeline, already sanitized + redacted) events, evicting the oldest first
  so the buffer never holds more than the configured capacity — **constant memory** regardless of how
  many events are logged.
- **FR-003**: Recording an event into the buffer MUST be **O(1)** and MUST NOT mutate the event delivered
  to transports (it records a bounded **snapshot**, not a reference that could later change).
- **FR-004**: When an **error-level** event is emitted with breadcrumbs enabled, that error event MUST be
  enriched with the **current trail** — the recent breadcrumbs preceding it (excluding the error itself) —
  as **documented, machine-parseable** structured data with a stable field shape, ordered oldest →
  newest.
- **FR-005**: The enrichment MUST also include the error's **cause chain** when present — the ordered
  (outermost → root), **bounded-depth**, **cycle-safe** sequence of nested causes (each a redacted
  name/message, optional stack) — and MUST omit the field entirely when there is no cause.
- **FR-006**: Breadcrumbs and the cause chain MUST contain **only** already-sanitized + redacted data (the
  post-pipeline safe form), carrying the **same** redaction guarantee the rest of the pipeline provides —
  whole-value masking of secret-shaped values and denylisted keys (the redactor is anchored whole-value;
  it does not scrub secrets embedded as substrings of free text, exactly as for any `message`/attribute
  today). Enabling breadcrumbs MUST NOT capture raw application objects, read ambient state, weaken
  redaction, or introduce any **new** unsanitized/unredacted path (Principle IV/V). The trail is recorded
  from the post-redaction event; the cause chain is written into attributes **before** the pipeline so the
  existing sanitizer + redactor process it identically.
- **FR-007**: Enrichment MUST be **additive and integrity-preserving** (Principle VII): it MUST NOT drop,
  reorder, dedupe, or mutate any other event; MUST NOT change what **non-error** events carry; and MUST
  NOT mutate an event already delivered to a transport. The trail/cause fields appear on the **error**
  event only.
- **FR-008**: The buffer and enrichment MUST be a **single runtime-level shared resource** configured once
  and shared across every `Logger` derived from that runtime (Principle VIII). `Logger` creation and
  derivation (`child()`/`withContext()`) MUST remain lightweight and side-effect-free — **no** per-
  `Logger` buffer, timer, listener, global patch, network work, or ambient read.
- **FR-009**: Buffer capacity (N) MUST be **configurable** with a documented default and an **enforced
  upper bound**; out-of-range values clamp to the bound and emit **one** diagnostic notice (no silent
  unbounded growth).
- **FR-010**: Recording and enrichment MUST be **fail-safe** (Principle III): any internal failure is
  swallowed and routed to the diagnostics hook, MUST NOT throw into the page, and MUST NOT prevent the
  error event from being delivered — the error still ships, with or without a partial trail.
- **FR-011**: Enriched error events MUST remain **origin-attributable** (application/module identity,
  environment, correlation) and breadcrumbs from host vs. federated-module loggers MUST stay
  distinguishable; the duplicate-package-copy behavior MUST be documented (**isolated** — each runtime
  owns its own buffer).
- **FR-012**: Each breadcrumb entry and the total enrichment payload on the error event MUST be
  **size-bounded** (bounded attribute count / string lengths), so the trail cannot inflate an error event
  without limit and buffer memory stays constant. (FR-002 bounds the **number** of entries; this bounds
  each entry's and the payload's **size**.)
- **FR-013**: The feature MUST add **no new runtime dependency** and MUST keep the distributed surface
  honest. It is delivered as a **core runtime configuration option** (off by default — see Dependencies,
  RESOLVED Option A), so the small, off-by-default buffer + enrichment code lives in the default `.`
  entry; the default-entry **bundle-invariance budget MUST be re-baselined with a documented
  justification** (the established Feature 008 mechanism). No new packaged subpath is added.

### Key Entities *(include if feature involves data)*

- **Breadcrumb**: A compact, bounded snapshot of one past **post-pipeline** `LogEvent` — timestamp, level,
  message, and a bounded subset/size of attributes (already redacted). Append-only into the ring buffer;
  never references the live event.
- **Breadcrumb Buffer**: A single runtime-level **bounded ring buffer** (capacity N) of the most recent
  breadcrumbs, shared across all loggers on the runtime. O(1) append, oldest-evicted, constant memory.
- **Error Cause Chain**: An ordered (outermost → root), bounded-depth, cycle-safe list of the error
  value's nested `cause` entries (redacted name/message, optional stack).
- **Enriched Error Event**: The error `LogEvent` plus the documented trail + cause-chain fields, produced
  only for error-level emissions when enabled. Other events and already-delivered events are never
  mutated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With breadcrumbs **disabled** (default), logging behavior, delivered event shapes, and
  per-event cost are **identical** to today — **0** breadcrumb buffer allocated and **0** events recorded.
- **SC-002**: With breadcrumbs enabled, an emitted error event carries the last **min(N, available)**
  preceding events as a documented, ordered trail and, when the error has a cause chain, the ordered
  bounded cause list — verified by contract tests.
- **SC-003**: Logging **M ≫ N** events keeps the buffer bounded to **N** entries (constant memory) and
  keeps per-log recording cost **O(1)** (does not scale with M) — verified by a scale/performance test.
- **SC-004**: A known secret fixture supplied as a **whole value** (an entire attribute value or an
  entire cause message — what the redactor is contracted to mask) appears **0** times unredacted in any
  breadcrumb or in the enriched error event; the redacted placeholder is what shows. (This is the
  redactor's existing whole-value guarantee — breadcrumbs add no new leakage path; substring-in-free-text
  is out of scope here exactly as it is for `message` today.)
- **SC-005**: A **cyclic / deeply nested** cause chain is flattened to a bounded list with **0** infinite
  loops and **0** thrown errors.
- **SC-006**: A throwing recorder or enricher is swallowed: **100%** of error events are still delivered
  and **0** failures break the page.
- **SC-007**: Creating many `Logger` instances incurs **0** per-logger buffers, timers, or listeners; the
  enrichment runs once per error at the runtime level only.

## Assumptions

- **Off by default; explicit opt-in.** Breadcrumbs are never on unless the host enables them at runtime
  configuration (secure-by-default — Principle V). The host owns the decision (it owns the runtime).
- **Records the post-pipeline event only.** A breadcrumb is captured **after** the security pipeline
  (sanitize → URL-scrub → redact → control-char-guard) has produced the safe event — so the trail carries
  no new leakage and re-presents only already-safe data. Events the pipeline **drops** are not recorded.
- **Compact bounded snapshots.** A breadcrumb stores a bounded summary (timestamp, level, message, bounded
  attributes), not a full deep copy — keeping per-entry and total memory constant. Exact field set and
  size bounds are settled in `/speckit-plan`.
- **All successfully-processed events are recorded** (every level), so the trail reflects the true lead-up;
  an optional minimum-level filter MAY be offered as a configuration refinement (plan-level), defaulting to
  "record all."
- **Default capacity.** A reasonable default N (e.g. on the order of dozens) with an enforced upper bound;
  the exact default/bound are settled in `/speckit-plan`.
- **Enrichment happens in the core pipeline path**, before transports receive the error event, so the
  *real* error event delivered to every transport carries the trail (not just a side channel). Recording
  observes the same post-pipeline event. This is true regardless of how enabling is surfaced.
- **No new dependency.** A plain in-memory ring buffer; no library.
- **Presentation/enrichment, not transport semantics.** This changes only what an **error** event carries
  when enabled; it does not change which events are emitted, their order, redaction, level filtering, or
  what any transport receives for non-error events.

## Dependencies

- **The existing pipeline + runtime** (the post-pipeline `LogEvent`, the dispatcher, the configured shared
  runtime, the `onInternalError` diagnostics hook) — present today; breadcrumbs observe the post-pipeline
  event and enrich the error event within this path.
- **Feature 013 `./capture` (V1)** — complementary: captured uncaught errors flow through `logger.error`
  and are therefore enriched like any other error. Not a hard prerequisite.
- **Feature 012 distributed-surface parity** — **not engaged** (Option A adds no new subpath; the
  `exports` map is unchanged).
- **Delivery mechanism — RESOLVED (Option A: core runtime configuration option).** Breadcrumb recording +
  error enrichment occur in the **core pipeline** (so the real error event delivered to every transport
  carries the trail, and breadcrumbs are built from the post-redaction safe form). The capability is
  **surfaced as a single opt-in runtime configuration option, off by default** — the most ergonomic and
  "automatic" fit for a capability that is intrinsically core pipeline work, with **minimal public
  surface** (one additive option; no new extension point; no new subpath). The (small, off-by-default)
  ring-buffer + cause-chain + enrichment code lives in the default `.` entry, so the default-entry
  **bundle-invariance budget is re-baselined with a documented justification** at plan time (the
  established Feature 008 mechanism). The rejected alternative — a dedicated `./breadcrumbs` subpath plus a
  generic core enrichment seam — would keep the default bundle leaner but adds a new public extension point
  **and** a new subpath (more total public surface) for a feature whose enrichment must live in core
  regardless. The exact option name + configuration shape are settled in `/speckit-plan`.
