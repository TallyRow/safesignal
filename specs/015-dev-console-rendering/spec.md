# Feature Specification: Developer-Friendly Dev-Mode Console Rendering

**Feature Branch**: `015-dev-console-rendering`

**Created**: 2026-06-01

**Status**: Draft

**Input**: GitHub issue #14 — "feat: developer-friendly dev-mode console rendering" (roadmap V2)

> **Why this exists (visible developer value).** Today the built-in `ConsoleTransport` hands devtools
> the log message plus the structured event object — correct and safe, but a wall of JSON to scan
> during local development. This feature makes the **already structured / redacted / trace-correlated**
> events render **beautifully in development** — grouped, colorized, with level icons, context, and a
> clickable/identifiable trace link — so a developer can see what happened at a glance. **Production is
> unchanged** (the current structured form) and pays **zero runtime cost** for the pretty path.
>
> **Constitution fit:** a dev-only **sibling** console transport (a dedicated `./dev-console` subpath,
> selected only in development) — **not** a modification of the existing `ConsoleTransport`, which stays
> byte-unchanged. It renders only the post-pipeline, sanitized+redacted event, never re-serializing app
> objects (Principle IV structured-only); attaches **no** global listeners and reads no ambient state
> (Principle VIII); fail-safe (Principle III).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A developer reads logs at a glance in development (Priority: P1)

A developer runs their app locally with `environment: 'development'` and a console-based transport.
Instead of `message {…big JSON…}`, devtools shows a **scannable** entry: a level icon + color, the
message, the application/module/environment, the attributes laid out readably, the error name/message
with a readable stack, and a trace link when a trace context is present — grouped so noise collapses.

**Why this priority**: This is the entire visible value and the MVP. The structured event already
contains everything; the win is presenting it for fast human scanning during local debugging.

**Independent Test**: With `environment: 'development'`, emit events at each level (and one with an
error and one with a trace context) through the dev console transport (the `./dev-console` subpath, not
the default `ConsoleTransport`); confirm the output is the human-friendly rendering (grouping, level
styling, context, trace link) rather than the raw structured form.

**Acceptance Scenarios**:

1. **Given** a development environment, **When** an event is emitted, **Then** devtools shows a
   grouped, level-styled rendering with the message, context (app/module/env), and attributes laid
   out readably.
2. **Given** a development environment and an event with an error, **When** it is emitted, **Then**
   the error name/message and a readable stack are shown.
