# Feature Specification: Core Structured Logging API

**Feature Branch**: `001-structured-logging-core`

**Created**: 2026-05-26

**Status**: Draft

**Input**: User description: "Create the core structured logging API and transport
abstraction for a reusable frontend logging package."

## Summary

Define the foundational package capability that frontend application code will use to
emit structured logs through a stable, browser-safe API. The feature establishes the
core event contract, level behavior, contextual metadata model, transport boundary,
failure-safety expectations, and secure logging safeguards needed for reuse across
single-app and host/module-based frontend architectures. Safe handling of sensitive
data is part of the package contract: consumers must be guided toward structured,
reviewable log events that minimize accidental exposure of secrets, session
identifiers, query-string secrets, and unnecessary personal or confidential data.

## Problem Statement

Browser application teams need a reusable, package-owned logging foundation that 
provides a stable frontend logging contract. Without one, teams may couple logging 
call sites directly to vendor SDKs, app-specific ingestion paths, or unstable internal 
implementation details, making reuse, testing, and future observability changes harder. 
They may also accidentally expose sensitive data by logging raw objects, 
uncontrolled metadata, or unsafe context because secure logging behavior is not consistently
enforced where logs are created.

## Goals

- Provide a stable public logging API that application code can adopt directly.
- Support structured log events with consistent levels and contextual metadata.
- Establish production-oriented level behavior with safe defaults.
- Make secure logging behavior and sensitive-data minimization part of the expected
  package outcome rather than an optional enhancement.
- Separate log creation from log delivery through a transport abstraction.
- Support reuse across multiple web applications, including federated host/module
  environments.
- Scale to many lightweight Logger instances per page — one Logger per
  independently deployed module is normal — without multiplying backend, transport,
  queue, timer, listener, or network work. Logger creation MUST stay cheap and
  side-effect-free; all expensive runtime resources are shared at the
  package/runtime boundary.
- Preserve a future path to application-owned ingestion and later observability
  integrations without forcing consumer call-site changes.
- Ensure logging failures never break normal application behavior.
- Guide consumers toward safe logging patterns through the package contract and its
  documentation.

## Non-Goals

- Implement vendor-specific observability or backend integrations.
- Define a concrete backend framework or ingestion service design.
- Introduce application-specific business logging semantics or message catalogs.
- Solve full observability platform architecture in this feature.
- Assume a single frontend framework, bundler, or deployment topology.
- Shift responsibility for safe logging entirely onto downstream applications without
  package-level protections or guidance.

## Clarifications

### Session 2026-05-27

- Q: When a federated module calls `configureLogging()` before the host application has, what's the documented behavior? → A: Module's call installs the active runtime; the host's later call atomically replaces it (first-call-installs, last-call-replaces). The package does NOT distinguish "host" from "module" at runtime — whichever `configureLogging()` call lands last is the active runtime. Federated modules calling `configureLogging()` remain a documented (non-default) override per FR-032 and the package emits no warning because the call is explicit; host/module ownership is a *recommended convention*, not a runtime-enforced rule.
- Q: When `configureLogging()` is called a second (or Nth) time, what happens to the prior config? → A: Full replace via atomic swap. A new `ConfiguredRuntime` is constructed from the new config, the active-runtime slot is swapped atomically, then `flush()`+`shutdown()` are invoked on the prior runtime's wrapped transports (each isolated in try/catch). No partial-merge, no reject-after-first, no opt-in flag. Retained `Logger` references automatically operate against the new runtime (FR-031 / SC-012).
- Resolution (no Q&A needed; already locked by plan.md): OpenTelemetry default-vs-optional → **vendor-neutral core**: v1 ships with NO observability-vendor SDK in `dependencies`. OpenTelemetry, Datadog, Sentry and other vendors are reframed as future optional transport adapters, peers of each other. The core dispatcher fans events out directly to transports; no `TelemetryBackend.handle()` is on the default path (see plan.md "Vendor-Neutral Core Architecture", commit c4c5aad).
- Resolution (no Q&A needed; already locked by plan.md): FR-033 duplicate-package-copy classification → **isolated**. Each physical copy of the package on a page owns an independent `ConfiguredRuntime`; the package uses module-scoped state (no `globalThis`, no `Symbol.for` registry). For cross-copy sharing, consumers configure their bundler's module-federation `shared` map to mark this package as a singleton (see plan.md "Runtime Scale Architecture > Duplicate package-copy behavior", commit 2f31680).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Emit Structured Application Logs (Priority: P1)

