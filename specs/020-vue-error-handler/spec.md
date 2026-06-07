# Feature Specification: Vue Error-Handling Adapter + Composables (`./framework-vue`)

**Feature Branch**: `020-vue-error-handler`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Vue error-handling adapter + composables for a new opt-in `./framework-vue` subpath — the Vue counterpart to `./framework-react` (issue #18). Route Vue component-tree errors through the consumer's existing `Logger` secure pipeline via `logger.error`, no globals, side-effect-free."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - App-wide Vue errors reach my logs (Priority: P1)

A team already logs with `@tallyrow/safesignal`. Their Vue 3 app throws inside a component
render, a lifecycle hook, a watcher, or a template event handler — today that error surfaces in
the browser console (or a blank screen) but never reaches their transports. They want every such
error routed through their existing `Logger`, with no global monkey-patching and no change to how
the rest of their app logs.

**Why this priority**: This is the headline value of the feature and the issue's primary ask — an
`app.config.errorHandler` adapter. It is independently shippable: wiring just the adapter already
turns silent Vue framework errors into structured, redacted log events. Everything else builds on
the same emission path.

**Independent Test**: Assign the adapter (or install the plugin) on a Vue app whose child component
throws during render; assert exactly one `error`-level event is emitted through the provided
`Logger`, carrying the error and a Vue-source marker, with no global listener attached.

**Acceptance Scenarios**:

1. **Given** a `Logger` and a Vue app wired with the adapter, **When** a descendant component throws
   during render, **Then** one `error`-level event is emitted via that `Logger` with the error
   forwarded and `safesignal.source = 'vue-error-handler'`.
2. **Given** the adapter is wired via the plugin form, **When** the app is created, **Then** the
   logger is made available to descendant composables (provide/inject) and the app's error handler
   is set, with no other side effects.
3. **Given** the adapter is in place, **When** the consumer already had their own
   `app.config.errorHandler`, **Then** the factory form lets them compose (the consumer controls
   chaining); the adapter never silently swallows or replaces behavior the consumer did not opt into.

---

### User Story 2 - Report errors a framework handler can't catch (Priority: P2)

Within a component, a developer awaits a network call inside a `try/catch`, or attaches a native
`addEventListener` whose callback can throw — errors Vue's `errorHandler` does not observe. They
want a one-line, in-component way to route those caught errors through the same `Logger` and the same
redaction pipeline, without importing or threading the logger manually.

**Why this priority**: Closes the coverage gap left by the app-level handler (async/handler/native
errors). Valuable but secondary to capturing the framework's own errors; depends on the same
provide/inject logger resolution introduced in P1.

**Independent Test**: In a component's setup, obtain the report callback from the composable and call
it with a caught error; assert one `error`-level event is emitted with `safesignal.source =
'vue-use-log-error'` and any supplied attributes merged in; the same callback reference is stable
across re-renders.

**Acceptance Scenarios**:

1. **Given** a logger is available (provided or passed explicitly), **When** the report callback is
   invoked with an error and attributes, **Then** one `error`-level event is emitted via the resolved
   logger with `safesignal.source = 'vue-use-log-error'` and the attributes merged.
2. **Given** no logger is resolvable, **When** the callback is invoked, **Then** nothing is emitted
   and nothing throws (safe no-op).
3. **Given** the component re-renders, **When** the resolved logger is unchanged, **Then** the report
   callback keeps a stable identity (safe to use in dependency lists / as a handler reference).

---

### User Story 3 - Contain a subtree and recover (Priority: P3)

A developer wants a bounded region of the UI (a widget, a route view) where descendant errors are
captured, logged, and optionally replaced with a fallback — the Vue parallel of a React error
boundary — without letting that subtree's failure also be reported a second time by the app-level
handler.

**Why this priority**: A focused, recoverable boundary is a strong developer-experience win but is
additive on top of the app-level capture in P1; many apps will ship with just P1 + P2.

**Independent Test**: Place the boundary composable in a wrapper component around a child that throws;
assert the descendant error is logged once via the resolved logger with `safesignal.source =
'vue-error-captured'`, that by default the error does not also propagate to the app-level handler
(no double-log), and that the consumer's fallback path is invoked fail-safe.

**Acceptance Scenarios**:

1. **Given** a wrapper using the boundary composable around a throwing child, **When** the child
   throws, **Then** the error is logged once with `safesignal.source = 'vue-error-captured'` and, by
   default, does not propagate further (the app-level handler does not also log it).
2. **Given** the boundary is configured to keep propagating, **When** the child throws, **Then** the
   boundary logs it and still lets it reach the app-level handler.
3. **Given** the boundary's optional error callback throws, **When** an error is captured, **Then**
   the throw is swallowed and neither the logging nor the rest of the app is disrupted.

---

### Edge Cases

- **No logger resolvable** (no explicit override, no provided logger): every entry point is a safe
  no-op — no emission, no throw, no fabricated fallback logger.
- **The logging path itself throws** (`logger.error` raises): the throw is swallowed; the original
  error is never escalated and the app keeps running (fail-safe, Principle III).
- **A secret appears in the caught error** (token in message/stack): it is masked — or the event is
  dropped entirely — by the standard pipeline before any transport (fail-closed, Principle V); the
  adapter adds no bypass path.
- **Vue context is partially available** (no component instance, missing component name): Vue-context
  attributes (`safesignal.vue.info`, `safesignal.vue.componentName`) are best-effort — absent values
  are simply omitted, never guessed, and never cause a throw.
- **Duplicate package copies / multiple Vue apps**: each adapter/composable operates solely through
  its explicitly resolved logger; there is no shared module-global state, so multiple apps or
  duplicate copies stay isolated.
- **`vue` not installed**: the subpath is opt-in; consumers who never import it pay nothing, and the
  core entry and all other subpaths remain Vue-free.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: Adds a new opt-in subpath `@tallyrow/safesignal/framework-vue` exporting
  `createErrorHandler`, `safesignalErrorHandler` (a Vue plugin), `loggerKey` (a Vue injection key),
  `useLogError`, `useErrorCapture`, and the supporting types (`SafesignalErrorHandlerOptions`,
  `UseErrorCaptureOptions`). No change to the core `.` entry or any existing subpath.
- **Compatibility Impact**: Additive and backward compatible. New `exports` key, new optional peer
  dependency. Nothing existing changes shape or behavior.
- **Migration Notes**: None — purely additive. Consumers opt in by importing the new subpath.
- **Deprecation & Migration**: No contract is deprecated or removed.
- **Host/Module Usage Impact**: Adapter and composables resolve the `Logger` explicitly (passed in,
  or provided/injected within a Vue app) — never from a module global. Federated modules and host
  apps each wire their own; no implicit shared runtime is introduced.
- **Security & Privacy Considerations**: All emission flows through `Logger.error`, so messages,
  error stacks, the Vue `info` string, and any consumer attributes pass the existing sanitize →
  URL-scrub → redact (drop-on-failure) → guard pipeline before transport. No new data path and no
  bypass. Props, state, and component data are **not** auto-captured. Fail-closed and fail-safe by
  default.
- **Log Integrity Considerations**: Events are ordinary structured `error`-level events,
  machine-parseable and origin-attributable. They carry a `safesignal.source` marker
  (`vue-error-handler` / `vue-use-log-error` / `vue-error-captured`) so Vue-originated errors are
  separable from `./capture` events and ordinary logs. No drop/sample/batch/reorder behavior beyond
  the pipeline's existing fail-closed drop.
- **Runtime Scale & Federated Deployment Impact**: No per-`Logger` cost is added; the adapter/
  composables open no transports, start no timers, attach no global listeners, patch no globals, and
  read no ambient browser state. `vue` is an externalized optional peer — duplicate package copies are
  **isolated** (no shared module-global state).
- **Supply-Chain / Distribution Impact**: Adds one `exports` entry and one **optional peer**
  dependency (`vue >=3.0.0`); `dependencies` stays empty; packaged files stay `["dist"]`. The
  subpath bundle externalizes `vue` and stays vendor-neutral. Attested publishing, signed tags, DCO
  attribution, and distributed-surface parity are unchanged. No CI-workflow or constitution change.
- **Verification & Enforcement**: Every gate this feature adds is guarded by a fail-closed test run
  identically in CI and locally via `npm run verify` (build → typecheck → lint → format:check → test
  → api:check) plus `npm run surface:check`. Test code under `tests/` is held to `src/` standards.
  Mapping of gate → enforcing test is in the contract (`contracts/framework-vue.md`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-V1 (app-level adapter)**: The subpath MUST provide a side-effect-free factory that, given a
  `Logger`, returns a Vue error-handler function suitable for `app.config.errorHandler`; when invoked
  it MUST emit one `error`-level event via that logger, forwarding the error.
- **FR-V2 (plugin install)**: The subpath MUST provide a Vue plugin form that, given a `Logger`, wires
  the app's error handler to the factory's handler AND makes the logger resolvable by descendant
  composables (provide/inject), with no other side effects.
- **FR-V3 (manual report composable)**: The subpath MUST provide a composable that returns a callback
  emitting an `error`-level event via the resolved logger, for errors the framework handler cannot
  catch. The callback identity MUST be stable across re-renders for a fixed resolved logger.
- **FR-V4 (subtree boundary composable)**: The subpath MUST provide a composable that captures
  descendant errors (Vue's error-captured lifecycle), logs each once via the resolved logger, and by
  **default stops further propagation** so the app-level handler does not also log it; an opt-out MUST
  let the error keep propagating. It MUST support an optional, fail-safe consumer error callback.
- **FR-V5 (logger resolution)**: For every entry point, logger resolution MUST be: explicit override
  first, otherwise the provided/injected logger. When neither resolves, the entry point MUST be a safe
  no-op (no emission, no throw) and MUST NOT fabricate a fallback logger.
- **FR-V6 (fail-closed emission)**: All emission MUST go through `Logger.error(message, attributes,
  error)` — the same sanitize → URL-scrub → redact (drop-on-failure) → guard pipeline as any log. No
  bypass path. A secret in the message/stack/Vue-info MUST be masked, or the event dropped, before any
  transport.
- **FR-V7 (fail-safe)**: A throw inside the logging path (or a consumer callback) MUST be swallowed and
  MUST NOT escalate the original error or disrupt the app.
- **FR-V8 (no globals)**: The helpers MUST attach no global listeners, patch no globals
  (`window.onerror`, `addEventListener`, console, etc.), start no timers, and read no ambient state.
  Errors flow only through the explicitly resolved logger and Vue's own per-app error hooks.
- **FR-V9 (source-marked + Vue context)**: Emitted events MUST carry `attributes['safesignal.source']`
  equal to `'vue-error-handler'` | `'vue-use-log-error'` | `'vue-error-captured'`. Where derivable,
  events SHOULD carry best-effort `safesignal.vue.info` (Vue's error info string) and
  `safesignal.vue.componentName`; missing values are omitted. Consumer-supplied attributes merge in;
  props/state are NOT auto-captured.
- **FR-V10 (vue peer, core neutral)**: `vue` MUST be an externalized **optional peer** (`>=3.0.0`);
  the core `.` entry and every other subpath MUST import zero Vue and expose no Vue API. The subpath
  bundle MUST externalize `vue` (not inline its source) and remain vendor-neutral.
- **FR-V11 (honest surface)**: `./framework-vue` MUST be added to the documented public-subpath set
  and the distributed-surface parity gate; `dependencies` MUST stay empty and packaged files
  `["dist"]`.
- **FR-V12 (verification parity)**: Every gate this feature documents MUST be paired with a
  machine-executable, fail-closed enforcement mechanism that yields the same verdict in CI and locally
  for the same source state. Test code under `tests/` MUST meet `src/` typing/lint/build/import
  standards.

### Key Entities

- **App-level error handler**: A function derived from a `Logger` and assigned to a Vue app's error
  handler; emits a source-marked `error` event per framework error.
- **Logger injection key**: The token by which the plugin provides, and composables inject, the
  consumer's `Logger` within a Vue app — the Vue parallel of React's logger context.
- **Manual report callback**: A stable per-resolved-logger function that emits a source-marked `error`
  event for a caught error plus optional attributes.
- **Subtree boundary**: A per-component capture of descendant errors that logs once and controls
  propagation; the Vue parallel of a React error boundary.
- **Caught Vue error event**: The structured, post-pipeline `error`-level event carrying the
  serialized error, the source marker, and best-effort Vue context attributes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Vue 3 app wired with the adapter routes 100% of framework errors it observes
  (render/lifecycle/watcher/template-handler) to the consumer's `Logger` as `error`-level events,
  verified by automated contract + integration tests.
- **SC-002**: A secret-shaped value in a caught Vue error never reaches a transport in clear text —
  it is masked or the event is dropped — verified by an automated fail-closed security test.
- **SC-003**: When the logging path or a consumer callback throws, the app continues running and the
  fallback/host behavior is unaffected in 100% of the tested failure cases (no escalation, no loop).
- **SC-004**: The default `.` entry and every non-Vue subpath contain zero Vue references and the Vue
  subpath bundle externalizes `vue`, verified by automated bundle-shape + import-boundary tests.
- **SC-005**: The public surface of `./framework-vue` is locked by automated contract tests (exports
  present, shapes correct, source markers exact).
- **SC-006**: Runtime failures (missing logger, partial Vue context, unavailable transport) degrade
  safely without breaking normal browser interaction, verified by automated tests.
- **SC-007**: Documentation and examples for the new subpath model safe logging and stay accurate for
  both factory and plugin integration paths, with no Vue 2 / global-capture / props-dump guidance.

## Assumptions

- **Vue 3 only.** The adapter targets Vue 3's app-level error handler and Composition API; Vue 2 (EOL,
  different app model) is out of scope. Peer range `vue >=3.0.0`, optional.
- **Consumer provides the `Logger`.** The subpath never creates or discovers a logger; it is passed to
  the factory/plugin or provided/injected within the app. No logger ⇒ safe no-op.
- **Boundary default = stop propagation.** The subtree boundary returns "handled" by default to avoid
  double-logging with the app-level handler; consumers can opt back into propagation.
- **No auto-capture of application data.** Props, component state, and route/store data are never
  captured automatically; only the error, the Vue `info` string, and a best-effort component name.
- **Mirrors `./framework-react`.** Behavior, fail-closed/fail-safe guarantees, source-marker
  convention, and the no-globals stance follow the shipped React adapter (feature 018) precisely.
- **No new runtime dependency, no constitution change, no CI-workflow change.** Additive subpath only.
