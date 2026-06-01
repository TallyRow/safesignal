# Feature Specification: Catch the Silent Errors — Opt-in `./capture`

**Feature Branch**: `013-global-error-capture`

**Created**: 2026-06-01

**Status**: Draft

**Input**: GitHub issue #13 — "feat: catch the silent errors — opt-in ./capture (uncaught exceptions + unhandled rejections)"

> **Why this exists (marquee visible-value feature).** Today, an uncaught exception or an unhandled
> promise rejection in a host app or federated module vanishes — it never reaches the app's
> configured logging transports. This feature gives a host one explicit, opt-in switch that makes
> those previously-silent failures visible: a host-installed capturer routes **uncaught exceptions +
> unhandled promise rejections** through the **existing secure pipeline** (redact → sanitize →
> transport), attributed to the host's configured identity, fail-closed and fail-safe. It is the
> first runtime feature of the V1 roadmap that produces directly visible developer value.
>
> **Constitution fit:** III (logging must never break the page), V (fail-closed redaction of
> secrets in messages/stacks), VIII (an explicit host-level install — never a per-`Logger` side
> effect). **Scope is errors only — no Web Vitals, view tracking, or network instrumentation (that
> is RUM, a separate roadmap item).**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A host makes silent errors visible (Priority: P1)

A host application has already configured logging (transports, redaction). It opts in to error
capture with a single explicit call. From then on, any **uncaught exception** or **unhandled
promise rejection** anywhere on the page is delivered to the host's configured transports as a
well-formed `error`-level event — redacted and sanitized like any other log — instead of vanishing.

**Why this priority**: This is the entire visible value of the feature and the MVP. Without it,
the most important failures (the ones nobody remembered to wrap in a `try/catch`) are invisible to
the app's observability. Everything else (safety hardening, federation rules) protects this core
capability.

**Independent Test**: In a test page with a configured capturing transport, install capture, then
trigger an uncaught exception and an unhandled rejection; confirm both arrive at the transport as
`error`-level events carrying the error's name/message/stack and the host's identity.

**Acceptance Scenarios**:

1. **Given** capture is installed over a configured runtime, **When** code throws an uncaught
   exception, **Then** an `error`-level event with the serialized error is delivered to the
   configured transports.
2. **Given** capture is installed, **When** a promise rejects with no handler, **Then** an
   `error`-level event with the rejection reason is delivered to the configured transports.
3. **Given** a captured error whose message or stack contains a secret-shaped value, **When** it is
   emitted, **Then** the secret is redacted/sanitized before any transport receives the event
   (fail-closed — same pipeline as `logger.error`).

---

### User Story 2 - Capture never breaks the page and never clobbers existing handlers (Priority: P2)

The capturer is invisible to the running application except for the events it emits. It does not
throw, reject, or otherwise propagate into page code; it does not break rendering, navigation, or
user interaction; and it is **additive** — it chains onto, rather than replaces, any error handling
the host already has, so existing `window.onerror`/handlers keep firing.

**Why this priority**: Principle III (logging must never destabilize the page) is non-negotiable.
A capturer that could throw into the page, swallow another framework's error handler, or loop on
its own failures would be worse than the silent errors it replaces. Essential, but it hardens the
P1 capability rather than adding new value.

**Independent Test**: Install capture alongside a pre-existing `window.onerror`/error listener;
trigger errors and confirm (a) the pre-existing handler still runs, (b) a throw inside the
capturer's own path does not propagate to the page, and (c) rendering/navigation continue.

**Acceptance Scenarios**:

1. **Given** the host already has an error handler installed, **When** capture is installed and an
   error occurs, **Then** both the host's handler and the capturer run; neither is suppressed.
2. **Given** an internal failure inside the capturer (e.g., a transport throws), **When** an error
   is captured, **Then** the failure is swallowed (routed to the internal-error diagnostic hook),
   no exception reaches the page, and no capture loop occurs.
3. **Given** capture is installed, **When** the host calls the returned disposer, **Then** the
   listeners are removed and no further errors are captured; calling the disposer again is a no-op.

---

### User Story 3 - Federation-owned: host installs, modules never do (Priority: P3)

Error capture is a **host-level** integration point. It is opt-in via a dedicated subpath, never a
side effect of creating a logger, and the contract documents that only the host installs it —
federated modules consume logging through loggers but never install global capture. Duplicate
package copies on one page behave predictably.

