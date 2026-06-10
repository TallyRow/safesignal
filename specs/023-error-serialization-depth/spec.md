# Feature Specification: Structured Error Serialization Depth

**Feature Branch**: `023-error-serialization-depth`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Structured Error serialization depth (roadmap S9, GitHub issue #22). Turn rich Error objects into structured event fields: (a) serialize error.cause chains as structured data with the error itself, not just opt-in via breadcrumbs; (b) serialize AggregateError.errors arrays (currently ignored); (c) capture DOMException specifics; (d) capture safe own enumerable properties of custom Error subclasses. All output must be bounded (depth/count/string-length caps, reusing sanitizer-limit patterns), fail-safe (extraction failure never drops the event or throws into the host app — Constitution III), and privacy-safe (every extracted field flows through the sanitize → scrub → redact pipeline before any transport — Constitution V). Distinct from feature 017 stack normalization; must reconcile with feature 016's existing safesignal.errorCauses cause-chain capture."

## Clarifications

### Session 2026-06-10

- Q: How should custom Error subclass extra fields be captured when deep error
  serialization is enabled? → A: Value-filtered — capture own enumerable
  JSON-safe properties; existing redaction rules are the privacy control (no
  allowlist mechanism in this feature).
- Q: Default-entry bundle size is mechanically locked; what is the size
  posture for this feature's core-pipeline code? → A: A minimal, justified
  ceiling increase in the size-lock test is acceptable (rationale recorded in
  the test; exact number set at plan time). No new exports subpath.
- Q: What shape should the opt-in configuration take? → A: One config key
  accepting `true` (safe defaults) or an options object for tuning the
  serialization limits.
- Q: What is the wire shape of the structured error data? → A: Flat chain +
  recursive members — each error node carries a flat, ordered cause-chain
  array; aggregate nodes additionally carry a members array of nodes that
  recurse the same way.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cause chains travel with the error (Priority: P1)

A developer wraps low-level failures in higher-level errors using the standard
`cause` option (e.g., "checkout failed" caused by "payment API timeout" caused by
"network unreachable"). When they log the top-level error, the emitted event
carries the whole chain as structured data alongside the error itself — not just
the outermost name and message — so an on-call engineer reading the monitoring
backend can see the root cause without reproducing the bug.

**Why this priority**: Cause chains are the standard mechanism for error context
in modern JavaScript, and losing them is the single biggest information loss in
error capture today. This story alone delivers the feature's core value.

**Independent Test**: Log an error that wraps two nested causes and inspect the
emitted event: all three links appear in order as structured entries, each with
its own name and message, and the chain is absent when the error has no cause.

**Acceptance Scenarios**:

1. **Given** an error whose `cause` is another error, which itself has a cause,
   **When** the error is logged, **Then** the event's error data includes a
   structured chain entry for each cause, ordered from outermost to root.
2. **Given** an error with no cause, **When** it is logged, **Then** the event's
   error data contains no cause-chain entries (no empty placeholder fields).
3. **Given** an error whose cause is a non-error value (a string, an object, a
   number), **When** it is logged, **Then** the chain entry records a coerced
   representation labelled as non-error (matching the package's existing
   `NonError` convention) instead of being dropped or crashing.
4. **Given** a cause chain longer than the configured depth limit, **When** the
   error is logged, **Then** the chain is truncated at the limit and the event
   indicates that truncation occurred.

---

### User Story 2 - AggregateError members are visible (Priority: P2)

A developer uses `Promise.any()` or batches work and receives an
`AggregateError` holding several constituent failures. When they log it, the
emitted event lists each member error as structured data (bounded in count), so
the engineer can see *which* of the parallel operations failed and why, instead
of the opaque message "All promises were rejected".

**Why this priority**: AggregateError is the default failure shape of widely
used platform APIs and is currently discarded entirely — but it occurs less
often than plain cause chains.

**Independent Test**: Log an `AggregateError` containing three different errors
and verify the event lists all three members with their names and messages;
verify a member count above the limit is truncated with an indication.

**Acceptance Scenarios**:

1. **Given** an `AggregateError` with three member errors, **When** it is
   logged, **Then** the event's error data lists three structured member
   entries, each with name and message.
2. **Given** an `AggregateError` whose members exceed the configured count
   limit, **When** it is logged, **Then** only the first members up to the limit
   appear and the event indicates how many were omitted.
3. **Given** an `AggregateError` whose member itself has a cause chain, **When**
   it is logged, **Then** the member's chain is captured subject to the same
   overall depth and size bounds.

---

### User Story 3 - Custom subclass fields and DOMException details (Priority: P3)

A developer throws domain-specific error subclasses carrying extra fields (e.g.,
an `HttpError` with `status` and `url`, or the platform's `DOMException` with
its `name` and legacy `code`). When such an error is logged, the emitted event
includes those safe, enumerable own fields as structured data — after the same
privacy redaction applied to all other event data — so triage no longer requires
string-parsing messages.

**Why this priority**: Valuable enrichment, but it builds on the serialization
machinery of stories 1–2 and carries the highest privacy sensitivity, so it
lands last.

**Independent Test**: Log a custom error subclass with two extra enumerable
fields and verify both appear in the event's error data with redaction applied;
log a `DOMException` and verify its distinguishing fields are present.

**Acceptance Scenarios**:

1. **Given** a custom error subclass with own enumerable fields, **When** it is
   logged, **Then** those fields appear as structured error data, bounded in
   count, depth, and string length.
2. **Given** an error field whose name matches the configured redaction rules
   (e.g., `token`), **When** the error is logged, **Then** the field value is
   redacted in the emitted event exactly as it would be in event attributes.
3. **Given** a `DOMException` (e.g., from an aborted fetch), **When** it is
   logged, **Then** the event captures its legacy numeric `code` as an extra
   field (its name and message are already covered by the existing error
   payload fields and are not duplicated elsewhere).
4. **Given** an error object with a field whose property accessor throws,
   **When** it is logged, **Then** the event is still delivered with the
   remaining error data and the failure is reported through the package's
   internal-error channel.

---

### Edge Cases

- Cyclic cause chains (`a.cause = b; b.cause = a`) terminate at the cycle and do
  not hang or overflow.
- An `AggregateError` nested inside a cause chain (and vice versa) is captured
  subject to one overall depth/size budget, not multiplied budgets.
- Errors from another realm (iframe, worker boundary) that fail `instanceof`
  checks are still serialized from their structural shape.
- Property accessors (getters) that throw during extraction must not drop the
  event or propagate into the host application.
- Extremely large extra fields (megabyte strings, huge arrays, deeply nested
  objects) are clipped by the same limits that bound event attributes today.
- Non-error values logged as errors (strings, plain objects, `null`) continue to
  behave exactly as they do today.
- When the new capture is disabled, the event's error payload has exactly
  today's shape — no new fields, no new attributes.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: Additive. The event's error payload gains optional
  structured fields (cause chain, aggregate members, extra fields, truncation
  indicators), and the logger configuration gains one option to enable/tune
  deep error serialization: `true` enables it with safe defaults, or an
  options object tunes the serialization limits (clarified 2026-06-10). No
  existing exported function, type, or event field changes meaning.
- **Compatibility Impact**: Backward compatible / additive. All new event fields
  are optional; consumers ignoring them see today's shape. Default behavior is
  unchanged unless the feature is enabled (see Assumptions).
- **Migration Notes**: None required. Consumers using feature 016's
  breadcrumb-based cause capture (`safesignal.errorCauses` attribute) can adopt
  the richer in-error chain at their own pace; the existing attribute continues
  to work unchanged.
- **Deprecation & Migration**: No contract is removed. If, after adoption, the
  feature-016 cause attribute is deemed redundant, its deprecation would be a
  separate future feature following the standard deprecation policy (replacement
  ships first, signaled in types/changelog, survives ≥1 minor release).
- **Host/Module Usage Impact**: Configuration is per configured runtime, owned
  by the host as today. Federated modules sharing the host runtime inherit the
  host's error-serialization settings; module-created loggers cannot silently
  change host capture behavior.
- **Security & Privacy Considerations**: Highest-sensitivity area of this
  feature. Custom error fields are arbitrary developer data and may contain
  secrets; therefore every extracted value (names, messages, extra fields,
  nested values) MUST pass through the sanitize → URL-scrub → redact pipeline
  before any transport sees it, with redaction failing closed. Today these
  pipeline stages process only the error payload's three flat fields (name,
  message, stack); this feature REQUIRES extending those stages to cover every
  nested field the new structure introduces (see FR-008) — coverage is a
  requirement of this feature, not an incidental design choice. Capture of
  extra fields must never serialize functions, and must not follow prototype
  chains (own enumerable properties only).