As an application developer, I need a stable package API for emitting structured
frontend logs so application code can record important events without depending on
package internals or backend-specific SDKs.

**Why this priority**: This is the core consumer value. Without a stable emission API,
the package cannot be adopted by application teams.

**Independent Test**: A consumer can configure the package, emit logs at each
supported level with structured fields, and confirm the resulting records preserve the
documented contract without using internal APIs.

**Acceptance Scenarios**:

1. **Given** an application using the package public API, **When** the developer emits
   a structured log with a level, message, and metadata, **Then** the package accepts
   the event through the documented public contract.
2. **Given** an application using the package public API, **When** the developer emits
   `debug`, `info`, `warn`, and `error` logs, **Then** each event is classified using
   the documented level model.
3. **Given** an application developer preparing log data, **When** the developer adds
   contextual fields, **Then** the package contract keeps intended structured fields
   separate from untrusted, unknown, or excessive contextual input.

---

### User Story 2 - Configure Safe Delivery Behavior (Priority: P2)

As an application integrator, I need log delivery to be separated from log creation
so applications can choose how logs are delivered without changing their logging call
sites.

**Why this priority**: Transport independence is required for reuse across multiple
applications and for future evolution beyond early adoption ingestion paths.

**Independent Test**: A consumer can attach, replace, or remove a delivery mechanism
while keeping the same application logging calls and preserving documented behavior.

**Acceptance Scenarios**:

1. **Given** a configured application, **When** the delivery mechanism changes,
   **Then** application logging call sites remain unchanged.
2. **Given** an application with no working delivery mechanism, **When** logs are
   emitted, **Then** the package degrades safely without disrupting user-facing
   behavior.
3. **Given** unexpected input or a failure during filtering, redaction, formatting,
   or delivery, **When** a log event is processed, **Then** the package fails safely
   without breaking rendering, navigation, or core interactions.

---

### User Story 3 - Protect Sensitive Data in Log Events (Priority: P3)

As an application or platform developer, I need the package to guide and enforce safe
handling of log data so common secrets, identifiers, and unnecessary personal data
are less likely to be emitted or transported accidentally.

**Why this priority**: Reusability is not sufficient if the package makes unsafe
logging patterns easy or normal. Sensitive-data exposure is a first-class failure
mode for this feature.

**Independent Test**: A consumer can emit events containing sensitive-looking fields,
unknown objects, or oversized context and verify the package applies documented safe
handling without requiring application code changes at every call site.

**Acceptance Scenarios**:

1. **Given** a log event containing fields that match documented sensitive data
   classes, **When** the event is processed, **Then** the package applies its
   documented protective behavior before emission or delivery.
2. **Given** a consumer passes arbitrary objects or unexpectedly large contextual
   data, **When** the package processes the event, **Then** it preserves structured
   event boundaries and applies documented safe handling rather than encouraging raw
   object dumping.

---

### User Story 4 - Distinguish Context Across Host and Module Boundaries (Priority: P4)

As a platform or module owner, I need log records to carry origin and context details
so logs from host applications and independently deployed modules can be understood
consistently.

**Why this priority**: Shared package adoption in federated environments requires
clear origin tracking without app-specific forks of the logging contract.

**Independent Test**: A host app and a frontend module can emit logs through the same
package API and produce records that remain distinguishable by origin and shared
context.

**Acceptance Scenarios**:

1. **Given** a host application and a frontend module using the same package,
   **When** both emit logs, **Then** the resulting records include sufficient context
   to distinguish event origin.
