<!--
Sync Impact Report (latest)
- Version change: 1.4.0 -> 1.5.0
- Amendment: Principle VIII (Lightweight Logger Instances & Federated Runtime
  Discipline) -- added an "Explicit host-level global install (opt-in)" clause
  distinguishing the banned per-`Logger` global side effect from a single,
  explicit, host-installed, runtime-level global handler (opt-in, one owner;
  modules never install), analogous to configuring a transport. A scope note was
  added to Package Architecture Standards (Logger construction constraints)
  clarifying its bans are per-`Logger`/per-instance and do NOT forbid the
  host-level install. The per-`Logger` prohibitions are unchanged (none removed).
  (Roadmap G1 / issue #12 -- governance prerequisite for V1 global error capture,
  #13.)
- Rationale: the V1 opt-in `./capture` global error capturer (#13) needs one
  explicit host-level install; the prior text + the README's blanket "no global
  listeners" wording read as forbidding it. MINOR per the versioning policy
  (materially expands governance by permitting a new behavior class); not MAJOR
  (no principle removed or redefined incompatibly).
- Templates requiring updates:
  - plan/spec/tasks templates reviewed -- their lightweight-`Logger` language is
    already per-`Logger`/per-instance-scoped and consistent; no edit needed.
- Dependent docs updated in this change set:
  - README.md -- the "What this package does NOT do" entry and the "no global
    listeners" feature bullet reframed to "the core never touches globals; an
    opt-in subpath may, with explicit host ownership (one owner; modules never
    install)."
- Follow-up (Principle X -- named, time-bound): the boundary "only an explicit
  host-level install attaches global handlers; per-`Logger`/module code may not"
  is mechanically enforced by #13 (V1). The enforcing test MUST land in the same
  change set that adds the `./capture` subpath -- no release may ship `./capture`
  without it -- deadline 2026-09-01.

----- prior amendment -----
Sync Impact Report
- Version change: 1.3.0 -> 1.4.0
- Added principles:
  - I. Spec-Driven Development (NON-NEGOTIABLE) (new principle): every feature
    MUST flow through the Spec Kit lifecycle (specify -> clarify -> plan ->
    tasks -> implement); no production code before a spec and plan exist; each
    plan MUST carry a Constitution Check. Leads the list and formalizes the
    workflow the project already follows.
  - XI. Supply-Chain Integrity & Verifiable Provenance (new principle): the
    artifact a consumer installs MUST be verifiably the artifact this project
    built from reviewed, attributed source -- attested publish, signed tags,
    DCO, pinned/screened dependencies, and an honest distributed surface.
    States the intent behind gates previously recorded only as enforcement.
- Renumbered principles (no semantic change):
  - I -> II   Stable Consumer API & Clear Boundaries
  - II -> III Browser-First Runtime Resilience
  - III -> IV Framework-Neutral Structured Observability
  - IV -> V   Secure & Privacy-Safe Logging by Default
  - V -> VI   Testable, Minimal, Maintainable Package Design
  - VI -> VII Log Integrity & Monitoring Suitability
  - VII -> VIII Lightweight Logger Instances & Federated Runtime Discipline
  - VIII -> IX Reproducible Quality Verification
  - IX -> X   Mechanical Enforcement of Documented Contracts
- Modified principles:
  - II. Stable Consumer API & Clear Boundaries (was I) -- added a deprecation-
    discipline clause: an incompatible contract change MUST first ship
    deprecated, with a replacement and migration path, for at least one minor
    release before removal, signaled where consumers encounter it.
  - IV. Framework-Neutral Structured Observability (was III) -- added a
    standards-based interoperability clause: prefer conforming to an open,
    published interchange standard over inventing a proprietary shape;
    proprietary formats permitted only as additive, clearly-scoped options.
- Governing-altitude refactor (relocation, not relaxation -- all relocated
  text remains binding in the section it moves to, and Principle X keeps it
  mechanically enforced):
  - VIII. Lightweight Logger Instances (was VII): the enumerated MUST-NOT lists
    (specific globals, ambient-state reads) move to a "Logger construction
    constraints" item under Package Architecture Standards; the principle keeps
    the governing statement, the federated-runtime clauses, and the rationale.
  - VI. Testable, Minimal, Maintainable Package Design (was V): the inline
    test-suppression enumeration (skip / xfail / todo / @ts-ignore /
    @ts-expect-error / per-path tsconfig relaxations) moves to the Delivery
    Workflow as the operational definition of a tolerated exception.
  - X. Mechanical Enforcement of Documented Contracts (was IX): the inline
    contract-test IDs (T-S1..T-S5) are de-inlined; the principle points to
    Delivery Workflow / contracts for the specific identifiers.
- Removed sections:
  - None
- Templates requiring updates:
  - ✅ updated .specify/templates/plan-template.md (Constitution Check adds a
       leading "Spec-Driven Development" gate, a deprecation clause under API
       Stability, a standards-based interoperability clause, and a
       "Supply-Chain Integrity & Provenance" gate)
  - ✅ updated .specify/templates/spec-template.md (Consumer Impact adds
       "Deprecation & Migration" and "Supply-Chain / Distribution Impact"
       bullets)
  - ✅ updated .specify/templates/tasks-template.md (Polish phase extends the
       enforcement-coverage pass to cover deprecation signaling and
       provenance/attestation gates)
- Dependent docs updated in this change set:
  - ✅ GOVERNANCE.md (principle count 9 → 11; constitution reference
       v1.3.0 → v1.4.0; Principles I + XI added and the list renumbered)
  - ✅ CONTRIBUTING.md (principle count 9 → 11; Principles I + XI added with
       one-line summaries; list renumbered; deprecation/interop clauses noted)
- Follow-up TODOs:
  - Per Principle X, two newly documented gates need their enforcement path
    confirmed or a named, time-bound remediation task filed in the owning
    feature: (a) deprecation discipline (Principle II) -- an automated check
    that a removed public symbol was @deprecated in a prior minor, or a
    documented release-checklist gate; (b) the "distributed surface matches
    exports/docs" clause of Principle XI, if not already covered by the
    existing bundle-shape audit. Spec-Driven Development (I) and the remaining
    provenance bullets are already enforced (Spec Kit workflow + plan-template
    Constitution Check; signed tags, OIDC+provenance publish, DCO, dependency
    pins from Feature 005).
-->
# SafeSignal Constitution

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)
Every feature MUST flow through the Spec Kit lifecycle: `specify → clarify` (when
ambiguous) `→ plan → tasks → implement`. No production code may be written before a spec
and plan exist for it. Each plan MUST include a **Constitution Check** confirming
compliance with these principles — including that its concrete source, stack, dependency,
and scope choices are justified — before implementation begins.

Rationale: SafeSignal's trustworthiness rests on every change being specified, reviewed
against this constitution, and enforced before it ships. The project's features have been
built through this lifecycle from the start; stating it as the entry-gate principle makes
the discipline binding rather than conventional, and ties the plan-template Constitution
Check to a governing principle rather than to habit alone.

### II. Stable Consumer API & Clear Boundaries
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

When a published contract must change incompatibly, it MUST first ship **deprecated** —
with the replacement available and a documented migration path — for at least one minor
release before removal. Deprecation MUST be signaled where consumers encounter it (types,
`@deprecated` annotations, changelog), not only in prose. Removing a deprecated contract
is itself a breaking change subject to the justification, versioning, and migration
requirements above.

Rationale: The package exists to be reused across host applications and independently
deployed frontend modules without forcing consumer rewrites when implementation
details evolve, and without making it easy to log unsafely by accident. A deprecation
window with a working replacement is what lets consumers move on their own schedule
instead of being broken by an upgrade.

### III. Browser-First Runtime Resilience
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

### IV. Framework-Neutral Structured Observability
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

Where an open, published interchange standard exists for a concern the package addresses
— wire formats, context propagation, delivery primitives — the package MUST prefer
conforming to that standard (and MUST document the standard and version it targets) over
inventing a proprietary shape. Proprietary or vendor-specific formats are permitted only
as additive, clearly-scoped options that do not displace the standards-based path.

Rationale: Structured, portable, predictable events preserve observability value now
while keeping the package adaptable to future ingestion and observability backends,
and prevent the runtime hazards of arbitrary object serialization in the browser.
Conforming to open standards rather than proprietary shapes is what keeps the package
interoperable with the broadest set of backends and free of vendor lock-in.

### V. Secure & Privacy-Safe Logging by Default
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

### VI. Testable, Minimal, Maintainable Package Design
The package MUST favor a small, clear public surface area, deliberate dependency
selection, and internals that remain understandable to future contributors. Strong
automated coverage is required for public API contracts, runtime behavior, failure
safety, metadata handling, redaction behavior, environment-sensitive configuration,
and the secure-defaults posture defined in Principle V. Documentation, examples,
and integration guidance MUST be kept aligned with actual package behavior and MUST
model safe logging behavior; they MUST NOT normalize insecure logging patterns
(secret dumping, raw object dumping, disabling redaction in examples, etc.). Unsafe
patterns, where they must be discussed at all, MUST be marked as exceptional and
accompanied by mitigation guidance. Product-specific business logic, message
catalogs, and application semantics MUST NOT be embedded in the package.

**Test code is held to the same engineering standard as production code.** Code
under `tests/` — and any other test-bearing path — MUST satisfy the same TypeScript
typing, lint, build, and import-resolution rules that apply to `src/`. A quality
check that passes against `src/` but is skipped, weakened, or routed through a
different resolver for `tests/` is a documentation gap masquerading as a quality
gate. Any tolerated exception MUST be tracked as time-bound remediation debt rather
than treated as steady state; what counts as a tolerated exception, and the
removal-condition discipline it MUST carry, is defined under Delivery Workflow &
Quality Gates.

Rationale: Reusable packages succeed through predictable behavior, low maintenance
cost, and high consumer trust in both code and documentation; documentation that
models unsafe behavior is itself a security defect. Test code is the project's own
evidence that those behaviors hold — letting it drift from the production standard
makes the evidence unreliable and lets latent defects accumulate behind a green
local prompt.

### VII. Log Integrity & Monitoring Suitability
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

### VIII. Lightweight Logger Instances & Federated Runtime Discipline
The package MUST scale to **many `Logger` instances per page** — one per module is
the normal case in federated and host-app deployments. Creating a `Logger` MUST be
lightweight, deterministic, and side-effect-free: a `Logger` is a context handle
over the already-configured shared runtime, never an initializer of the runtime
itself. Per-`Logger` cost MUST NOT scale with the number of instances; the package
MUST stay predictable when a page hosts tens, hundreds, or more loggers.

Creating a `Logger`, and any per-instance lifecycle event, MUST NOT initialize
backends, vendor SDKs, or transports; start recurring tasks (queues, flush/batch/retry
loops, timers); attach or patch globals; read ambient browser state; perform network
work or other I/O; or allocate unbounded memory. The exhaustive construction
constraints are enumerated under Package Architecture Standards (§ Logger construction
constraints) and are binding there.

Expensive runtime resources — backend adapters, transports, batchers, correlation
hooks, redactors, sanitizer state — MUST be configured **once at the
runtime/package level** (e.g., via `configureLogging()`) and **shared** across every
`Logger` instance derived from that runtime. Logger derivation (`child()`,
`withContext()`, federated module loggers) MUST stay a constant-cost operation that
layers context over the same shared runtime.

**Explicit host-level global install (opt-in).** Distinct from per-`Logger`
construction, the package MAY provide a **single, explicit, host-installed,
runtime-level** integration that attaches a global handler — for example, a global
uncaught-error / unhandled-rejection capturer — analogous to configuring a transport
at the runtime level. Such an install is permitted **only** when it is: **opt-in**
(never a side effect of `createLogger()` or any per-instance lifecycle, and never
installed by default); **host-owned (single owner)** — installed by the host that
owns the configured runtime, and federated modules MUST NOT install it; **explicitly
named** — reached only through a dedicated, documented API/subpath, never ambient;
**fail-safe** — it MUST NOT throw into, or otherwise break, the page (Principle III);
and **fail-closed** — captured data routes through the existing secure pipeline so
secrets are redacted/sanitized before any transport receives it (Principle V). The
per-`Logger` prohibitions in this principle and in § Logger construction constraints
are **unchanged**: a `Logger` still MUST NOT attach global listeners or patch globals.

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

### IX. Reproducible Quality Verification
There MUST be a single, authoritative answer to the question "does this branch pass
our quality checks?" — and that answer MUST be the same whether the checks run on a
contributor's machine, in CI, or on a release runner. Two test runners, two module
resolvers, two TypeScript invocations, or two environments are not allowed to
disagree on whether the codebase is healthy.

The package MUST:
- Make every documented quality check (typecheck, test, build, bundle-size,
  dependency-pins, security, integrity, performance) runnable through a single,
  documented `npm` script (or equivalent published entrypoint) that produces the
  same exit code locally and in CI for the same source state.
- Eliminate environment-dependent verification outcomes. If a check passes locally
  and fails in CI (or vice versa), the underlying tooling divergence — different
  module resolvers, different TypeScript programs, different fixture or mocking
  discipline, missing build artifacts, implicit global state, undeclared
  prerequisites — MUST be removed or reconciled in the package's own configuration,
  not papered over with per-environment skips, ad-hoc CI shims, or "works on my
  machine" tolerance.
- Be honest about prerequisites. A check that requires `dist/` to exist, a service
  to be running, a network endpoint to respond, fixture data to be generated, or
  any other side setup MUST either bring up that prerequisite in its own setup
  phase or fail loudly with an actionable message when the prerequisite is absent.
  Tests MUST NOT silently pass because a precondition was skipped.
- Reconcile coexisting runners. Where two runners must coexist (for example,
  Vitest's Vite resolver alongside `tsc --noEmit`'s strict resolver), their
  behavior on the same input MUST be reconciled — shared tsconfig, shared
  resolution mode, shared mocks, shared fixtures — so they cannot reach
  contradictory conclusions about the same source. Divergence between runners is
  a defect in the project's tooling configuration, not a fact of life.

Rationale: A project whose local "all green" and CI "all green" mean different
things has no green at all — it has two unreliable signals that each create false
confidence. Reproducible verification is what makes the other quality principles
enforceable in practice; without it, a passing check is a coincidence rather than
a guarantee, and latent defects accumulate behind whichever runner happens to be
the most permissive.

### X. Mechanical Enforcement of Documented Contracts
Every quality gate this project documents — in the constitution, in
`CONTRIBUTING.md`, in `GOVERNANCE.md`, in a feature's `plan.md`, `spec.md`, or
`tasks.md`, or in any `contracts/` artifact — MUST have a machine-executable
enforcement path. If a rule is worth writing down as binding, it is worth checking
automatically. Documentation alone is not a quality gate; it is a description of
one.

The package MUST:
- Pair every published invariant with an automated check. Bundle-size budgets,
  dependency pin sets, redactor fail-closed behavior, transport security clauses,
  DCO sign-off requirements, signed-tag requirements, publish-provenance
  attestation, structured-event shape and bounded depth, level-filter defaults,
  the `exports` map shape, and any future invariant added by an amendment MUST
  each be guarded by a test, a lint rule, a CI job, a publish-time hook, or
  another automated check that fails closed when the invariant is violated. (The
  specific transport security clause identifiers — `T-S1..T-S5` and peers — and
  the contract tests that enforce them are catalogued in the `contracts/`
  artifacts and the Delivery Workflow, not inlined here.)
- Treat undocumented enforcement as an exception. A documented gate that has no
  automated check MUST be filed as a named, time-bound remediation task in the
  same change set that introduces the gate. The documenting change is not
  approved until either the check exists or the remediation task is explicitly
  accepted with a stated deadline.
- Treat enforcement removal the same as principle relaxation. Removing or
  disabling the automated check that enforces a documented gate MUST go through
  the same review and amendment process as relaxing the underlying contract —
  including a documented justification, a re-review at each subsequent release,
  and (for security, privacy, integrity, scalability, or supply-chain guarantees)
  a named, time-bound remediation plan.
- Keep the enforcement path discoverable. Each documented gate SHOULD reference
  its enforcement mechanism (test file path, CI job name, lint rule identifier,
  contract test ID) so contributors can trace a rule from its statement to its
  check.

Rationale: A documented quality gate without enforcement is two failure modes
wearing a costume — the rule will be quietly broken by contributors who never
knew it existed, and the project will discover the breakage as a production
incident or a shipped vulnerability rather than as a failed CI job. Mechanical
enforcement converts intent into protection; it is the discipline that makes the
rest of the constitution operate as a binding standard instead of as advice.

### XI. Supply-Chain Integrity & Verifiable Provenance
The artifact a consumer installs MUST be verifiably the artifact this project built
from reviewed, attributed source. Distribution integrity is a first-class
responsibility, distinct from the runtime data-safety of Principle V (Secure &
Privacy-Safe Logging) and the log-event integrity of Principle VII (Log Integrity &
Monitoring Suitability).

The package MUST:
- **Publish only through an automated, attested path.** Releases MUST carry build
  provenance tying the published artifact to its source commit and build, and MUST
  be published via short-lived, trusted-publisher credentials rather than
  long-lived tokens.
- **Establish source authenticity.** Release tags MUST be signed and contributions
  MUST be attributable (DCO sign-off), so the provenance chain begins at reviewed
  source.
- **Pin and screen its own dependencies,** so a compromised upstream cannot
  silently enter a published build.
- **Keep the distributed surface honest.** What ships (entry points, the `exports`
  map, bundle contents) MUST match what is documented and contracted; nothing
  undocumented rides along in the published artifact.

Tamper-resistance and reproducibility of the published build are the goal: a
consumer, a maintainer, and CI MUST be able to reach the same conclusion about an
artifact's origin.

Rationale: A security package is only as trustworthy as the weakest link between its
source and the consumer's `node_modules`. The project already signs tags, publishes
via OIDC trusted-publisher with provenance attestation, requires DCO, and pins
dependencies; stating this as a principle records *why* those gates are
non-negotiable and binds future releases to keep them, rather than leaving artifact
integrity as an implementation detail of one feature's CI configuration.

## Package Architecture Standards

- The package MUST target reusable browser package distribution rather than a single
  application implementation.
- Public types, configuration shapes, and extension points MUST be explicitly
  documented and versioned as package contracts.
- Internal modules MUST hide implementation details and MAY change freely so long as
  published contracts and documented behavior remain intact.
- Optional integrations and transports MUST be additive, MUST NOT impose vendor
  lock-in on the base package, and MUST NOT be permitted to weaken the secure
  defaults defined in Principle V or the integrity guarantees in Principle VII.
- Sensitive-data handling, redaction, and structured-output guarantees MUST be
  enforced inside the package, before any transport receives an event, so optional
  integrations cannot bypass them.
- The configured runtime (backend, transports, redactor, sanitizer state, internal
  error reporter) is a **package-level shared resource**. `Logger` instances are
  cheap handles that read from this shared runtime; they MUST NOT own, initialize,
  or duplicate it. Logger derivation MUST stay constant-cost (Principle VIII).
- **Logger construction constraints.** The package MUST NOT perform any of the
  following at `Logger`-instance creation, nor at per-instance lifecycle events
  (these are the binding, enumerated form of Principle VIII):
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

  These prohibitions are scoped to `Logger`-instance creation and per-instance
  lifecycle. They do **not** forbid a single, explicit, **host-level** runtime
  install that attaches a global handler through a dedicated documented API (see
  Principle VIII, "Explicit host-level global install") — that is a host-owned,
  opt-in runtime-configuration step, not a per-`Logger` side effect.
- Federated host/module configuration ownership MUST be documented as part of the
  package contract. The duplicate-package-copy behavior MUST be classified as
  **isolated**, **shared**, or **explicitly unsupported**, with consumer-visible
  guidance for each (Principle VIII).
- Package decisions MUST favor portability, composability, and a uniform security
  posture across consumers over app-specific shortcuts.

## Delivery Workflow & Quality Gates

- Every feature MUST proceed through the Spec Kit lifecycle (Principle I): a spec and
  a plan MUST exist before production code, and each plan MUST pass its Constitution
  Check against the principles below before implementation begins.
- Every plan, spec, and task list MUST show how the work preserves API stability and
  deprecation discipline, browser resilience, framework neutrality and standards-based
  interoperability, secure-by-default logging, privacy-safe data handling, log
  integrity, lightweight logger creation, federated runtime discipline, package
  maintainability, reproducible verification, mechanical enforcement of documented
  contracts, and supply-chain integrity.
- New or changed public API behavior MUST include contract tests and migration notes
  when consumer-visible behavior changes.
- **Deprecation & Migration**: A change that removes or incompatibly alters a published
  contract MUST land the deprecation first — replacement available, migration path
  documented, deprecation signaled in types/`@deprecated`/changelog — and keep the
  deprecated contract for at least one minor release before removal (Principle II).
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
- **Supply-Chain Integrity & Provenance**: Any change to the release pipeline,
  publish path, dependency set, or the distributed surface (entry points, `exports`
  map, packaged files) MUST preserve attested publishing, signed tags, DCO
  attribution, pinned/screened dependencies, and parity between what ships and what
  is documented (Principle XI). Each such gate MUST reference its automated check or
  file a named, time-bound remediation task.
- **Reproducible Verification**: Every quality check this feature defines
  (typecheck, test, build, bundle-size, dependency-pins, security, integrity,
  performance, and any new check added by the feature) MUST be invokable through a
  single documented entrypoint (`npm` script or equivalent) and MUST produce
  identical pass/fail outcomes locally and in CI for the same source state.
  Divergence between local and CI outcomes — because of resolver differences,
  missing build artifacts, undeclared environment variables, undocumented
  prerequisites, or coexisting runners reaching different conclusions on the same
  input — MUST be eliminated in the package's own configuration rather than
  absorbed with per-environment skips or ad-hoc CI shims. Test code under `tests/`
  MUST be held to the same typing, lint, build, and import-resolution standards as
  `src/` (Principle VI). A tolerated relaxation is any `skip`, `xfail`, `todo`,
  `@ts-ignore` / `@ts-expect-error` comment, temporarily disabled test file,
  per-path tsconfig relaxation, or other carve-out; each MUST carry a written,
  named, time-bound removal condition stored alongside the exception (in the source
  itself or in the owning feature's task list) and MUST be tracked as remediation
  debt rather than treated as steady state.
- **Mechanical Enforcement of Documented Contracts**: Every quality gate this
  feature documents — invariants, bundle budgets, security clauses, dependency pin
  sets, sign-off rules, performance targets, the `exports` map shape, and any
  other rule whose violation should fail a build — MUST be paired with an
  automated check (test, CI job, lint rule, or publish-time hook) before the
  documenting change is approved. A documented gate without an enforcement path
  MUST be filed as a named, time-bound remediation task in the same change set.
  Each gate SHOULD reference its enforcement mechanism (test file path, CI job
  name, lint rule identifier, contract test ID) so contributors can trace a rule
  from its statement to its check. Removing or disabling the enforcement of a
  previously-enforced gate goes through the same amendment and re-review process
  as relaxing the underlying principle (Principle X).
- Documentation, examples, and integration guidance for single-app and
  federated/module-based usage MUST be updated when behavior or setup expectations
  change, and MUST continue to model safe logging behavior and document the
  host/module configuration ownership contract.
- Any proposal that adds significant abstraction, dependency weight, vendor
  coupling, or that relaxes a security, integrity, scalability, verification,
  enforcement, or supply-chain guarantee MUST document why a simpler package-centric
  and contract-preserving approach is insufficient.

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
release policy. Exceptions that relax a security, privacy, integrity, scalability,
verification, enforcement, or supply-chain guarantee require an explicit, named,
time-bound remediation plan and MUST be re-reviewed at each subsequent release.

**Version**: 1.5.0 | **Ratified**: 2026-05-26 | **Last Amended**: 2026-06-01