- **Standards Alignment** (Constitution IV): Error representation in open
  interchange standards (e.g., OpenTelemetry log/exception semantic
  conventions) covers single-exception type/message/stacktrace but does not
  currently define a structured cause-chain or aggregate-member shape. The
  feature keeps the standards-aligned fields as-is and adds the deeper
  structure as an additive, clearly-scoped extension that does not displace
  the standards-based path; exact field naming is confirmed at design time
  against the then-current conventions, preferring convention-compatible
  names where they exist.
- **Log Integrity Considerations**: No drop/sample/batch/reorder behavior
  changes. Truncation of chains/members/fields is explicit and machine-readable
  (an indicator on the event), preserving honest forensic interpretation.
  Events remain structured and origin-attributable.
- **Runtime Scale & Federated Deployment Impact**: No per-`Logger` cost: no
  timers, listeners, global patches, or ambient reads are added. Serialization
  work happens only when an error is actually logged. Duplicate-package-copy
  behavior is unchanged (isolated, as today).
- **Supply-Chain / Distribution Impact**: No new entry point or `exports`
  subpath is anticipated; the capability extends the existing core pipeline. The
  default-entry bundle-size locks must continue to pass; a minimal, justified
  ceiling increase in the size-lock test is permitted for this feature
  (clarified 2026-06-10), made consciously with rationale recorded in the
  test — never silently. Release pipeline, dependency set, DCO, and
  attestation are untouched.