2. **Given** contextual metadata such as application identity, module identity, or
   correlation values, **When** logs are emitted, **Then** the package attaches that
   context according to the documented contract.

---

### User Story 5 - Scale to Many Lightweight Logger Instances (Priority: P5)

As a platform engineer responsible for a federated browser application, I need the
package to support many Logger instances per page (one per module is normal)
without each Logger creating its own backend, transport, queue, timer, listener,
or network sender, so adding modules to a page does not compound observability
runtime weight or duplicate delivery infrastructure.

**Why this priority**: Federated micro-frontend pages can easily host dozens to
hundreds of Loggers created at module boot time. If Logger construction had
non-trivial cost or initialized infrastructure, every additional module would
double-initialize observability and fight the host for global state.

**Independent Test**: A consumer creates many Logger instances (host + every
federated module) against a single configured runtime and confirms that backend
and transport initialization happens once per configured runtime, not once per
Logger, while every Logger still produces correctly attributed events through the
shared delivery path.

**Acceptance Scenarios**:

1. **Given** a configured package runtime, **When** application or module code
   creates many Logger instances (host root logger, per-module loggers, derived
   `child()` / `withContext()` loggers), **Then** Logger creation completes
   cheaply and does NOT initialize any additional telemetry backend, transport,
   queue, batching loop, retry loop, timer, interval, global event listener,
   console patch, document/window observer, or network sender per instance.
2. **Given** a host application that has already configured the package runtime,
   **When** a federated module loads and creates Loggers, **Then** the module's
   Loggers share the host's active configured runtime (single backend, single
   transport set, single redactor) within the same package/runtime boundary
   unless the documented contract explicitly permits a separate runtime.
3. **Given** existing Logger references held by application or module code,
   **When** logging is reconfigured at runtime, **Then** those existing Logger
   references continue to operate against the newly active configured runtime
   according to the documented re-configuration contract — without consumers
   needing to re-acquire Logger references.
4. **Given** host and module Loggers sharing one configured runtime, **When**
   each emits logs, **Then** the resulting events remain origin-distinguishable
   by their attached application and module identity context even though only
   one delivery pipeline exists.

---

### Edge Cases

- What happens when a log event omits optional metadata but still includes the minimum
  required fields?
- How does the package behave when a configured delivery mechanism fails at runtime,
  rejects events, or becomes unavailable after initialization?
- What happens when no delivery mechanism is configured and application code still
  emits logs?
- How does the package handle sensitive values in metadata that should be removed,
  masked, or rejected before delivery?
- What happens when contextual input includes tokens, session identifiers,
  query-string secrets, personal data, or other confidential fields nested inside
  structured metadata?
- What happens when consumers pass full application state, browser event objects, or
  oversized unknown objects as log context?
- What happens when protective handling itself encounters malformed, cyclic,
  unsupported, or unexpectedly large input?
- What happens when host and module contexts provide overlapping or conflicting origin
  values?
- What happens when a federated module calls `configureLogging` after the host
  application has already configured logging — does the module's call replace
  the host's runtime, get rejected, layer on top, or operate within a separate
  package/runtime boundary?
- What happens when module bundlers cause multiple physical copies of the SDK
  to load on the same page — are the copies isolated (each independently
  configured), shared (cooperating via a documented shared runtime), or
  explicitly unsupported?
- What happens when a single module creates many derived Loggers (`child()` /
  `withContext()`) — does each derivation stay constant-cost and share the
  active configured runtime, or does it incur per-instance work?
- What happens when application or module code creates a Logger BEFORE
  `configureLogging` runs and then uses that Logger AFTER `configureLogging`
  runs — does the early-created Logger automatically pick up the new active
  runtime, continue with the pre-config safe defaults, or fail in some other
  documented way?

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: A public logger API, structured event contract, level model,
  contextual metadata contract, and delivery abstraction are introduced as documented
  package interfaces.
- **Compatibility Impact**: Additive. This is a new package capability intended to
  establish the baseline consumer contract.
- **Migration Notes**: No migration is required for existing consumers because the
  package capability does not yet exist.