**Why this priority**: Principle VIII (federated runtime discipline). Global error listeners are a
shared, page-level resource; if every module installed its own capture, the page would get
duplicate captures, fight over global state, and violate the per-`Logger` lightweight contract.
Documented host ownership keeps federated deployment first-class — but the core capability works
for a single host before the federation contract is exercised.

**Independent Test**: Confirm that creating a logger attaches no global error listeners; confirm
the documented ownership contract states host-only install and the duplicate-copy behavior; confirm
a module that only creates loggers never installs capture.

**Acceptance Scenarios**:

1. **Given** a module creates loggers via the core entry, **When** it does so, **Then** no global
   `error`/`unhandledrejection` listeners are attached (capture is never a `createLogger` side
   effect).
2. **Given** the federation contract, **When** a contributor reads it, **Then** it documents that
   the host owns the install and the duplicate-package-copy behavior (isolated per copy).

---

### Edge Cases

- **No runtime configured**: capture installed before/without `configureLogging` degrades safely —
  it emits through the current default runtime and never throws; behavior is documented.
- **Non-`Error` thrown/rejected values** (a thrown string, a rejection with a non-`Error` reason):
  serialized safely into a well-formed event, never throwing.
- **Re-entrancy / capture loops**: an error arising from within the capturer's own emit path (e.g.,
  a transport throwing) MUST NOT re-trigger capture indefinitely — capture is loop-safe.
- **No DOM/global target** (server-side rendering or a worker without `window`): install is a safe
  no-op (or documented unsupported), never throwing.
- **Double install / double dispose**: installing twice and disposing twice behave predictably
  (each documented), without leaking listeners or throwing.
- **A captured event that the redactor drops** (fail-closed): the event is dropped, not emitted
  partially; this is correct, not an error.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: **NEW opt-in `./capture` subpath** exporting `installGlobalErrorCapture`
  (host-only install returning a disposer) plus its options/disposer types. No change to any
  existing entry point, export, or behavior; the core `.` entry and `createLogger` are untouched.
- **Compatibility Impact**: Additive / backward compatible. Existing consumers are unaffected
  unless they explicitly opt in to `./capture`.
- **Migration Notes**: None required. Hosts that want the capability add one explicit install call.
- **Deprecation & Migration**: No contract is deprecated or removed.
- **Host/Module Usage Impact**: Host installs once; the capturer operates over the host's configured
  runtime. Federated modules never install it (documented). Creating a `Logger` never installs
  capture. Duplicate-package-copy behavior is documented as **isolated** (each copy's capturer
  emits through its own module-scoped runtime).
- **Security & Privacy Considerations**: This is a **net security improvement** for observability:
  captured error messages and stacks — which commonly carry secrets, tokens, URLs with credentials,
  or PII — are routed through the **same fail-closed redaction + sanitization pipeline** as normal
  logs before any transport sees them. No new path may emit unredacted captured data; if redaction
  fails, the event is dropped (fail-closed). The capturer adds no new sensitive-data source beyond
  the errors it forwards, and it must not itself log ambient page/browser state.
- **Log Integrity Considerations**: Captured events are structured, machine-parseable `error`-level
  events with stable shape and host origin attribution, distinguishable as capture-sourced (so
  downstream monitoring can separate captured uncaught errors from explicitly-logged ones). The
  capturer does not reorder, dedupe, or mutate normally-logged events; any drop/dedup behavior it
  introduces for captured errors is documented.
- **Runtime Scale & Federated Deployment Impact**: Installing capture is a **one-time host-level
  action**, not a per-`Logger` cost — it does not violate the per-`Logger` construction constraints
  (which forbid per-instance global listeners / `window.onerror` patches). Capture is the sanctioned
  host-level place for `error`/`unhandledrejection` listeners. Creating loggers stays constant-cost
  and side-effect-free.
- **Supply-Chain / Distribution Impact**: Adds one new packaged subpath (`./capture` → new `exports`
  entry + built files). The documented distributed surface and the parity gate's public-subpath set
  MUST be updated to include `./capture` (so what ships still matches what is documented — Feature
  012). Attested publishing, signed tags, DCO, and pinned dependencies are unchanged; **no new
  runtime dependency** is introduced.
- **Verification & Enforcement**: Contract tests (capture routes through the pipeline; redaction
  applied; events well-formed + attributed), failure-safety tests (never throws into the page; loop
  safe; transport/handler failures swallowed), non-clobbering tests (existing handlers still fire;
  disposer removes listeners), and a federation test (creating a logger attaches no listeners). The
  new subpath is verified by the distributed-surface parity gate. All checks run identically in CI
  and locally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The package MUST expose an **opt-in `./capture` subpath** providing a host-callable
  `installGlobalErrorCapture` that begins capturing global errors only when the host explicitly
  calls it. Capture MUST NEVER be a side effect of `createLogger`, `configureLogging`, or any
  per-`Logger` operation.
