# Feature Specification: React, Caught — Opt-in `./framework-react` Error Boundary + `useLogError()`

**Feature Branch**: `018-react-error-boundary`

**Created**: 2026-06-02

**Status**: Draft

**Input**: GitHub issue #17 — "feat: ./framework-react error boundary + hook"

> **Why this exists (visible-value roadmap feature).** When a React component throws during render
> or a lifecycle method, the default outcome is a blank white screen and an error that never reaches
> the app's configured logging. This feature gives React consumers two small, explicit building
> blocks — a `<LogErrorBoundary>` component and a `useLogError()` hook — that route component-tree
> errors through their **existing configured logger** (`log.error(...)`) and render a graceful
> fallback instead of crashing the tree. It is the **no-globals counterpart** to opt-in `./capture`
> (Feature 013): where `./capture` is a single host-level global install for uncaught
> exceptions/rejections, this is **per-component, React-native, side-effect-free** error handling
> wired in ~3 lines — no `window` patches, no global listeners.
>
> **Constitution fit:** IV (framework support ships as an *additive, clearly-scoped* subpath that
> never pulls React into the core or displaces the framework-neutral path — React is a peer
> dependency), VIII (no global patches; these are explicit per-component handles over the host's
> already-configured runtime, never a `createLogger` side effect), III (must never break the page —
> a logging failure inside the boundary must not worsen the crash), V (error info routes through the
> same fail-closed redaction pipeline as any `log.error`). **Scope is React render-tree error
> handling only — no global capture (that is Feature 013) and no other framework adapters.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A render-tree crash becomes a logged event and a graceful fallback (Priority: P1)

A React developer wraps a part of their component tree in `<LogErrorBoundary>`, passing their
already-configured logger and (optionally) fallback UI. When any descendant component throws during
render, in a lifecycle method, or in a constructor, the boundary catches it, emits an `error`-level
event through the provided logger carrying the error and the React component stack, and renders the
fallback instead of letting the whole tree unmount into a blank screen.

**Why this priority**: This is the entire visible value and the MVP. A component crash that today
produces a white screen and a lost error becomes both **observable** (it reaches the app's
transports) and **survivable** (the rest of the app keeps running behind a fallback). Everything
else hardens or extends this core capability.

**Independent Test**: In a test app with a configured capturing transport, wrap a component that
throws on render in `<LogErrorBoundary logger={log}>`; confirm (a) an `error`-level event carrying
the error name/message/stack and the React component stack is delivered to the transport, and
(b) the boundary renders the provided fallback rather than propagating the crash.

**Acceptance Scenarios**:

1. **Given** a `<LogErrorBoundary>` with a configured logger, **When** a descendant throws during
   render, **Then** an `error`-level event with the serialized error and the React component stack
   is delivered to the configured transports, and the fallback is rendered.
2. **Given** a `<LogErrorBoundary>` wrapping a sibling subtree, **When** that subtree crashes,
   **Then** only the wrapped subtree is replaced by the fallback; components outside the boundary
   continue to render and function normally.
3. **Given** a caught error whose message or component stack contains a secret-shaped value,
   **When** it is logged, **Then** the secret is redacted/sanitized by the existing pipeline before
   any transport receives the event (fail-closed — same path as `log.error`).

---

### User Story 2 - Log the errors a boundary cannot catch — `useLogError()` (Priority: P2)

A function component obtains a stable `logError` callback from `useLogError()` and uses it to
report errors from the places React error boundaries inherently **cannot** catch — event handlers,
`setTimeout`/`Promise` callbacks, and async effects — routing them through the same logger and
secure pipeline as the boundary.

**Why this priority**: Error boundaries only catch errors thrown during render/lifecycle; the most
common runtime errors (a failed fetch in a click handler, a rejected promise in an effect) escape
them entirely. Without `useLogError()`, the feature would leave React's largest error gap
unobserved. It extends P1's value but is not required for the boundary itself to work.

