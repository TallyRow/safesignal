# Feature Specification: Readable, Source-Mapped Error Stacks

**Feature Branch**: `017-readable-error-stacks`

**Created**: 2026-06-02

**Status**: Draft

**Input**: GitHub issue #16 — "feat: readable, source-mapped error stacks" (roadmap V4)

> **Why this exists (visible developer value).** A raw browser error stack is a wall of noise — minified
> symbols, framework internals, `node_modules`, SafeSignal's own frames, inconsistent per-engine
> formatting. This feature, when opted in, turns that into a **framed, trimmed, readable** stack: parsed
> into structured frames (function / file / line / column), with noise frames removed, and — when the
> consumer supplies a **source-map resolver** — minified production frames mapped back to original source
> positions. The developer reads a clean, relevant trace instead of decoding minified soup. **Off by
> default.**
>
> **Constitution fit:** configured once at the **runtime level**, never at `Logger` creation (VIII); any
> source-map resolution work is **isolated and fail-safe** — it never throws into the page and never
> breaks logging (III); **no secret leakage** — each frame's file/URL is scrubbed like any other field,
> so tokens in a source URL never ride along (V); and it renders only the already-safe, structured event
> (IV).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A developer reads a clean, trimmed stack (Priority: P1)

A developer enables stack normalization. When an error is logged, its stack is parsed into ordered
**frames** (function, file, line, column) with noise removed (engine/runtime internals, `node_modules`,
SafeSignal's own frames, anonymous boilerplate) per a documented policy — so the delivered error carries
a readable, relevant trace instead of a raw multi-line blob.

**Why this priority**: This is the headline visible value and the MVP — it works with **no** source maps
and **no** async, purely by parsing and trimming the stack the browser already produced.

**Independent Test**: With normalization enabled, log an error with a noisy multi-line stack; confirm the
delivered error carries an ordered, trimmed list of structured frames (and/or a readable stack string),
with the documented noise frames removed.

**Acceptance Scenarios**:

1. **Given** normalization enabled, **When** an error with a multi-line stack is logged, **Then** the
   delivered error carries ordered structured frames (function/file/line/column).
2. **Given** a stack containing `node_modules`, engine-internal, and SafeSignal-own frames, **When** it is
   normalized, **Then** those noise frames are removed per the documented trimming policy.
3. **Given** an unparseable or empty stack, **When** normalization runs, **Then** it falls back safely to
   the original stack (no frames invented, nothing thrown).

---

### User Story 2 - Minified production frames map back to source (Priority: P2)

A developer running minified production code supplies a **source-map resolver** (a function that maps a
minified `{ file, line, column }` to the original `{ file, line, column, name }`). When an error is
logged, frames are resolved back to original source positions, so a production error reads against the
original source instead of `main.abc123.js:1:48201`.

**Why this priority**: High value for production triage, but it depends on the consumer supplying maps
and on the resolution model (sync vs async — see Dependencies). The trimmed-frames MVP (P1) already
delivers value without it.

**Independent Test**: With a resolver supplied, log an error whose frames reference a minified file;
confirm the delivered frames carry the original (resolved) source positions, and that a frame the
resolver cannot map is left as its original (un-resolved) position.

**Acceptance Scenarios**:

1. **Given** a source-map resolver and an error with minified frames, **When** it is logged, **Then** the
   resolved frames carry original source file/line/column (and name when available).
2. **Given** a resolver that cannot map a particular frame (returns nothing / fails for it), **When** the
   error is logged, **Then** that frame is left as its original position — the rest still resolve.
3. **Given** a (synchronous) resolver that **throws** for a frame, **When** resolution runs, **Then** the
   failure is isolated per-frame and the error is delivered with un-resolved (but still normalized/trimmed)
   frames.

---

### User Story 3 - Normalization is safe, isolated, and invisible until enabled (Priority: P3)

The capability is off by default and, once enabled, never harms the page: it never throws, frame text
(file paths / URLs) is scrubbed so a secret in a source URL cannot leak, any resolution work is isolated
(it never blocks rendering or navigation and never breaks delivery), output is bounded (frame count /
string lengths), and creating loggers does no work.

**Why this priority**: Principles V (no secret leakage / off by default), III (fail-safe, never blocks),
and VIII (runtime-level, no per-`Logger` cost) all bind here. Necessary for correctness; it hardens
P1/P2.

**Independent Test**: Confirm disabled = no change; a frame whose file is a URL with a secret query param
shows that value scrubbed; a throwing parser/resolver is swallowed and the error still delivers; and
creating many loggers adds no per-logger cost.

**Acceptance Scenarios**:

1. **Given** normalization **disabled** (the default), **When** errors are logged, **Then** behavior,
   output, and cost are identical to today — no frames, no resolution.
2. **Given** a frame whose file is `https://app.example/p?token=SECRET`, **When** it is normalized, **Then**
   the rendered frame's file/URL has the sensitive value scrubbed (no secret in any frame text).
3. **Given** a parser or resolver that throws, **When** an error is logged, **Then** the failure is
   swallowed (routed to the diagnostics hook) and the error event is still delivered.
4. **Given** any emission, **When** normalization runs, **Then** it attaches no global listeners, reads no
   ambient state, and adds no per-`Logger` cost.

---

### Edge Cases

- **Unparseable / non-standard / empty stack**: fall back to the raw stack string; never invent frames,
  never throw.
- **Cross-engine stack formats** (V8 `at fn (file:line:col)`, Firefox/Safari `fn@file:line:col`): the
  parser handles the common shapes; an unrecognized line is preserved or dropped per the documented
  policy, never crashes.
- **A frame's file is a URL carrying a secret** (query/fragment token): the file/URL is scrubbed before
  the frame is emitted.
- **Resolver throws**: isolated and fail-safe (per-frame); that frame is left un-resolved and the error is
  delivered with the remaining (still trimmed) frames. (The resolver is synchronous — there is no async
  reject/hang; a slow sync resolver is the consumer's responsibility, see FR-008.)
- **Very deep stack / very long frame strings**: frame count and per-frame string lengths are bounded so
  the enrichment cannot inflate an error event without limit.
- **A trimming policy that would remove every frame**: keep at least the most relevant frame(s) rather
  than emitting an empty list, OR fall back to the raw stack (documented).
- **The error has no stack at all** (non-`Error` thrown value): nothing to normalize — no frames added.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: Adds an **opt-in, runtime-level** stack-normalization capability (off by
  default), an optional **source-map resolver** hook the consumer supplies, and the documented structured
  shape of the **frames** that appear on a normalized error. No existing export is removed or changed;
  the existing `error.stack` string and event shapes are unchanged when the feature is disabled. The
  source-map resolver the consumer supplies is **synchronous** (RESOLVED Option A). *(The exact delivery
  surface — a dedicated subpath vs. a core runtime option — is settled in `/speckit-plan`; a subpath is
  recommended.)*
- **Compatibility Impact**: Additive / backward compatible. Disabled by default → no consumer sees any
  change until they opt in.
- **Migration Notes**: One opt-in step at runtime configuration to enable normalization (plus an optional
  resolver for source maps); nothing changes for consumers who do not enable it.
- **Deprecation & Migration**: Nothing deprecated or removed.
- **Host/Module Usage Impact**: Configured once at the runtime level (host-owned); federated modules do
  not each configure it. Creating loggers does no normalization work.
- **Security & Privacy Considerations**: Frame text is treated as potentially sensitive. Because frames
  ride in `attributes`, the existing pipeline applies its **whole-value** guarantee: a frame `file` that is
  a **URL** has sensitive query/fragment params scrubbed (URL-scrub), and whole-value secret-shaped frame
  values are redacted. (A secret embedded as a substring of a non-URL path is not scrubbed, as for any
  `message` text — the redactor is anchored whole-value.) The resolver receives only already-derived frame
  positions, not raw application state. **No new sensitive-data path**; off by default.
- **Log Integrity Considerations**: Normalization is an **additive, documented enrichment** of the
  **error** event (structured frames / a cleaned stack). It MUST NOT drop, reorder, dedupe, or mutate
  other events. The original `error.stack` string remains available, unchanged (frames are purely
  additive; no replace-stack mode in v1). With the resolved synchronous model (Option A), each error is
  delivered **exactly once, synchronously** — no deferral, no duplication, no out-of-order enrichment — so
  there is no new timing or duplication semantics for downstream monitoring to account for.
- **Runtime Scale & Federated Deployment Impact**: Normalization runs per **error** event at the runtime
  level only; **no** per-`Logger` cost (no work at `Logger` creation). Resolution is synchronous + bounded.
  Duplicate-package-copy behavior is documented (each runtime normalizes independently — **isolated**).
- **Supply-Chain / Distribution Impact**: **No new runtime dependency** — the package parses/trims stacks
  itself and does **not** bundle a source-map library; source-map *data and resolution* are
  consumer-provided. If delivered as a new subpath, the documented distributed surface + the Feature 012
  parity gate are updated in lockstep; if delivered as a core runtime option, the default `.` entry's
  bundle-invariance budget is addressed (re-baseline with justification) — see Dependencies. Attested
  publishing, signed tags, DCO, and pins are unchanged.
- **Verification & Enforcement**: Contract tests (frame parsing/trimming across engine formats; resolved
  vs un-resolved frames; disabled = no change), security tests (no secret in any frame text; only
  post-safe data), failure-safety tests (throwing/rejecting parser/resolver swallowed; error still
  delivered; never blocks), integrity tests (other events untouched), and scale/no-per-`Logger`-cost
  tests. All run identically locally and in CI through the existing `npm` scripts, plus the relevant
  bundle gate (default-entry budget and/or the parity gate, per the chosen delivery).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The capability MUST be **opt-in and OFF by default**. While disabled, no stack is parsed, no
  frames are produced, and behavior, output, and per-event cost are **identical** to today.
- **FR-002**: When enabled, an error's stack MUST be **parsed into ordered structured frames** — function
  name, file/URL, line, and column — for the common browser/runtime stack formats (V8 and
  Firefox/Safari styles at minimum).
- **FR-003**: Frames MUST be **trimmed** per a documented policy that removes noise — engine/runtime
  internals, `node_modules`, SafeSignal's own frames, and anonymous boilerplate — while preserving the
  application-relevant frames (and never producing an empty result where a non-empty trimmed result is
  possible; otherwise fall back to the raw stack).
- **FR-004**: The normalized result MUST be attached to the **error** event as a **documented,
  machine-parseable** structured shape (the frame list), **additive** to the existing `error` — the
  original `error.stack` string MUST remain available, unchanged (frames are purely additive; there is no
  replace-stack mode in v1).
- **FR-005**: Frame text MUST carry the **same** scrubbing/redaction guarantee the rest of the pipeline
  provides — because frames ride in `attributes`: a frame `file` that is a **URL** has its sensitive
  **query/fragment params scrubbed** (the existing URL-scrub), and any **whole-value** secret-shaped frame
  value is redacted. (A secret embedded as a *substring* of a non-URL file path is not scrubbed, exactly as
  for `message` text today — the redactor is anchored whole-value.) Enabling normalization MUST NOT
  introduce any **new** unsanitized/unredacted path; the resolver receives only frame positions, not raw
  application state.
- **FR-006**: A consumer MAY supply an optional **synchronous source-map resolver** that maps a frame's
  minified `{ file, line, column }` to an original `{ file, line, column, name? }` (RESOLVED Option A — a
  sync lookup over the consumer's already-loaded in-memory maps; SafeSignal performs no async I/O and does
  not fetch `.map` files). When supplied, frames MUST be resolved to original positions inline before
  delivery; a frame the resolver cannot map (returns nothing) MUST be left as its original position
  (partial resolution is allowed).
- **FR-007**: All normalization and resolution MUST be **fail-safe** (Principle III): a throwing/rejecting
  parser or resolver MUST be isolated and routed to the diagnostics hook, MUST NOT throw into the page,
  and MUST NOT prevent the error from being delivered (it is delivered with the un-resolved / un-trimmed
  fallback as needed).
- **FR-008**: SafeSignal MUST add **no async work and no I/O** for resolution (RESOLVED Option A): the
  resolver is invoked **synchronously and inline**, so delivery stays fully synchronous (no deferral, no
  second delivery, exactly-once). The consumer owns any *async map-loading* entirely before configuration,
  and is expected to supply a **fast, bounded** sync lookup; SafeSignal cannot isolate CPU time spent
  inside a synchronous resolver (a pathologically slow sync resolver blocks the emit call like any
  synchronous callback — that is the consumer's responsibility). Each resolver call MUST be wrapped
  fail-safe (a throw is isolated per FR-007).
- **FR-009**: The capability MUST be configured **once at the runtime level** (Principle VIII); creating a
  `Logger` and deriving loggers (`child()`/`withContext()`) MUST do **no** normalization work and incur
  **no** per-instance cost, listeners, or ambient reads. Duplicate-package-copy behavior MUST be
  documented (**isolated**).
- **FR-010**: The output MUST be **bounded**: the number of frames and per-frame string lengths MUST be
  capped so a pathological stack cannot inflate an error event without limit.
- **FR-011**: The feature MUST add **no new runtime dependency** — the package parses/trims stacks itself
  and MUST NOT bundle a source-map library; source-map data and the resolution function are
  consumer-provided.
- **FR-012**: The feature MUST keep the distributed surface honest: per the chosen delivery, either a new
  subpath is added to the documented public-subpath set and passes the Feature 012 parity gate, **or** the
  default `.` entry's bundle-invariance budget is re-baselined with a documented justification. The
  delivery mechanism (a dedicated opt-in subpath is the recommended default — see Dependencies) is settled
  in `/speckit-plan`; the resolution model is **resolved (Option A — synchronous, see Dependencies)**.

### Key Entities *(include if feature involves data)*

- **Stack Frame**: One parsed call-site — `function`, `file`/URL (scrubbed), `line`, `column`, and an
  `original` position when source-map-resolved. The application-relevant unit of a normalized stack.
- **Normalized Stack**: The ordered, trimmed, bounded list of frames produced from one error's raw stack
  (plus optionally a readable string form), attached additively to the error event.
- **Source-Map Resolver (consumer-provided)**: A function mapping a minified `{ file, line, column }` to an
  original `{ file, line, column, name? }`. Optional; supplied at runtime configuration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With normalization **disabled** (default), error output, shapes, and per-event cost are
  **identical** to today — **0** stacks parsed.
- **SC-002**: With normalization enabled, a logged error carries an ordered, **trimmed** frame list with
  the documented noise frames (engine internals / `node_modules` / SafeSignal-own) removed — verified by
  contract tests across at least the V8 and Firefox/Safari stack formats.
- **SC-003**: With a source-map resolver supplied, **100%** of resolvable frames carry original source
  positions, and an unresolvable frame is left at its original position (no frame dropped for being
  unresolvable).
- **SC-004**: A secret carried as a **URL query/fragment param** in a frame's `file` (e.g.
  `?token=SECRET`), or as a **whole-value** secret-shaped frame value, appears **0** times unredacted in
  the delivered frames — the `[REDACTED]` placeholder is what shows. (This is the pipeline's existing
  URL-scrub + whole-value redaction guarantee; substring-in-non-URL-path is out of scope, as for `message`.)
- **SC-005**: A **throwing** parser or resolver results in **100%** of errors still delivered and **0**
  throws into the page; SafeSignal adds **no** async work or I/O for resolution (verified by a
  failure-safety test). (Under the synchronous model there is no rejecting/hung async resolver to defend
  against; CPU time inside a sync resolver is the consumer's responsibility — FR-008.)
- **SC-006**: Normalization runs only at the runtime level: creating **N** loggers incurs **0** per-logger
  normalization cost, listeners, or ambient reads.
- **SC-007**: The frame list is **bounded** — a pathological deep stack yields at most the documented
  maximum number of frames and bounded per-frame string lengths.

## Assumptions

- **Off by default; explicit opt-in.** Normalization is never on unless the host enables it at runtime
  configuration (secure-by-default — Principle V).
- **Normalization (parse + trim) is synchronous and dependency-free.** Parsing a stack string and trimming
  frames is pure string work with no I/O; it produces the readable/trimmed frames inline. The original
  `error.stack` is preserved unchanged (frames are purely additive; no replace-stack mode in v1).
- **Source maps + resolution are consumer-provided and synchronous (Option A).** SafeSignal does **not**
  bundle a source-map parser or fetch `.map` files; the consumer supplies a **synchronous** resolver
  function and owns loading their maps (any async map-loading happens before they configure). SafeSignal's
  per-frame resolution is a bounded sync lookup — no I/O, no deferred or duplicated delivery. This keeps
  the package vendor-/dependency-free (Principle VI/XI) and delivery fully synchronous.
- **Frame text is scrubbed.** Each frame's file/URL passes through the existing URL-scrub / redaction
  posture so secrets in source URLs/paths do not leak (Principle V) — the raw multi-line stack today is
  NOT URL-scrubbed line-by-line, so per-frame scrubbing is a new, required step.
- **Trimming policy has sensible documented defaults** (drop engine-internal / `node_modules` /
  SafeSignal-own / anonymous frames; keep app frames), tunable in `/speckit-plan`; exact bounds (max
  frames, max string lengths) are settled in `/speckit-plan`.
- **Delivery mechanism — recommended a dedicated opt-in subpath** (matching the `./capture` /
  `./dev-console` precedent and keeping the default `.` entry lean, which matters because the core bundle
  is already near its practical ceiling after Feature 016). To be confirmed in `/speckit-plan` alongside
  the resolution model (the one open decision below).
- **Presentation/enrichment, not transport semantics.** This changes only what a delivered **error** event
  carries (and possibly the timing/shape of that error's delivery, per the open decision); it does not
  change which events are emitted, their order, redaction, or what any other transport receives for
  non-error events.

## Dependencies

- **The existing pipeline + error model** (`error.stack`, the URL-scrub / redaction stages, the
  `onInternalError` diagnostics hook, the synchronous delivery model) — present today; normalization
  enriches the error's stack within this posture.
- **Feature 012 distributed-surface parity** — engaged **only if** the chosen delivery adds a new packaged
  subpath.
- **Resolution model — RESOLVED (Option A: synchronous resolver only).** Stack **normalization (parse +
  trim + scrub)** is synchronous. Source-map resolution is also **synchronous**: the consumer supplies a
  sync resolver over already-loaded in-memory maps, invoked inline (fail-safe) before delivery. This
  preserves **every** current invariant — delivery stays fully synchronous, each error is delivered
  exactly once, and there is **no** deferral, duplication, or out-of-order enrichment (Principle VII
  intact). The issue's "async work isolated and fail-safe" is honored by keeping any *async map-loading*
  entirely in the consumer's hands (before they configure); SafeSignal's per-frame resolution does no I/O.
  The rejected alternatives — (B) async resolver with bounded *deferred* error delivery, and (C) async
  resolver with a *second* enriched delivery — were declined because they make error delivery asynchronous
  or duplicate events, adding log-integrity/timing complexity for limited benefit over consumer-side
  preloading.
- **Delivery mechanism — recommended a dedicated opt-in subpath** (settled in `/speckit-plan`): matches the
  `./capture` / `./dev-console` precedent and keeps the default `.` entry lean (relevant now that the core
  bundle is near its practical ceiling after Feature 016). A core runtime option remains possible but is
  not recommended.