- **FR-002**: When installed, the capturer MUST route **uncaught exceptions** through the existing
  secure pipeline (sanitize → URL-scrub → redact → guard → transport), emitting an `error`-level
  event carrying the serialized error (name, message, stack).
- **FR-003**: When installed, the capturer MUST route **unhandled promise rejections** through the
  same pipeline, emitting an `error`-level event carrying the serialized rejection reason.
- **FR-004**: Captured events MUST be **fail-closed**: they MUST pass the **same** redaction +
  sanitization pipeline that any `logger.error` passes before a transport receives them — whole-value
  secrets (token-shaped values, denylisted keys) are masked, and if redaction/sanitization cannot
  complete the event MUST be **dropped** rather than emitted. The capturer MUST introduce **no path
  that bypasses** that pipeline. (Capture inherits exactly the pipeline's redaction; like all logging,
  arbitrary substrings inside a free-text stack are not substring-scrubbed — secrets belong in
  structured attributes, not thrown into messages. See Assumptions.)
- **FR-005**: The capturer MUST be **fail-safe**: it MUST NOT throw, reject, or propagate any error
  into page code, and MUST NOT break rendering, navigation, or user interaction. Internal failures
  MUST be routed to the runtime's internal-error diagnostic hook and swallowed.
- **FR-006**: Installation MUST be **additive / non-clobbering**: it MUST attach listeners without
  replacing or removing the host's existing `window.onerror` or other error handlers, which MUST
  continue to run.
- **FR-007**: `installGlobalErrorCapture` MUST return a **disposer** that removes the installed
  listeners and stops capture; the disposer MUST be safe to call more than once (idempotent).
- **FR-008**: Capture MUST be **host-owned**: the contract MUST document that only the host installs
  it and that federated modules never install it; the capturer operates over the host's configured
  runtime, and duplicate-package-copy behavior MUST be documented (isolated per copy).
- **FR-009**: Scope MUST be **errors only** — the capturer captures uncaught exceptions and
  unhandled rejections and MUST NOT capture or instrument Web Vitals, view/route changes, network
  requests, or any other RUM signal.
- **FR-010**: Captured events MUST be **well-formed and attributed**: structured `error`-level
  events carrying the host's configured identity (application/module/environment) and a stable
  marker distinguishing the source (uncaught exception vs unhandled rejection) so they are
  separable downstream.
- **FR-011**: The capturer MUST behave safely when the host's logging runtime is **unconfigured**
  (the host installs capture before/without `configureLogging`): because capture emits through a
  `Logger` handle, an unconfigured runtime simply routes captured errors to the default `Noop`
  runtime — the capturer MUST NOT throw. The behavior MUST be documented.
- **FR-012**: The capturer MUST be **loop-safe**: an error originating within its own capture/emit
  path MUST NOT cause unbounded re-capture.
- **FR-013**: Installing capture MUST be the **sanctioned host-level location** for global
  `error`/`unhandledrejection` listeners; no per-`Logger` or per-module path may attach such
  listeners, and this boundary MUST be mechanically enforced (Principle X).
- **FR-014**: Adding the `./capture` subpath MUST keep the **distributed surface honest**: the
  documented public-subpath set and the parity gate (Feature 012) MUST be updated so what ships
  matches what is documented.

### Key Entities *(include if feature involves data)*

- **Captured Error Event**: A structured `error`-level event derived from an uncaught exception or
  unhandled rejection — serialized error (name, message, stack), host identity, and a source marker
  — routed through the secure pipeline like any logged event.
- **Error Capturer**: The host-installed component that listens for global error/rejection events,
  builds Captured Error Events, and emits them through the configured runtime. Returns a disposer.
- **Disposer**: The handle returned by install that removes the listeners and stops capture
  (idempotent).
- **Configured Runtime (existing)**: The host-owned, already-configured logging runtime (transports,
  redactor, sanitizer, internal-error hook) the capturer emits through — unchanged by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With capture installed over a configured runtime, **100%** of triggered uncaught
  exceptions in the test suite are delivered to the configured transports as well-formed
  `error`-level events.
- **SC-002**: With capture installed, **100%** of triggered unhandled promise rejections are
  delivered likewise.