**Independent Test**: Render a component using `useLogError()`, trigger an error inside an event
handler and inside an async callback, call `logError(err, context?)`, and confirm both produce
well-formed `error`-level events on the configured transport — proving errors outside the
render-catch surface are captured through the same path.

**Acceptance Scenarios**:

1. **Given** a component calling `useLogError()`, **When** an error is caught in an event handler
   and passed to `logError`, **Then** an `error`-level event carrying the serialized error is
   delivered to the configured transports.
2. **Given** the same hook, **When** `logError` is called from an async callback after the component
   has re-rendered, **Then** it still emits correctly and the returned callback identity is stable
   across renders (safe to use in dependency arrays).
3. **Given** an error passed to `logError` that contains a secret-shaped value, **When** it is
   emitted, **Then** it is redacted/sanitized by the existing pipeline before transport (fail-closed).

---

### User Story 3 - No globals, framework-neutral, additive subpath (Priority: P3)

These helpers are reached only through a dedicated, opt-in `./framework-react` subpath. Importing or
using them never patches `window`, attaches global listeners, or configures the runtime; React is a
**peer dependency** the host already provides, so the core package stays framework-neutral and no
React code ships in the core entry. The boundary and hook are cheap handles over the host's
already-configured logger, and duplicate-package-copy behavior is documented.

**Why this priority**: Principle IV requires framework support to be *additive and clearly scoped*
without displacing the neutral path, and Principle VIII forbids global patches and per-instance
side effects. This is the discipline that makes the React adapter safe to add — but the core
capability (US1) is demonstrable for a single consumer before the federation/neutrality contract is
fully exercised.

**Independent Test**: Confirm (a) the core `.` entry imports no React and exposes no React API;
(b) using `<LogErrorBoundary>`/`useLogError()` attaches no global `error`/`unhandledrejection`
listeners and patches no globals; (c) React is declared a peer dependency, not a runtime dependency;
(d) the documented public-subpath set and parity gate include `./framework-react`.

**Acceptance Scenarios**:

1. **Given** the core entry point, **When** it is imported, **Then** no React import is pulled in and
   no React-specific API is exported from `.`.
2. **Given** the React boundary/hook are used, **When** the tree renders and an error is caught,
   **Then** no global error/rejection listeners are attached and no globals are patched (errors flow
   only through the explicitly provided logger).
3. **Given** the federation contract, **When** a contributor reads it, **Then** it documents React
   as a peer dependency and the duplicate-package-copy behavior for this subpath.

---

### Edge Cases

- **Logging itself fails** (the provided logger/transport throws while the boundary is handling a
  crash): the failure MUST be swallowed and the fallback MUST still render — a logging failure must
  never escalate the original crash or break the page (Principle III).
- **The fallback UI itself throws**: behavior MUST be documented and safe (the error is not caught by
  the same boundary that is already rendering the fallback — React semantics — so it propagates to
  the next boundary up; the boundary MUST NOT enter an infinite catch/render loop).
- **No fallback provided**: a documented default is rendered (render nothing) rather than crashing or
  re-throwing.
- **Non-`Error` thrown value** (a thrown string/object): serialized safely into a well-formed event,
  never throwing.
- **Recovery / reset**: after catching, the boundary stays in its fallback state until an explicit,
  documented reset signal (e.g., changed reset keys or a reset callback) lets the wrapped tree
  re-mount; repeated identical crashes do not loop indefinitely.
- **Hook misuse**: `useLogError()` used where no logger is resolvable degrades safely (routes to the
  default `Noop` runtime, as an unconfigured logger does) and never throws; using it outside React's
  render is the consumer's contract violation and is documented.
- **No DOM / server-side rendering**: the boundary and hook are pure React constructs that work under
  SSR without touching browser globals; behavior is documented.
- **A caught event the redactor drops** (fail-closed): the event is dropped, not emitted partially;
  the fallback still renders. This is correct, not an error.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: **NEW opt-in `./framework-react` subpath** exporting a `<LogErrorBoundary>`
  component, a `useLogError()` hook, and their option/prop types. No change to any existing entry
  point, export, or behavior; the core `.` entry, `createLogger`, and all other subpaths are
  untouched and remain React-free.