- **Verification & Enforcement**: All new behavior is verified by the single
  authoritative `npm run verify` gate (build, typecheck, lint, format, tests,
  API surface check) identically in CI and locally. New invariants (bounded
  output, fail-safe delivery, redaction of extracted fields, off-by-default
  byte-identical behavior) are each guarded by automated tests: contract tests
  for the event shape, security tests for leakage, and fault-injection unit
  tests for fail-safe behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When deep error serialization is enabled, the system MUST capture
  an error's `cause` chain as ordered structured data (outermost first) on the
  event's error payload, with each link carrying at least the error name and
  message.
- **FR-002**: The system MUST bound cause-chain capture by a configurable depth
  limit with a safe default, MUST terminate on cyclic chains, and MUST mark the
  payload when truncation occurred.
- **FR-003**: When deep error serialization is enabled, the system MUST capture
  the member errors of an `AggregateError` as structured data, bounded by a
  configurable member-count limit with a safe default, marking truncation and
  recording the original member count.
- **FR-004**: Nested combinations (causes inside aggregate members, aggregates
  inside causes) MUST be captured under a single overall node budget (see
  Serialization Limits) so that total captured error data remains bounded
  regardless of input shape; the node budget is the binding outer limit, and
  the depth and member-count limits are inner bounds subordinate to it, not
  additive to it.
- **FR-005**: When deep error serialization is enabled, the system MUST capture
  safe own enumerable properties of error objects beyond the standard
  name/message/stack/cause — including `DOMException`'s legacy numeric code —
  bounded by configurable field-count, depth, and string-length limits;
  functions and prototype-inherited properties MUST never be captured.
  Extraction MUST read the raw error at event construction time (before the
  event enters the processing pipeline), producing only plain structured data;
  the existing rule that the attribute sanitizer does not recurse into Error
  instances encountered inside attributes is unchanged, and the documented
  sanitization contract
  (`specs/001-structured-logging-core/contracts/sanitization.md`) receives a
  targeted, versioned amendment describing the new error-payload coverage.
