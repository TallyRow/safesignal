<!--
Sync Impact Report
- Version change: 1.1.0 -> 1.2.0
- Modified principles:
  - None renamed; Principles I–VI preserved verbatim.
- Added sections:
  - VII. Lightweight Logger Instances & Federated Runtime Discipline (new principle)
  - Package Architecture Standards: new clause on shared runtime resources and
    federated host/module ownership of configuration
  - Delivery Workflow & Quality Gates: new clause "Lightweight Logger & Federated
    Runtime Tests" requiring multi-instance and duplicate-package-copy coverage
- Removed sections:
  - None
- Templates requiring updates:
  - ✅ updated .specify/templates/plan-template.md (Constitution Check gains a
       "Lightweight Logger Instances & Federated Runtime" gate covering
       per-instance cost, shared runtime resources, and host/module ownership)
  - ✅ updated .specify/templates/spec-template.md (Consumer Impact adds a
       "Runtime Scale & Federated Deployment Impact" bullet; FR-011 added for
       lightweight `Logger` creation and explicit host/module ownership)
  - ✅ updated .specify/templates/tasks-template.md (Foundational phase gains
       T009b for lightweight-logger and federated-runtime guardrails; Polish
       phase adds an explicit multi-instance / federated validation pass)
- Follow-up TODOs:
  - None deferred. Per-feature decisions on duplicate-package-copy strategy
    (isolated / shared / explicitly unsupported) are intentionally routed to
    feature plans, not the constitution.
-->
# SafeSignal Constitution

## Core Principles

### I. Stable Consumer API & Clear Boundaries
The package MUST expose a minimal, stable, application-friendly public logging API
for browser JavaScript and TypeScript consumers. Consumer code MUST depend only on
documented package contracts and MUST NOT require vendor-specific, transport-specific,
or internal implementation APIs. Breaking consumer call-site changes are prohibited
unless explicitly justified, documented, versioned, and accompanied by a migration
plan. Emitting logs, transporting logs, and ingesting or storing logs are separate
concerns and MUST remain isolated behind clear interfaces. The public API MUST make
the safe path the easy path: defaults, examples, and ergonomic call signatures MUST
favor safe, structured, minimal logging, and unsafe usage MUST require deliberate
opt-in.

Rationale: The package exists to be reused across host applications and independently
deployed frontend modules without forcing consumer rewrites when implementation
details evolve, and without making it easy to log unsafely by accident.

### II. Browser-First Runtime Resilience
The package MUST be designed primarily for browser execution and MUST remain safe in
modern frontend runtimes, including host applications and federated or modular
frontend architectures. Logging MUST NEVER break rendering, navigation, state
updates, or normal user interactions. Failures in transports, ingestion endpoints,
optional integrations, redaction, formatting, serialization, or any other internal
pipeline stage MUST degrade safely with bounded behavior and no consumer-visible
crashes. No code path inside the package may propagate a thrown error or rejected
Promise into a consumer logging call site. Where secure handling mechanisms (such as
redaction) encounter unexpected input, the package MUST fail closed (drop or sanitize
the affected event) rather than emit unredacted data.

Rationale: Observability is subordinate to application availability and data safety.
A logging SDK that can destabilize frontend execution or leak sensitive data when
something goes wrong is unacceptable.

### III. Framework-Neutral Structured Observability
The package MUST remain neutral to frameworks, applications, backends, and deployment
models. It MUST emit structured log events and MUST NOT encourage or default to
unstructured string-only logging, raw object dumping, or uncontrolled serialization
of arbitrary application state. The package MUST support the standard levels
`debug`, `info`, `warn`, and `error`. Production-safe defaults are mandatory: `warn`
and `error` are the baseline enabled production levels, while lower levels MUST be
explicitly configurable by environment. Log records MUST support contextual metadata
such as application identity, module identity, environment, and correlation data
when available. Transport and backend evolution MUST be possible without widespread
consumer call-site changes, and application-owned ingestion MUST remain a
first-class supported model. Transported event payloads MUST be suitable for secure
parsing and monitoring consumption, with documented field shapes, bounded depth, and
bounded size.