- **Compatibility Impact**: Additive / backward compatible. Existing consumers are unaffected unless
  they explicitly import `./framework-react`.
- **Migration Notes**: None required. React consumers that want the capability add one import and
  wrap a subtree (~3 lines).
- **Deprecation & Migration**: No contract is deprecated or removed.
- **Host/Module Usage Impact**: The boundary/hook operate over a logger the consumer explicitly
  provides (a handle over the host's configured runtime) — never an ambient or global one. They are
  not a host-level global install (unlike `./capture`); any module may use them in its own subtree
  because they carry no global side effects. Duplicate-package-copy behavior is documented as
  **isolated** (each copy's helpers route through whatever logger they are handed).
- **Security & Privacy Considerations**: Caught React errors — whose messages, stacks, and component
  stacks can carry secrets, tokens, URLs with credentials, or PII — route through the **same
  fail-closed redaction + sanitization pipeline** as `log.error` before any transport sees them; if
  redaction fails the event is dropped (fail-closed). No new path emits unredacted data. The helpers
  MUST NOT log ambient component props/state automatically (no raw object dumping — Principle IV/V);
  any captured context is what the consumer explicitly supplies plus the React component stack.
- **Log Integrity Considerations**: Caught events are structured, machine-parseable `error`-level
  events with stable shape and origin attribution from the provided logger, distinguishable as
  React-boundary-sourced (so downstream monitoring can separate them from explicitly-logged errors
  and from global-capture events). The helpers do not reorder, dedupe, batch, or mutate
  normally-logged events.
- **Runtime Scale & Federated Deployment Impact**: Using `<LogErrorBoundary>`/`useLogError()` is **not**
  a per-`Logger` construction cost and attaches **no** globals, timers, or listeners — it is a React
  component/hook that calls `log.error` on a logger it is given. It does not violate the per-`Logger`
  construction constraints, and it is not the sanctioned host-level global install (that is
  `./capture`). Logger creation stays constant-cost and side-effect-free.
- **Supply-Chain / Distribution Impact**: Adds one new packaged subpath (`./framework-react` → new
  `exports` entry + built files) and **one new peer dependency on `react`** (provided by the
  consumer; NOT a runtime/bundled dependency, so the core install stays dependency-free). The
  documented distributed surface and the parity gate's public-subpath set (Feature 012) MUST be
  updated to include `./framework-react`. Attested publishing, signed tags, and DCO attribution are
  unchanged.
- **Verification & Enforcement**: Contract tests (boundary catches render/lifecycle errors and emits
  through the logger with component stack; `useLogError` emits for handler/async errors; redaction
  applied; events well-formed + attributed), failure-safety tests (logging failure does not break the
  fallback or the page; no catch/render loop; reset works), neutrality tests (core entry imports no
  React; React declared as peer not runtime dependency), and no-globals tests (using the helpers
  attaches no global listeners / patches no globals). The new subpath is verified by the
  distributed-surface parity gate (Feature 012) and bundle-budget gate. All checks run identically in
  CI and locally via the documented `npm` scripts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The package MUST expose an **opt-in `./framework-react` subpath** providing a
  `<LogErrorBoundary>` component and a `useLogError()` hook. They MUST be reached only through that
  dedicated subpath and MUST NEVER be a side effect of `createLogger`, `configureLogging`, or any
  per-`Logger` operation, and MUST NOT be exported from the core `.` entry.
- **FR-002**: `<LogErrorBoundary>` MUST catch errors thrown by its descendants during **render,
  lifecycle methods, and constructors** (React's error-boundary surface) and emit an `error`-level
  event through a logger **explicitly provided by the consumer**, carrying the serialized error
  (name, message, stack) and the **React component stack**.
- **FR-003**: After catching an error, `<LogErrorBoundary>` MUST render a consumer-supplied
  **fallback** in place of the crashed subtree; when no fallback is supplied it MUST render a
  documented default (render nothing) rather than re-throwing or crashing the page.
- **FR-004**: `useLogError()` MUST return a **stable callback** that logs an error (and optional
  consumer-supplied context) through the resolved logger as an `error`-level event — covering errors
  that boundaries cannot catch (event handlers, async/`Promise` callbacks, effects). The callback
  identity MUST be stable across re-renders (safe for dependency arrays).
- **FR-005**: Caught/logged errors MUST be **fail-closed**: they MUST pass the **same** redaction +
  sanitization pipeline that any `log.error` passes before a transport receives them, and if
  redaction/sanitization cannot complete the event MUST be **dropped** rather than emitted. The
  helpers MUST introduce **no path that bypasses** that pipeline. (They inherit exactly the
  pipeline's whole-value redaction; free-text substrings inside a message/stack are not
  substring-scrubbed — see Assumptions.)
- **FR-006**: The helpers MUST be **fail-safe** (Principle III): a failure inside the logging path
  (logger/transport throws) MUST be swallowed and routed to the runtime's internal-error diagnostic
  hook, MUST NOT escalate the original crash, and MUST NOT prevent the fallback from rendering. The
  boundary MUST NOT enter an infinite catch/render loop.
- **FR-007**: The helpers MUST attach **no global handlers and patch no globals** — no
  `window.onerror`, no `error`/`unhandledrejection` listeners, no monkey-patching. Errors flow only
  through the explicitly provided logger. (This is the no-globals contrast to Feature 013's
  host-level global install.)
- **FR-008**: `<LogErrorBoundary>` MUST support a documented **reset mechanism** (e.g., changed reset
  keys and/or a reset callback) that lets the wrapped subtree re-mount after a handled error, so a
  caught error is recoverable rather than permanently latched.
- **FR-009**: React MUST be declared a **peer dependency**, not a runtime/bundled dependency: the
  core package and all other subpaths MUST remain React-free and framework-neutral (Principle IV),
  and importing the core entry MUST NOT pull in React.
- **FR-010**: Caught/logged events MUST be **well-formed and attributed**: structured `error`-level
  events carrying the provided logger's configured identity and a stable marker distinguishing the
  source (React error boundary vs. `useLogError` vs. ordinary log) so they are separable downstream.
- **FR-011**: The helpers MUST behave safely in both degraded-logger cases, and the behavior of each
  MUST be documented: (a) when a logger **is** resolved but its runtime is **unconfigured**, emission
  routes to the default `Noop` runtime (no throw); (b) when **no** logger resolves at all (no
  `LoggerProvider` and no explicit override), the helper is a **safe no-op** — it performs no emission
  and never throws (it MUST NOT mint a fallback logger, which would couple the subpath to the core
  runtime). The helpers MUST NOT log ambient component props or state automatically; any captured
  context beyond the error and React component stack MUST be consumer-supplied.
- **FR-012**: Adding `./framework-react` MUST keep the **distributed surface honest**: the documented
  public-subpath set and the parity gate (Feature 012) MUST be updated so what ships matches what is
  documented, and the subpath MUST stay within its own documented bundle budget.

### Key Entities *(include if feature involves data)*

- **LogErrorBoundary**: A React error-boundary component that, on catching a descendant render/
  lifecycle error, emits a structured `error`-level event through a consumer-provided logger and
  renders a fallback. Supports an optional reset mechanism.
- **useLogError hook**: A hook returning a stable `logError(error, context?)` callback that emits an
  `error`-level event through the resolved logger — for errors outside the boundary's catch surface.
- **Caught React Error Event**: A structured `error`-level event derived from a caught/reported React
  error — serialized error (name, message, stack), React component stack, source marker, and the
  provided logger's identity — routed through the secure pipeline like any logged event.
- **Provided Logger (existing)**: The consumer-supplied `Logger` handle over the host's already-
  configured runtime; the helpers emit through it and never create or configure a runtime themselves.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a `<LogErrorBoundary>` over a configured logger, **100%** of triggered descendant
  render/lifecycle errors in the test suite are delivered to the configured transports as
  well-formed `error`-level events carrying the React component stack, **and** the fallback renders
  in place of the crashed subtree.
- **SC-002**: With `useLogError()`, **100%** of errors reported from event handlers and async
  callbacks in the test suite are delivered as well-formed `error`-level events.
- **SC-003**: A caught error carrying a **whole-value** secret is **masked** by the redaction pipeline
  before any transport receives it, and a caught event whose redaction **fails is dropped** (0
  delivered) — proving the helpers route through the same fail-closed redaction as any log, with no
  bypass.
- **SC-004**: A logging failure (logger/transport throwing) during error handling causes **0**
  page-breaking effects and **0** catch/render loops — the fallback still renders and no error
  propagates to page code.
- **SC-005**: Importing the core `.` entry pulls in **0** React modules and exposes **0** React APIs;
  React appears **only** as a peer dependency (0 runtime dependencies added).
- **SC-006**: Using `<LogErrorBoundary>`/`useLogError()` attaches **0** global error/rejection
  listeners and patches **0** globals.
- **SC-007**: After a documented reset signal, a previously-caught boundary re-mounts its wrapped
  subtree on **100%** of resets in the test suite (recovery works).

## Assumptions

- **Routing through the existing pipeline.** The helpers emit via `log.error` on the provided logger,
  reusing the same internal emit/dispatch path (sanitize → URL-scrub → redact → guard → SafeTransport)
  as any log — they introduce no parallel emission path or their own transports. This makes their
  redaction identical to any log's, by construction.
- **Redaction is whole-value, not substring.** As elsewhere in the package, the redactor masks
  whole-value secrets and drops on failure; it does not scrub arbitrary secret substrings embedded in
  a free-text message, stack, or React component stack. The guidance to keep secrets in structured
  attributes (not in thrown message strings) applies here too.
- **Explicit logger, not ambient.** The consumer provides the logger explicitly (e.g., as a prop /
  hook argument or via an explicit React context provider scoped to the consumer's app). Whether the
  hook resolves its logger from a prop, an argument, or a dedicated React context is settled in
  `/speckit-plan`; either way it is explicit and consumer-owned, never a global ambient lookup.
- **Error-boundary semantics are React's.** The boundary catches only render/lifecycle/constructor
  errors (not event handlers, async code, SSR rendering errors, or errors thrown in the boundary
  itself) — which is exactly why `useLogError()` exists to cover the gap. The default fallback is to
  render nothing; consumers supply their own fallback for a richer experience.
- **React as a peer dependency.** React is provided by the consumer (peer dependency), not bundled.
  The supported React range (hooks-capable, e.g. `>=16.8`, validated against current React) is fixed
  in `/speckit-plan`; the spec fixes that React must be a peer, not a runtime, dependency.
- **`error`-level emission.** Caught/reported errors are emitted at `error` level, always within the
  baseline production level filter, so the helpers are effective under production defaults.
- **No new runtime dependency.** The feature adds one subpath and one **peer** dependency (React);
  it adds no bundled runtime dependency and changes no existing public contract.
- **API shape settled in planning.** The exact `<LogErrorBoundary>` props (fallback, onError, reset
  keys/callback, logger provisioning), the `useLogError` signature, and the precise source-marker
  representation are settled in `/speckit-plan`; the spec fixes the required behavior.

## Dependencies

- **Existing configured-runtime + secure pipeline** (`configureLogging`, the dispatch pipeline,
  redactor/sanitizer, SafeTransport, internal-error hook, `Logger.error`) — present today; the
  helpers reuse them through the provided logger.
- **Feature 012 distributed-surface parity** — the new `./framework-react` subpath must be added to
  the documented public-subpath set so the parity gate stays green.
- **Principle VIII "explicit host-level global install" clause & Feature 013 (`./capture`)** — define
  the global-capture path this feature deliberately complements with a *no-globals, per-component*
  alternative; the two are distinct, both opt-in, and may be used together.
- **React (peer dependency)** — provided by the consuming application; the core package remains
  React-free.