3. **Given** a development environment and an event carrying a trace context, **When** it is emitted,
   **Then** a clickable/identifiable trace link (derived from the event's trace ids) is shown.

---

### User Story 2 - Production output and cost are unchanged (Priority: P2)

In production (or any non-development environment), the console output stays exactly the current
structured form (the message plus the structured event object), and the pretty-rendering path is not
executed — production pays no added per-event cost.

**Why this priority**: The package's bundle and runtime discipline is non-negotiable; a dev nicety
must not change production behavior or cost. Essential, but it constrains the P1 win rather than
adding new value.

**Independent Test**: With `environment: 'production'`, emit events; confirm the output is identical
to today's `ConsoleTransport` behavior and the pretty-rendering code path does not run.

**Acceptance Scenarios**:

1. **Given** a non-development environment, **When** an event is emitted, **Then** the console output
   is the current structured form (message + structured event), unchanged.
2. **Given** a non-development environment, **When** events are emitted at volume, **Then** per-event
   cost is equivalent to today's `ConsoleTransport` (the pretty path is not taken).

---

### User Story 3 - The pretty renderer is safe and degrades gracefully (Priority: P3)

The renderer is invisible except for what it prints. It consumes only the already sanitized/redacted
event (no re-serialization of arbitrary app objects, no secret leakage), reads no ambient state,
attaches no globals, never throws into the page, and falls back to the structured form where rich
console features (grouping/styling) are unavailable.

**Why this priority**: Principles IV (structured-only), V (secure-by-default), VIII (no globals/
ambient), and III (fail-safe) all bind here. Necessary for correctness; it hardens the P1 capability.

**Independent Test**: Confirm the renderer only reads the event passed to it; that a secret fixture in
the (already-redacted) event does not appear unredacted; that with `console.group`/styling unavailable
it falls back to the structured form without throwing; and that it attaches no global listeners.

**Acceptance Scenarios**:

1. **Given** an event that has passed the pipeline, **When** it is pretty-rendered, **Then** the
   renderer reads only that event and does not re-serialize or fetch any other application state.
2. **Given** an environment without `console.group`/styling support, **When** an event is emitted in
   development, **Then** the renderer falls back to the structured form and never throws.
3. **Given** any emission, **When** the renderer runs, **Then** it attaches no global listeners and
   reads no ambient browser/host state.

---

### Edge Cases

- **Rich-console features absent** (Node, SSR, minimal consoles without `console.group`/`%c`): fall
  back to the structured form; never throw.
- **No trace context / no error / empty attributes**: render cleanly without empty sections or a
  trace link; no placeholder noise.
- **An environment string that is neither clearly dev nor prod** (e.g. `'staging'`, unknown): treated
  as non-development (production form) by default — pretty rendering is opt-in to "development".
- **Very large attribute sets / long strings**: already bounded by the sanitizer before the transport;
  the renderer must not re-expand or re-walk beyond the bounded event.
- **A console method that throws** (instrumented/overridden console): swallowed fail-safe; never
  propagates to the page.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: Adds a **new opt-in dev subpath** exporting a dev console transport factory
  (a pretty-rendering alternative to the default `ConsoleTransport`, for use in development). No
  existing export is removed or changed; the default `ConsoleTransport` and its production behavior are
  preserved.
- **Compatibility Impact**: Additive / backward compatible. Consumers see richer dev output; nothing
  changes in production.
- **Migration Notes**: One dev-only line in the consumer's setup — select the dev transport in
  development (e.g. `import.meta.env.DEV ? DevConsoleTransport() : ConsoleTransport()`). Nothing
  changes in production.
- **Deprecation & Migration**: Nothing deprecated or removed.
- **Host/Module Usage Impact**: None. The renderer is a console-output concern; it does not touch the
  runtime, federation, or per-`Logger` cost.
- **Security & Privacy Considerations**: The renderer consumes **only** the post-pipeline event, which
  is already sanitized + redacted; it MUST NOT re-serialize arbitrary application objects, fetch
  ambient state, or introduce any new unredacted output. Trace links are built only from the event's
  existing trace ids (carry-only). No new sensitive-data path.
- **Log Integrity Considerations**: Console rendering is a presentation concern; it MUST NOT drop,
  reorder, dedupe, or mutate events, and MUST NOT alter what other transports receive. The structured
  event remains available/inspectable (the pretty form is in addition to, not a lossy replacement of,
  the structured data in dev).
- **Runtime Scale & Federated Deployment Impact**: No per-`Logger` cost; the renderer runs per event
  at the console transport only, in development. Production incurs no pretty-path cost.
- **Supply-Chain / Distribution Impact**: Adds **one new packaged subpath** (the dev console
  transport) → the documented distributed surface + the Feature 012 parity gate are updated in
  lockstep; the default `.` entry and its gzip budget are **unchanged**. **No new runtime dependency.**
  Attested publishing, signed tags, DCO, and pins are unchanged.
- **Verification & Enforcement**: Contract tests (dev rendering vs production form per environment),
  security tests (only the redacted event is rendered; no re-serialization; trace-link carry-only),
  failure-safety tests (graceful degradation; never throws), and the relevant bundle-size gate (the
  default-entry budget, and/or the parity gate if a subpath is added). All run identically local/CI.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: In a **development** environment, console output MUST be rendered human-friendly —
  grouped, level-colorized/iconed, with the message, context (application/module/environment),
  attributes laid out readably, the error name/message + a readable stack, and a clickable/
  identifiable trace link when a trace context is present.
- **FR-002** *(behavior angle)*: In **non-development** environments, console output MUST remain the
  **current structured form** (message + structured event object), unchanged, and the pretty-rendering
  path MUST NOT run. (FR-007 covers the per-event *cost* of this; FR-010 covers the *delivery mechanism*
  that makes it free.)
- **FR-003**: The dev-vs-non-dev decision MUST be driven by the **consumer's configured environment**
  (available on the event at render time), so a consumer of the **shipped** package gets dev rendering
  in their own development environment (the decision is runtime, not SafeSignal's build flag).
- **FR-004**: The renderer MUST consume **only** the already sanitized + redacted event delivered to
  the transport; it MUST NOT re-serialize arbitrary application objects, walk beyond the bounded
  event, or introduce any new unsanitized/unredacted output (structured-only — Principle IV/V).
- **FR-005**: The renderer MUST NOT attach global listeners, patch globals, or read ambient browser/
  host state (Principle VIII); it operates solely on the event passed to `send()`.
- **FR-006**: The renderer MUST **degrade gracefully** where rich console features (grouping/styling)
  are unavailable — falling back to the structured form — and MUST NEVER throw into the page
  (fail-safe — Principle III).
- **FR-007** *(runtime-cost angle)*: The feature MUST add **zero production runtime cost**: in a
  non-development environment the pretty-rendering code path MUST NOT execute, and per-event production
  cost MUST be equivalent to today's `ConsoleTransport`. (This is the *cost* guarantee behind FR-002's
  behavior; FR-010 is what removes the renderer from the production bundle entirely.)
- **FR-008**: The feature MUST NOT change production output, the public contract of existing exports,
  redaction/sanitization behavior, or any transport-security contract.
- **FR-009**: Trace links MUST be derived **only** from the event's existing trace context (carry-only;
  no ids minted) and MUST NOT expose secrets.