Rationale: Structured, portable, predictable events preserve observability value now
while keeping the package adaptable to future ingestion and observability backends,
and prevent the runtime hazards of arbitrary object serialization in the browser.

### IV. Secure & Privacy-Safe Logging by Default
Secure logging and sensitive-data minimization are first-class, non-negotiable
package responsibilities, on equal footing with API stability and browser
resilience. Frontend log data MUST be treated as potentially sensitive at every
layer.

The package MUST:
- Ship secure defaults. Default configuration MUST NOT expose secrets, credentials,
  tokens, session identifiers, authorization headers, cookies, or other commonly
  sensitive values, and MUST NOT enable behavior whose primary risk is accidental
  exposure of such data.
- Minimize sensitive data. The package MUST NOT log secrets, credentials, tokens,
  session identifiers, or unnecessary personal or confidential data by default,
  whether they appear in messages, attributes, context, or serialized error objects.
- Provide redaction, omission, or equivalent safe-handling mechanisms for sensitive
  values, applied uniformly to attributes, context, and serialized error data
  before any transport receives an event.
- Treat redaction as fail-closed. If redaction or safe-handling cannot complete for
  any reason, the affected event MUST be dropped or sanitized rather than emitted.
- Avoid encouraging unsafe patterns. Public APIs MUST NOT accept raw "dump
  everything" inputs as their easy path; sample code, defaults, and documentation
  MUST model minimal, intentional logging.
- Apply the same security posture across every consuming application. Security
  behavior is part of the reusable package contract, not a per-app integration
  exercise.

The package MUST NOT silently downgrade security guarantees based on environment,
build mode, transport choice, or vendor integration.

Rationale: Frontend code operates close to user, session, and browser data, and is
visible to user-controlled environments. Privacy and security are baseline package
responsibilities that consumers cannot reliably bolt on after the fact; the package
must make accidental leakage actively difficult.

### V. Testable, Minimal, Maintainable Package Design
The package MUST favor a small, clear public surface area, deliberate dependency
selection, and internals that remain understandable to future contributors. Strong
automated coverage is required for public API contracts, runtime behavior, failure
safety, metadata handling, redaction behavior, environment-sensitive configuration,
and the secure-defaults posture defined in Principle IV. Documentation, examples,
and integration guidance MUST be kept aligned with actual package behavior and MUST
model safe logging behavior; they MUST NOT normalize insecure logging patterns
(secret dumping, raw object dumping, disabling redaction in examples, etc.). Unsafe
patterns, where they must be discussed at all, MUST be marked as exceptional and
accompanied by mitigation guidance. Product-specific business logic, message
catalogs, and application semantics MUST NOT be embedded in the package.

Rationale: Reusable packages succeed through predictable behavior, low maintenance
cost, and high consumer trust in both code and documentation; documentation that
models unsafe behavior is itself a security defect.

### VI. Log Integrity & Monitoring Suitability
Log data emitted by this package may be security-relevant and MUST be suitable for
monitoring, incident review, and forensic use by application or platform owners.
The package MUST preserve clean boundaries so application and platform owners can
attach their own integrity, retention, transport-security, and centralized
monitoring controls without modifying the package.

The package MUST:
- Treat the transport abstraction as the integrity boundary. The package MUST NOT
  perform actions that undermine downstream auditability, such as silently
  reordering, deduplicating, or mutating accepted events after they reach a
  transport.
- Produce events with stable, documented, machine-parseable structure (level,
  timestamp, message, attributes, context, origin identity) so downstream systems
  can index and correlate them safely.
- Preserve origin and context fidelity (application identity, module identity,
  environment, correlation metadata) so events from host applications and
  federated modules remain distinguishable and attributable.
- Avoid embedding application-owned or platform-owned ingestion, storage, or
  integrity mechanisms in the package core; those MUST remain pluggable so
  consumers can apply their own controls.
- Document any behavior that drops, samples, batches, or transforms events before
  delivery, so downstream monitoring and forensics can account for it.