- **FR-006**: System MUST preserve browser runtime safety and failure resilience
  for all new behavior: any throw during extraction (hostile getters, cyclic
  structures, exotic objects) MUST be contained, MUST NOT drop the event (the
  event is delivered with whatever error data was safely extracted, at minimum
  today's name/message), and MUST be reported through the existing internal
  error notification channel.
- **FR-007**: System MUST keep consumer-visible behavior framework-neutral and
  implementation details hidden behind the package interface.
- **FR-008**: All structured error data introduced by this feature MUST flow
  through the sanitize → URL-scrub → redact pipeline before any transport
  observes the event, with redaction failing closed; no raw error object may
  ever be passed to a transport. Because these stages today cover only the
  error payload's flat name/message/stack fields, the system MUST extend the
  sanitize and redact stages to traverse every nested field of the new
  structured error data (chain entries, aggregate members, extra fields) with
  the same string-bounding and redaction guarantees applied to event
  attributes.
- **FR-009**: System MUST be secure by default: with the feature disabled (the
  default), emitted events MUST be indistinguishable from today's output; when
  enabled, defaults MUST NOT expose secrets, credentials, tokens, session
  identifiers, authorization headers, cookies, or unnecessary personal data
  beyond what the existing redaction rules permit.
- **FR-010**: System MUST preserve log integrity and monitoring suitability:
  events remain structured, machine-parseable, and origin-attributable, and all
  truncation behavior introduced by this feature is explicit in the payload.
- **FR-011**: System MUST keep `Logger` instance creation lightweight and
  side-effect-free; deep error serialization adds no per-instance timers,
  listeners, global patches, network work, or ambient browser reads, and its
  configuration is owned at the configured-runtime level by the host.
  Duplicate-package-copy behavior remains isolated, as documented today.
- **FR-012**: System MUST pair every quality gate this feature documents
  (bounded-output invariants, fail-safe delivery, redaction guarantees,
  off-by-default unchanged-shape behavior, bundle-size budgets) with a
  machine-executable enforcement mechanism (test, CI job, lint rule, or
  publish-time hook) that fails closed, with identical outcomes in CI and local
  runs. Test code is held to the same typing/lint/build standards as source.
- **FR-013**: Nested error nodes (cause-chain entries and aggregate members)
  MUST NOT capture their own stack text; only the top-level error's stack is
  captured, with handling unchanged from today. This keeps payload growth
  linear and modest.
- **FR-014**: When deep error serialization is enabled, the feature-016
  breadcrumb cause-chain attribute (`safesignal.errorCauses`) is never
  populated — regardless of whether a chain was captured — so the same chain
  is never serialized twice in one event and there is no ordering race between
  the two capture paths. When deep error serialization is disabled,
  feature-016 behavior is completely unchanged.

### Key Entities

- **Serialized Error Node**: The structured representation of one error: name,
  message, optionally stack (top-level only, as today), optionally a flat,
  ordered cause-chain array (outermost cause first — linear chains are never
  nested), optionally aggregate member nodes (which recurse: each member is
  itself a node with its own flat chain and possible members), optionally
  extra captured fields, and truncation indicators. All nodes count against
  one overall node budget (clarified 2026-06-10).
- **Serialization Limits**: The bounds governing capture, each with a safe
  default and a clamped configurable range, following the same clamp-and-notify
  behavior as existing event limits. Intended values (exact numbers confirmed
  at plan time):
  - Cause-chain depth: default 8, clamped to [1, 16] (matches feature 016's
    existing depth cap).
  - Aggregate member count per node: default 10, clamped to [1, 100].
  - Extra fields per node: default 16, clamped to [0, 64].
  - Overall node budget per event (all chains and members combined): default
    50, clamped to [1, 256].
  - Value depth and string length: reuse the existing event sanitizer limits
    (no new knobs).
- **Truncation Indicator**: Machine-readable evidence on the payload that a
  chain, member list, or field set was clipped, including enough information
  (e.g., original count) for honest downstream interpretation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For an error wrapping two nested causes, the emitted event exposes
  100% of the chain (3 of 3 links) with correct names, messages, and order —
  verified by automated contract tests.
- **SC-002**: For an `AggregateError` of N members within the configured limit,
  the emitted event exposes all N members; for N above the limit, the event
  exposes exactly the limit and reports the original count.
- **SC-003**: Under fault injection (throwing getters, cyclic chains, exotic
  objects), 100% of log calls still deliver an event containing at least the
  error's name and message; zero exceptions propagate to the host application
  (verified by fault-injection unit tests).
- **SC-004**: Zero secret leakage: security tests confirm that values matching
  the configured redaction rules never appear in any transport-visible error
  field introduced by this feature.
- **SC-005**: With the feature disabled (the default), the event's error
  payload contains exactly the existing fields (name, message, optional stack)
  and no additional fields, and no new attributes appear — verified by
  contract tests against the locked error-payload shape.
- **SC-006**: Serialization of pathological inputs (1,000-link chains,
  1,000-member aggregates, megabyte field values) produces payloads clipped to
  the documented Serialization Limits (see Key Entities) — a size bound, not a
  wall-clock assertion — verified by automated tests using the default limits.
- **SC-007**: Documentation and examples accurately describe enabling the
  feature, its bounds, and its privacy behavior for both host-app and federated
  module integration paths, and never demonstrate unsafe patterns (raw object
  dumping, disabling redaction). Verified by review checklist at
  implementation time (not machine-enforced); per Constitution X, the tasks
  phase MUST file a named documentation-review task for this gate, completed
  before the feature's release.

## Assumptions

- **Opt-in default (decided)**: Deep error serialization is disabled by default
  and enabled via logger/runtime configuration, consistent with how the package
  introduced breadcrumb capture and stack normalization (features 016 and 017).
  This preserves unchanged default output and respects the bundle-size and
  privacy posture.
- **Placement of structured data (decided)**: The new structured data lives
  with the event's error payload (extending the existing error shape
  additively) rather than in namespaced attributes, since it is intrinsic to
  the error. This requires extending the sanitize and redact pipeline stages to
  the new nested fields (FR-008) — a deliberate, in-scope consequence of this
  placement. Exact field names are chosen at design time (see Standards
  Alignment).
- **Feature 016 reconciliation (decided)**: Breadcrumb-based cause capture
  (`safesignal.errorCauses`) remains available and unchanged when this feature
  is disabled. When this feature is enabled, it owns cause-chain serialization
  and the 016 attribute is not additionally populated (FR-014); no contract is
  deprecated or removed by this feature.
- **Extra-field capture policy (decided)**: Own enumerable properties are
  captured value-filtered (JSON-safe primitives, plain objects/arrays) rather
  than via an explicit per-field allowlist; the existing redaction rules remain
  the privacy control. No allowlist mechanism ships in this feature.
- **No new entry point**: The capability ships inside the existing default entry
  and existing configuration surface; no new `exports` subpath is required.