- **FR-010** *(delivery-mechanism angle)*: The dev renderer MUST ship as a **dedicated opt-in subpath**
  (not in the default `.` entry), so the default-entry bundle and its gzip budget are **unchanged** and
  a consumer's production build excludes the renderer entirely (genuine zero production cost — this is
  the *mechanism* that makes FR-002/FR-007 hold via consumer-side tree-shaking). The new subpath MUST
  be added to the documented public-subpath set and pass the Feature 012 distributed-surface parity
  gate. No new runtime dependency.

### Key Entities *(include if feature involves data)*

- **Rendered Console Entry (dev)**: The human-friendly presentation of a single post-pipeline
  `LogEvent` — level icon/color, message, context (app/module/environment), readable attributes,
  error (name/message/stack), and a trace link — produced only in a development environment.
- **LogEvent (existing, unchanged)**: The post-pipeline, sanitized + redacted event the renderer
  consumes (message, level, attributes, context incl. trace, error, timestamp). The renderer reads it;
  it does not modify it or what other transports receive.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a development environment, **100%** of emitted events render in the human-friendly
  form (grouped + level-styled + context), and an event with a trace context shows a trace link.
- **SC-002**: In a non-development environment, console output is **byte-for-byte equivalent** to
  today's `ConsoleTransport` behavior (no pretty path taken).
- **SC-003**: A secret fixture present in the (already-redacted) event appears **0** times unredacted
  in the rendered dev output, and the renderer re-serializes **no** application object beyond the
  bounded event.
- **SC-004**: With rich console features unavailable, **100%** of dev emissions fall back to the
  structured form and **0** throw.
- **SC-005**: The renderer attaches **0** global listeners and performs **0** ambient-state reads.
- **SC-006**: The default `.` entry's bundle is **unchanged** (the dev renderer ships only in its own
  subpath), a consumer's production build that selects the default `ConsoleTransport` includes **0**
  renderer bytes, and the new subpath passes the Feature 012 parity gate.

## Assumptions

- **Dev is "development".** "Development" is the consumer's configured `environment === 'development'`;
  unknown/other environment strings default to the production (structured) form. The pretty path is
  opt-in to development, never the production default.
- **Renders the post-pipeline event only.** The event reaching the transport is already sanitized +
  redacted + bounded; the renderer presents that safe event and never re-serializes arbitrary app
  state — so the "beautiful" rendering carries no new leakage risk.
- **Browser-first, graceful elsewhere.** Rich rendering targets browser devtools (`console.group`,
  styling); Node/SSR/minimal consoles get the structured fallback. Never throws.
- **No new dependency.** The renderer uses only the platform console and the event; it adds no runtime
  dependency.
- **Presentation, not transport semantics.** This changes only how the console transport *presents*
  events in dev; it does not change which events are emitted, their order, redaction, or what any
  other transport receives.
- The delivery mechanism is **resolved (Option B: a dedicated opt-in dev subpath)**. The exact subpath
  name + dev transport factory shape and the dev rendering layout (grouping shape, icons, colors,
  trace-link format) are settled in `/speckit-plan`; the spec fixes the required behavior and
  guarantees.

## Dependencies

- **Existing `ConsoleTransport` + the pipeline** (the post-pipeline event, the `environment` on the
  event context, the trace context from Feature 008/009) — present today; this feature renders that
  event.
- **Feature 012 distributed-surface parity** — engaged **only if** the chosen delivery adds a new
  packaged subpath (then `./<subpath>` is added to the documented set + parity gate).
- **Delivery mechanism — RESOLVED (Option B: dedicated opt-in dev subpath).** The dev renderer ships
  as a **dedicated opt-in subpath** — a dev console transport factory the consumer selects only in
  development (e.g. `import.meta.env.DEV ? DevConsoleTransport() : ConsoleTransport()`). This is the
  only option that delivers **genuine zero production cost**: the consumer's bundler dead-code-
  eliminates the dev branch from their production build (zero bytes, zero runtime), which an
  in-`ConsoleTransport` mode or an option **cannot** achieve — their renderer code is entangled with
  the production transport and cannot be tree-shaken out of the consumer's prod bundle. It also keeps
  SafeSignal's default `.` entry and its gzip budget pristine, matches the package's
  subpath-for-everything pattern, and exercises the Feature 012 parity gate. The exact subpath name +
  factory shape are settled in `/speckit-plan`.