Rationale: Logs are often the primary evidence in incident response and security
review. A reusable package that quietly mutates, loses, or obscures events would
undermine those use cases for every consuming application.

### VII. Lightweight Logger Instances & Federated Runtime Discipline
The package MUST scale to **many `Logger` instances per page** — one per module is
the normal case in federated and host-app deployments. Creating a `Logger` MUST be
lightweight, deterministic, and side-effect-free: a `Logger` is a context handle
over the already-configured shared runtime, never an initializer of the runtime
itself. Per-`Logger` cost MUST NOT scale with the number of instances; the package
MUST stay predictable when a page hosts tens, hundreds, or more loggers.

The package MUST NOT perform any of the following at `Logger`-instance creation,
nor at per-instance lifecycle events:
- Initialize a telemetry backend, vendor SDK, or transport.
- Start a queue, buffer flush loop, batching loop, retry loop, timer, interval,
  scheduled callback, or any other recurring task.
- Attach a global event listener; patch a global (`console`, `fetch`,
  `XMLHttpRequest`, `navigator.sendBeacon`, `window.onerror`,
  `window.onunhandledrejection`, history, etc.); or install any document/window
  observer.
- Read ambient browser state (`location`, `document.cookie`, `localStorage`,
  `sessionStorage`, `navigator.*`, `process.env`, `import.meta.env`).
- Issue a network request, open a socket, or perform any other I/O.
- Allocate unbounded memory, eagerly snapshot application state, or pre-warm
  caches sized by anything other than constant per-instance overhead.

Expensive runtime resources — backend adapters, transports, batchers, correlation
hooks, redactors, sanitizer state — MUST be configured **once at the
runtime/package level** (e.g., via `configureLogging()`) and **shared** across every
`Logger` instance derived from that runtime. Logger derivation (`child()`,
`withContext()`, federated module loggers) MUST stay a constant-cost operation that
layers context over the same shared runtime.

For federated and module-federation deployments, the package MUST also:
- **Make ownership explicit.** The host application owns the configured runtime by
  default. Federated modules MUST NOT accidentally replace, override, or
  re-initialize the host's configured runtime — including transports, redactors,
  backend selection, and sanitizer limits — unless the documented contract
  intentionally permits it, and even then only through an explicitly named API.
- **Document duplicate-package-copy behavior.** When module bundlers cause multiple
  copies of this package to load on a single page, the resulting behavior MUST be
  documented as exactly one of: (a) **isolated** — each copy is independently
  configured and its loggers cannot cross-affect another copy's runtime;
  (b) **shared** — copies cooperate through a documented shared-runtime contract;
  or (c) **explicitly unsupported** — with diagnostic guidance for consumers.
  Silent reliance on copy-local globals or undocumented cross-copy coupling is
  prohibited.
- **Preserve attribution under concurrency.** Events from host and federated module
  loggers MUST remain origin-distinguishable (application identity vs. module
  identity) even when many modules instantiate loggers independently and
  concurrently, and even when those modules race to configure the runtime.

Rationale: A federated micro-frontend page can easily host dozens to hundreds of
`Logger` instances created at module boot time. If logger construction had
non-trivial cost — initializing backends, opening queues, patching globals,
reading ambient state — every additional module would compound runtime weight,
double-initialize observability infrastructure, fight the host for global state,
and surprise consumers with non-deterministic ownership. Treating `Logger` as a
cheap, side-effect-free handle over a shared, explicitly-owned runtime preserves
browser performance, keeps the public contract honest about who owns
configuration, and makes federated deployment a first-class scalability concern
rather than an afterthought.

## Package Architecture Standards

- The package MUST target reusable browser package distribution rather than a single
  application implementation.
- Public types, configuration shapes, and extension points MUST be explicitly
  documented and versioned as package contracts.
- Internal modules MUST hide implementation details and MAY change freely so long as
  published contracts and documented behavior remain intact.
- Optional integrations and transports MUST be additive, MUST NOT impose vendor
  lock-in on the base package, and MUST NOT be permitted to weaken the secure
  defaults defined in Principle IV or the integrity guarantees in Principle VI.