- **Host/Module Usage Impact**: Both standard single-app consumers and federated
  host/module consumers use the same public contract, with origin metadata supporting
  environment-specific context.
- **Security & Privacy Considerations**: The contract must support safe handling of
  secrets, credentials, tokens, session identifiers, query-string secrets, and
  unnecessary personal or confidential data. Consumers must not be required or
  encouraged to expose such values in order to use the package, and production-safe
  behavior must reduce accidental sensitive-data exposure risk.
- **Log Integrity Considerations**: The contract must preserve structured event
  boundaries between intended fields and untrusted or oversized contextual data so
  downstream review and monitoring remain machine-parseable, origin-attributable, and
  suitable for security-conscious use.
- **Runtime Scale & Federated Deployment Impact**: Logger creation is a
  consumer-facing operation expected to occur many times per page (one Logger
  per federated module is normal). The contract treats Logger construction as
  cheap and side-effect-free, with all expensive runtime resources — telemetry
  backend, transports, redactor, sanitizer state, internal error reporter —
  shared at the configured runtime/package boundary. Host applications own the
  configured runtime by default; federated modules MUST NOT silently replace it.
  The behavior when multiple physical copies of the SDK load on a single page
  MUST be documented as one of: isolated, shared, or explicitly unsupported.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The package MUST provide a documented public logging API suitable for
  direct use by frontend application code.
- **FR-002**: The package MUST accept structured log events with fields beyond a plain
  message string.
- **FR-003**: The package MUST support the log levels `debug`, `info`, `warn`, and
  `error`.
- **FR-004**: The package MUST define environment-aware level behavior with
  production-safe defaults where `warn` and `error` are enabled as the baseline
  production levels.
- **FR-005**: The package MUST allow lower-severity logging behavior to be configured
  without changing application logging call sites.
- **FR-006**: The package MUST provide a delivery abstraction that separates frontend
  log creation from log delivery behavior.
- **FR-007**: The package MUST support attaching contextual metadata to log events,
  including application identity, environment, and correlation metadata when
  available.
- **FR-008**: The package MUST support identifying the origin of log events across
  host applications and independently deployed frontend modules.
- **FR-009**: The package MUST avoid exposing vendor-specific or delivery-specific
  implementation details in the public interface.
- **FR-010**: The package MUST preserve browser runtime safety and MUST NOT interrupt
  rendering, navigation, state updates, or normal user interactions when logging is
  used.
- **FR-011**: The package MUST degrade safely when delivery mechanisms are missing,
  misconfigured, unavailable, or fail at runtime.
- **FR-012**: The package MUST treat accidental exposure of sensitive data through log
  messages, metadata, context objects, or serialization behavior as a first-class
  failure mode.
- **FR-013**: The package MUST NOT require or encourage consumers to log secrets,
  credentials, access tokens, refresh tokens, session identifiers, authorization
  values, query-string secrets, or unnecessary personal or confidential data.
- **FR-014**: The package MUST support safe handling of sensitive values before
  emission or delivery through filtering, redaction, omission, or equivalent
  protective behavior defined by the package contract.
- **FR-015**: The package MUST minimize the risk of accidental sensitive-data leakage
  when consumers supply structured metadata, derived context, or serializable input.
- **FR-016**: The package MUST prefer structured log events suitable for downstream
  review and MUST NOT make uncontrolled dumping of arbitrary objects or full
  application state part of the expected consumer path.
- **FR-017**: The package MUST preserve safe event boundaries between intended log
  fields and untrusted, unknown, or oversized contextual data.
- **FR-018**: The package MUST define conservative, documented safe handling for
  unknown, nested, malformed, cyclic, or unexpectedly large input passed into log
  events or context.
- **FR-019**: The package MUST fail safely if filtering, redaction, formatting, or
  delivery encounters unexpected input or runtime errors.
- **FR-020**: The package MUST ensure that failures in filtering, redaction,
  formatting, or delivery do not break application rendering, navigation, state
  updates, or core user interactions.