- **SC-003**: A captured error carrying a **whole-value** secret (a token-shaped message) is **masked**
  by the redaction pipeline before any transport receives it, and a captured event whose redaction
  **fails is dropped** (0 delivered) — proving capture routes through the same fail-closed redaction as
  any log, with no bypass.
- **SC-004**: An exception or rejection raised inside the capturer's own path (handler/transport
  failure) causes **0** page-breaking effects — no error propagates to page code and rendering/
  navigation continue — and **0** capture loops.
- **SC-005**: After capture is installed, a pre-existing `window.onerror`/error handler still fires
  on **100%** of subsequent errors (non-clobbering).
- **SC-006**: After the disposer is called, **0** further errors are captured.
- **SC-007**: Creating a logger via the core entry attaches **0** global error/rejection listeners
  (capture is never a `createLogger` side effect).

## Assumptions

- **Routing through the existing pipeline.** Captured errors are emitted through the same internal
  emit/dispatch path (sanitize → URL-scrub → redact → guard → SafeTransport) that `logger.error`
  uses — the capturer does not introduce a parallel emission path or its own transports. This is
  what makes capture's redaction identical to any log's, by construction.
- **Redaction is whole-value, not substring.** The pipeline's redactor masks whole-value secrets
  (token-shaped values, denylisted keys) and drops on failure; it does **not** scrub arbitrary
  secret substrings embedded in a free-text message or stack — a pipeline-wide property that predates
  and is unchanged by this feature. Capture inherits exactly that behavior (no better, no worse than
  `logger.error`); the package's guidance to keep secrets in structured attributes (not in thrown
  message strings) applies equally to captured errors.
- **Host-ownership via a `Logger` handle.** The host that owns logging (the caller of
  `configureLogging`) is the same actor that installs capture. The issue's `installGlobalErrorCapture(runtime)`
  is realized in planning as `installGlobalErrorCapture(logger, options?)` — a `Logger` is the only
  public handle over the configured runtime, `logger.error` already routes through the full
  fail-closed pipeline, and (decisively) a `Logger` crosses the separate-bundle boundary safely where
  reading the module-scoped runtime slot directly would not (see plan Complexity Tracking). "Host only
  / modules never install" is expressed as a documented federation contract plus the opt-in subpath,
  reinforced by the existing module-scoped runtime isolation.
- **Errors-only V1 scope.** No sampling, dedup, grouping, or rate-limiting of captured errors in V1
  beyond the existing internal-error-notice rate-limiting; every captured error is emitted. RUM
  signals (Web Vitals, view tracking, network) are explicitly out of scope.
- **`error`-level emission.** Captured errors are emitted at `error` level, which is always within
  the baseline production level filter, so capture is effective under production defaults.
- **Browser-first.** The capturer targets browser globals (`addEventListener('error')` /
  `addEventListener('unhandledrejection')`); environments without those globals get a safe no-op.
- **No new dependency / no change to existing exports.** The feature adds one subpath and the
  capture component; it changes no existing public contract and adds no runtime dependency.
- The API shape (`installGlobalErrorCapture` signature, options, disposer) and the precise
  source-marker representation are settled in `/speckit-plan`; the spec fixes the required behavior.

## Dependencies

- **Existing configured-runtime + secure pipeline** (`configureLogging`, the dispatch pipeline,
  redactor/sanitizer, SafeTransport, internal-error hook) — present today; the capturer reuses them.
- **Feature 012 distributed-surface parity** — the new `./capture` subpath must be added to the
  documented public-subpath set so the parity gate stays green.
- **"G1" prerequisite — RESOLVED (issue #12, merged PR #40).** "G1" is the roadmap code for
  issue #12, the governance amendment "clarify Principle VIII — explicit host-level global install is
  allowed." It is **merged**: the constitution is now **v1.5.0** and Principle VIII carries an
  explicit *"Explicit host-level global install (opt-in)"* clause permitting a **single, explicit,
  host-installed, runtime-level** global handler — opt-in, host-owned (one owner; modules never
  install), explicitly named, fail-safe, fail-closed. This is exactly the constitutional sanction
  `installGlobalErrorCapture` needs; the per-`Logger` global-side-effect ban is preserved. **No
  blocker remains** — this feature proceeds on the existing `configureLogging`/module-scoped-runtime
  ownership model, now explicitly blessed by Principle VIII. (G1 also filed the enforcement of the
  "modules never install" boundary as a named, time-bound remediation due **2026-09-01** — delivered
  by this feature's tests; see FR-013 and SC-007.)