- Sensitive-data handling, redaction, and structured-output guarantees MUST be
  enforced inside the package, before any transport receives an event, so optional
  integrations cannot bypass them.
- The configured runtime (backend, transports, redactor, sanitizer state, internal
  error reporter) is a **package-level shared resource**. `Logger` instances are
  cheap handles that read from this shared runtime; they MUST NOT own, initialize,
  or duplicate it. Logger derivation MUST stay constant-cost (Principle VII).
- Federated host/module configuration ownership MUST be documented as part of the
  package contract. The duplicate-package-copy behavior MUST be classified as
  **isolated**, **shared**, or **explicitly unsupported**, with consumer-visible
  guidance for each (Principle VII).
- Package decisions MUST favor portability, composability, and a uniform security
  posture across consumers over app-specific shortcuts.

## Delivery Workflow & Quality Gates

- Every plan, spec, and task list MUST show how the work preserves API stability,
  browser resilience, framework neutrality, secure-by-default logging, privacy-safe
  data handling, log integrity, lightweight logger creation, federated runtime
  discipline, and package maintainability.
- New or changed public API behavior MUST include contract tests and migration notes
  when consumer-visible behavior changes.
- Runtime failure modes, log level behavior, metadata handling, redaction,
  environment-sensitive configuration, and integrity-relevant transformations
  (drops, batches, samples) MUST be covered by automated tests before work is
  considered complete.
- **Security & Privacy Review**: Any change that touches event content, attribute
  shaping, serialization, redaction, transport delivery, error capture, or default
  configuration MUST include an explicit security-and-privacy check that confirms
  (a) no new path can leak secrets, credentials, tokens, session identifiers, or
  unnecessary personal data, (b) redaction and fail-closed behavior still hold, and
  (c) integrity-relevant behavior is documented. This check MUST be part of the
  plan and verified by tests in the task list.
- **Lightweight Logger & Federated Runtime Tests**: Any change that touches logger
  construction, runtime configuration, backend or transport lifecycle, derived
  loggers (`child()` / `withContext()`), federated module identity, or shared
  runtime state MUST include automated tests proving (a) creating many `Logger`
  instances per page does not incur per-instance backend, transport, timer, or
  global-listener initialization, and does not cause unbounded memory growth;
  (b) federated module loggers do not accidentally replace or re-initialize the
  host's configured runtime; and (c) the duplicate-package-copy behavior matches
  the documented classification (isolated / shared / explicitly unsupported).
- Documentation, examples, and integration guidance for single-app and
  federated/module-based usage MUST be updated when behavior or setup expectations
  change, and MUST continue to model safe logging behavior and document the
  host/module configuration ownership contract.
- Any proposal that adds significant abstraction, dependency weight, vendor
  coupling, or that relaxes a security, integrity, or scalability guarantee MUST
  document why a simpler package-centric and contract-preserving approach is
  insufficient.

## Governance

This constitution is the authoritative standard for package decisions in this
repository and supersedes conflicting local habits, plans, and feature-level
preferences. Amendments MUST be documented in the constitution itself, include the
reason for change, and update any affected templates or guidance artifacts in the
same change set.

Versioning policy for this constitution follows semantic versioning:
- MAJOR for removing or redefining a governing principle in a materially incompatible
  way.
- MINOR for adding a new principle or materially expanding governance requirements.
- PATCH for wording clarifications, typo fixes, or non-semantic refinements.

Compliance review is mandatory for every spec, plan, task list, and implementation
review. Work that violates these principles MUST not be approved without an explicit,
documented exception and a remediation plan. Consumer-facing breaking changes require
documented justification, migration guidance, and versioning aligned with the package
release policy. Exceptions that relax a security, privacy, integrity, or scalability
guarantee require an explicit, named, time-bound remediation plan and MUST be
re-reviewed at each subsequent release.

**Version**: 1.2.0 | **Ratified**: 2026-05-26 | **Last Amended**: 2026-05-27