- **FR-021**: The package MUST preserve production-safe defaults that reduce
  accidental sensitive-data exposure risk while keeping `warn` and `error` as the
  baseline active production levels.
- **FR-022**: The package MUST support reuse across multiple web projects and
  frontend architectures while preserving a security-conscious logging contract that
  downstream applications and platform teams can rely on.
- **FR-023**: The package MUST support downstream application or platform security
  needs without hard-coding a single backend vendor or ingestion implementation.
- **FR-024**: The package MUST provide documentation and examples that demonstrate
  safe logging usage patterns, including how to supply structured context without
  exposing unnecessary sensitive data.
- **FR-025**: The package MUST guide consumers toward the safe path by default
  through its documented contract, default behavior, and examples.
- **FR-026**: The package MUST preserve a path for future delivery mechanisms and
  observability integrations without requiring widespread changes to consuming
  application logging call sites.
- **FR-027**: The package MUST remain usable across multiple web projects and frontend
  architectures without assuming a single framework, bundler, or deployment model.
- **FR-028**: The package MUST preserve clear boundaries between package
  responsibilities and application- or platform-owned ingestion responsibilities.
- **FR-029**: The package MUST keep Logger creation cheap and side-effect-free.
  Creating a Logger — including the root Logger, per-module Loggers, and derived
  Loggers from `child()` / `withContext()` — MUST NOT initialize a telemetry
  backend, vendor SDK, transport, queue, batching loop, retry loop, timer,
  interval, scheduled callback, global event listener, console patch (e.g.,
  patching `console.*`, `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`,
  `window.onerror`, `window.onunhandledrejection`), document or window observer,
  or perform any network work. Logger creation MUST also NOT read ambient
  browser state (location, cookies, storage, navigator, environment variables).
- **FR-030**: Logger instances MUST share the active configured runtime
  (telemetry backend, transports, redactor, sanitizer state, internal error
  reporter) within the same package/runtime boundary. Expensive runtime
  resources MUST be configured once per package/runtime boundary and reused
  across every Logger derived from that runtime, so per-Logger cost does not
  scale with the number of instances.
- **FR-031**: Reconfiguring logging at runtime MUST have documented behavior
  for existing Logger references. **Documented behavior (clarified
  2026-05-27)**: `configureLogging()` is **full-replace via atomic swap**.
  A new configured runtime is constructed from the supplied config; the
  active-runtime slot is swapped atomically; then `flush()` and `shutdown()`
  are invoked on each previously-wrapped transport (each call isolated in
  try/catch). There is no partial-merge of prior config, no reject-after-
  first, and no opt-in `reconfigure: true` flag. Already-held `Logger`
  references continue to operate against the newly active runtime without
  re-acquisition (locked by SC-012).
- **FR-032**: Host and federated-module configuration ownership MUST be
  explicit. The host application owns the configured runtime by *recommended
  convention*; federated modules MUST NOT silently replace, override, or
  re-initialize the configured runtime as a side effect of normal module
  loading (no module-load side effects on the active runtime). Any
  module-initiated configuration MUST go through the same single named API
  (`configureLogging()`) that the host uses. **Documented behavior
  (clarified 2026-05-27)**: the package does NOT distinguish "host" from
  "module" at runtime. Whichever `configureLogging()` call lands last is
  the active runtime (first-call-installs, last-call-replaces). When a
  federated module's `configureLogging()` call lands before the host's,
  the module's call installs the active runtime; the host's later call
  atomically replaces it per FR-031. No package-emitted warning fires
  because the call is always explicit; host/module ownership is a
  *convention* documented for consumers, not a runtime-enforced rule.
- **FR-033**: Duplicate package-copy behavior in federated deployments MUST be
  documented. When module bundlers cause multiple physical copies of this
  package to load on a single page, the resulting behavior MUST be classified
  as exactly one of: (a) **isolated** — each copy is independently configured
  and its Loggers cannot cross-affect another copy's runtime; (b) **shared** —
  copies cooperate through a documented shared-runtime contract; or
  (c) **explicitly unsupported** — with diagnostic guidance for consumers.
  Silent reliance on copy-local globals or undocumented cross-copy coupling is
  prohibited.

### Key Entities *(include if feature involves data)*

- **Logger API**: The consumer-facing package contract used by application code to
  emit logs and apply documented logging behavior.
- **Structured Log Event**: A log record containing a level, message, timestamp or
  event occurrence information, and contextual metadata defined by the package
  contract.
- **Context Metadata**: Application, module, environment, and correlation attributes
  associated with a log event to identify origin and execution context.
- **Sensitive Data Class**: A category of values that require protective handling in
  logs, including secrets, credentials, tokens, session identifiers, query-string
  secrets, and unnecessary personal or confidential data.
- **Delivery Mechanism**: The abstract path responsible for accepting package log
  events for downstream handling without changing application call sites.
- **Protective Handling Rules**: The package-defined protections that remove, mask,
  omit, limit, or otherwise safely handle sensitive, unknown, or oversized values
  before emission or delivery.
- **Configured Runtime**: The shared, package-level runtime state established by
  `configureLogging` — telemetry backend, transports, redactor, sanitizer
  limits, internal error reporter — that every Logger instance within the same
  package/runtime boundary uses for delivery. Logger instances are cheap
  handles over this shared runtime; they neither own it nor duplicate it.
- **Package/Runtime Boundary**: The scope within which a Configured Runtime is
  authoritative. Normally the boundary corresponds to one physical copy of the
  package on a page; federated deployments with multiple copies define the
  boundary through the documented duplicate-package-copy classification
  (isolated, shared, or explicitly unsupported).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consumer can emit `debug`, `info`, `warn`, and `error` logs through a
  single documented package contract without referencing undocumented package
  interfaces or delivery-specific APIs.
- **SC-002**: Each emitted log record preserves a documented severity level, message,
  and any supplied contextual metadata in a consistent structured format.
- **SC-003**: The same documented consumer contract can be used by both a single-app
  frontend and a federated host/module frontend without introducing separate
  application-facing APIs.
- **SC-004**: A consumer can change, add, or remove a delivery path without modifying
  existing application logging call sites.
- **SC-005**: In production-mode usage, `warn` and `error` remain the baseline active
  levels while lower-severity behavior can be adjusted independently.
- **SC-006**: When delivery is unavailable or fails at runtime, log emission does not
  block or break normal application rendering, navigation, or core user interactions.
- **SC-007**: Logs emitted by host applications and independently deployed frontend
  modules remain distinguishable by documented origin and context fields.
- **SC-008**: Events containing documented sensitive data classes are handled
  according to the package's protective contract before emission or delivery in 100%
  of acceptance-test scenarios covering direct fields, nested metadata, and derived
  context input.
- **SC-009**: Consumers can follow package documentation to emit structured logs with
  contextual data without relying on raw object dumping or undocumented protective
  behavior.
- **SC-010**: Under the package's default production configuration — with no
  consumer-supplied level overrides and no consumer-supplied redaction overrides —
  automated contract or security validation confirms all of the following:
  (a) `debug` and `info` events are not delivered to any configured transport unless
  explicitly enabled; (b) `warn` and `error` events are delivered to every configured
  transport; and (c) when input events carry raw secrets, credentials, access or
  refresh tokens, session identifiers, authorization values, cookies, or URL
  query/fragment secrets, none of those raw values are present in the event payload
  delivered to any transport.
- **SC-011**: An automated test creates at least 1,000 Logger instances against
  a single configured runtime (root Logger plus per-module and derived
  `child()` / `withContext()` Loggers) and confirms that backend, transport,
  queue, batching, timer, and listener initialization happens at most once per
  configured runtime — not per Logger — and that creating the 1,000 Loggers
  produces no per-instance unbounded memory growth, no per-instance network
  work, and no per-instance global state mutation.
- **SC-012**: When logging is reconfigured at runtime, Logger references held
  by application or module code before the reconfiguration continue to
  function and use the documented active runtime afterward, according to the
  package's documented re-configuration contract — verified by an automated
  test that retains a Logger reference across `configureLogging` and asserts
  events emitted afterward are delivered through the new runtime's transports.
- **SC-013**: Logs emitted by a host application Logger and by a federated
  module's Logger sharing the same configured runtime remain origin-
  distinguishable in 100% of acceptance-test scenarios through their attached
  application-identity and module-identity context, without each module
  creating its own backend, transport, or delivery pipeline.

## Risks & Open Questions

- Define which event fields are mandatory in the core contract versus optional
  contextual metadata so the package stays minimal without becoming ambiguous.
- Decide which sensitive-field classes require built-in protection versus consumer
  configuration.
- Determine how much arbitrary context the public API should accept before applying
  protective limits or rejection behavior.
- Define what conservative defaults should apply when consumers pass large, unknown,
  or deeply nested objects.
- Clarify what guarantees the package makes about filtering and redaction behavior
  versus what remains the responsibility of consuming applications.
- Confirm the default behavior when no delivery mechanism is configured so consumer
  expectations are explicit before planning.
- Clarify the minimum origin and context guarantees required for federated
  host/module environments compared with ordinary single-app environments.
- **OpenTelemetry default-vs-optional decision (RESOLVED 2026-05-27, see
  Clarifications)**: v1 ships **vendor-neutral**. The core package has no
  observability-vendor runtime dependencies; the dispatcher fans events out
  directly to transports. OpenTelemetry, Datadog, Sentry, and other vendors
  are reframed as future optional transport adapters (peers of each other,
  none privileged). The existing OTel adapter code under
  `src/internal/telemetry/otel/**` is retained as a documented future-adapter
  seam but is not on the v1 default path. Locked by plan.md "Vendor-Neutral
  Core Architecture" (commit c4c5aad) and tasks.md T066 (dispatcher direct-
  fan-out refactor) + T070 (vendor-free audit).
- **Configuration ownership when host has not yet configured (RESOLVED
  2026-05-27, see Clarifications)**: first-call-installs, last-call-replaces.
  The package does not distinguish "host" from "module" at runtime; whichever
  `configureLogging()` call lands last is the active runtime. Host/module
  ownership is a *recommended convention*, not a runtime-enforced rule. See
  FR-031 / FR-032 for the documented semantics.
- **Duplicate-package-copy classification choice (RESOLVED 2026-05-27, see
  Clarifications)**: **isolated**. Each physical copy of the package on a
  page owns an independent `ConfiguredRuntime`; the package uses
  module-scoped state and provides no shared global registry. Consumers who
  need cross-copy sharing configure their bundler's module-federation
  `shared` map to mark this package as a singleton. Locked by plan.md
  "Runtime Scale Architecture > Duplicate package-copy behavior" (commit
  2f31680) and tasks.md T064 (duplicate-copy isolation integration test) +
  T065 (consumer documentation).

## Assumptions

- Initial consumers are frontend application and platform developers integrating a
  reusable browser-focused package into existing web applications.
- Application-owned ingestion remains outside this feature and will be addressed by
  future features or downstream application plans.
- The package may be adopted in environments with partial or evolving context data, so
  optional context is allowed as long as the minimum event contract remains stable.
- Safe failure behavior means logging may be dropped, reduced, or otherwise contained
  when delivery is unavailable, but normal application behavior continues.
- The package contract can define protective handling expectations and safe defaults
  without fully replacing application-specific data governance responsibilities.
- The package is consumed by multiple host applications and by independently
  deployed federated modules. A single page is expected to host many Logger
  instances (one per module is the normal case), so Logger creation cost and
  per-Logger side effects are first-class scalability concerns, not micro-
  optimizations.
- "Per package/runtime boundary" generally means one physical copy of the
  package on a page. When module bundlers cause multiple physical copies to
  load, the duplicate-package-copy classification chosen for FR-033 governs
  whether each copy maintains an independent configured runtime or cooperates
  with siblings.
