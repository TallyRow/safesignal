# Implementation Plan: Opt-In Error Breadcrumbs (Bounded Recent-Event Context on Errors)

**Branch**: `016-error-breadcrumbs` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-error-breadcrumbs/spec.md`

## Summary

Ship roadmap V3: **opt-in error breadcrumbs**, delivered as a **core runtime configuration option, off by
default** (`configureLogging({ breadcrumbs: true | { maxEvents } })`). When enabled, the runtime keeps a
single **bounded ring buffer** of the most recent post-pipeline (already sanitized + redacted) event
snapshots; when an **error** is logged, that error event is **enriched** with the recent trail (as
`attributes['safesignal.breadcrumbs']`) plus the error's **cause chain** (as
`attributes['safesignal.errorCauses']`) — a Sentry-style trail, vendor-free, built only from SafeSignal's
own already-safe events. Recording is **O(1)** and memory is **constant** regardless of volume (Principle
VIII); the enrichment is **additive** and never mutates non-error or already-delivered events (Principle
VII); it carries **only** post-redaction data (Principle IV/V); it is **fail-safe** (Principle III); and
it is **off by default** (Principle V). The buffer is a single runtime-level shared resource created once
at `configureLogging()`; `Logger` creation stays side-effect-free. The core `ConsoleTransport`, the
pipeline stages, and existing event shapes are unchanged when disabled. The only public surface added is
one optional `breadcrumbs` config field + a `BreadcrumbsOptions` type + two documented reserved
`safesignal.*` attribute shapes. The default `.` entry grows slightly (the small, off-by-default code) —
held under the **±1 KiB bundle-invariance gate** and with the stored bundle-shape ceilings re-baselined.

## Technical Context

**Language/Version**: TypeScript 5.4+, browser-first ESM (the existing `src/` stack).

**Primary Dependencies**: **No new dependency.** A plain in-memory ring buffer and a cause-chain walker.
The new `src/breadcrumbs/` module imports **type-only** from `../api/types.js`; it is wired into the core
runtime (`config.ts`, `dispatcher.ts`, `logger.ts`).

**Storage**: Bounded in-memory ring buffer (capacity N ≤ 100), on the configured runtime. No persistence.

**Testing**: Vitest contract + security + integration + performance + failure-safety. A capturing
transport asserts the delivered (enriched) error event; a console/secret fixture proves no leakage; a
scale test proves constant memory + O(1); a failure test proves fail-safe delivery.

**Target Platform**: Browser-first; safe in Node/SSR (pure in-memory, no globals/ambient reads).

**Project Type**: Reusable browser package — additive **core runtime** capability (no new subpath).

**Performance Goals**: Recording is **O(1)** per emitted event; enrichment is **O(N)** only on error
events (N ≤ 100). Memory is **constant** (≤ N bounded snapshots), independent of total events logged.
Disabled = one falsy branch (no allocation, no recording).

**Constraints**: Off by default (V); only post-redaction data in breadcrumbs (IV/V); additive,
non-mutating enrichment (VII); fail-safe (III); constant memory / runtime-level shared / no per-`Logger`
cost (VIII); no new dependency; `exports` map unchanged (no subpath). **Bundle**: the core breadcrumb
code MUST add **< 1 KiB gzipped** to `dist/index.mjs` to pass the dynamic `bundle-invariance` gate
(±1024 B vs merge-base — not re-baselinable); the stored default-entry ceilings in
`transport-beacon-bundle-shape.security.test.ts (e)` are bumped with a documented justification.

**Scale/Scope**: 1 new internal `src/breadcrumbs/` module (ring buffer + snapshot + trail attach +
cause-chain walker + resolve/clamp), thin wiring into `config.ts` / `dispatcher.ts` / `logger.ts`, 2
public-type additions (`LoggerConfig.breadcrumbs`, `BreadcrumbsOptions`), the bundle-ceiling re-baseline,
and contract/security/integration/performance/failure tests. The pipeline stages and `ConsoleTransport`
are **not** modified.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Constitution version**: in-tree **v1.5.0**.

- **Spec-Driven Development (I)** — ✅ Spec → this plan; Constitution Check precedes code.
- **Stable Consumer API & Deprecation (II)** — ✅ **Additive**: one optional `breadcrumbs` config field +
  `BreadcrumbsOptions` type + two documented reserved `safesignal.*` attribute shapes. Nothing removed or
  changed; existing event shapes are identical when disabled. The safe path stays easy — **off by
  default**; enabling is a deliberate opt-in. No deprecation.
- **Browser Resilience & Failure Safety (III)** — ✅ Recording + enrichment are wrapped (try/catch →
  `onInternalError`); a throw never reaches the page and **never prevents the error event from being
  delivered**. Cause-chain traversal is cycle-safe + depth-bounded. Buffer ops are synchronous and emit
  nothing (no re-entrancy).
- **Framework-Neutral Structured Observability (IV)** — ✅ The trail/causes are **structured**,
  bounded-size `AttributeValue` arrays with documented machine-parseable shapes — not raw object dumps.
  Built from the already-sanitized event; bounded by `sanitizerLimits` + an anti-nesting exclusion.
- **Secure & Privacy-Safe Logging by Default (V)** — ✅ **Off by default.** Breadcrumbs are built from the
  **post-redaction** event; the cause chain is written pre-pipeline so the existing sanitizer + redactor
  process it. No raw application object is captured, no ambient state read, **no new sensitive-data path**.
- **Testable, Minimal, Maintainable (VI)** — ✅ **No new dependency**; one small self-contained internal
  module + thin wiring; one config option. Tests held to `src/` standards.
- **Log Integrity & Monitoring Suitability (VII)** — ✅ Enrichment is **additive** and adds fields to the
  **error** event only; it does **not** drop, reorder, dedupe, or mutate any other event, does not change
  what non-error events carry, and does not mutate an already-delivered event (snapshots are copies). The
  trail/cause shapes are stable and documented.
- **Lightweight Logger & Federated Runtime (VIII)** — ✅ One **runtime-level shared** bounded buffer
  created once at `configureLogging()`; **O(1)** record; **constant memory**. `Logger` creation/derivation
  stays side-effect-free — **no** per-`Logger` buffer/timer/listener. Duplicate copies are **isolated**
  (each runtime owns its buffer).
- **Reproducible Verification (IX)** — ✅ One `npm test`; deterministic (synchronous buffer, capturing
  transport, secret fixture). Bundle gates run in CI + locally via the existing scripts.
- **Mechanical Enforcement of Documented Contracts (X)** — ✅ Every new gate (trail/cause shape + bounds,
  off-by-default no-op, constant memory / O(1), fail-safe delivery, secret-free trail) is paired with a
  test. The bundle gates are **not removed**: the dynamic ±1 KiB invariance check still guards growth, and
  the stored ceilings are **re-baselined with a documented justification** (Principle X-compliant
  movement, not removal).
- **Supply-Chain Integrity & Verifiable Provenance (XI)** — ✅ **No new dependency**; **no new subpath**;
  the `exports` map and packaged file set are unchanged → the distributed-surface parity set is untouched.
  The default-entry size change is bounded by the invariance gate and reflected in the re-baselined
  ceilings. Attested publish, signed tags, DCO, pins intact.

**Result: PASS** (constitution v1.5.0). Complexity Tracking records the one notable point — deliberate
core default-entry growth (Option A), bounded by the invariance gate and accounted for by re-baselined
ceilings.

## Project Structure

### Documentation (this feature)

```text
specs/016-error-breadcrumbs/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   └── breadcrumbs.md      # config + reserved attribute shapes + BC-1..BC-N guarantees
└── checklists/requirements.md
```

### Source / repository files affected

```text
New internal module (the feature):
└── src/breadcrumbs/
    ├── breadcrumb-buffer.ts   # BreadcrumbBuffer (ring, O(1) record, snapshot, attachTrail), constants
    └── cause-chain.ts         # extractCauseChain(value, maxDepth) — cycle-safe, depth-bounded
                               #   (both type-only import from ../api/types.js)

Core wiring (thin):
├── src/api/types.ts          # + BreadcrumbsOptions; + LoggerConfig.breadcrumbs?: boolean | BreadcrumbsOptions
├── src/index.ts              # + export type BreadcrumbsOptions
├── src/config/config.ts      # + NormalizedConfig.breadcrumbs: BreadcrumbBuffer | undefined; resolveBreadcrumbs() (clamp + notice)
├── src/pipeline/dispatcher.ts# + gated: attach trail pre-freeze (error only) + record snapshot post-fan-out; fail-safe
└── src/api/logger.ts         # + gated: extract cause chain pre-dispatch (error + errorValue) → attributes

Bundle re-baseline (gate movement, documented):
└── tests/security/transport-beacon-bundle-shape.security.test.ts  # bump DEFAULT_ENTRY_MJS/CJS_GZ_MAX with justification

Tests (REQUIRED):
├── tests/contract/breadcrumbs.contract.test.ts            # trail/cause shape, ordering, bounds, disabled=no-change, clamp
├── tests/security/breadcrumbs.security.test.ts            # secret 0× in trail/causes; only post-redaction data; no nesting
├── tests/integration/breadcrumbs.integration.test.ts      # end-to-end via configureLogging + capturing transport; integrity
├── tests/performance/breadcrumbs-scale.performance.test.ts# M ≫ N → bounded buffer, O(1), no per-logger cost
└── (failure-safety covered in the contract test or tests/contract/failure-safety additions)

Preserved UNCHANGED (non-regression):
├── src/pipeline/{sanitizer,url-scrubber,redactor,control-char-guard,freeze}.ts  # NOT modified
├── src/transport/console-transport.ts and all existing exports                 # additive only
└── scripts/ci/bundle-invariance-check.sh                                       # gate unchanged (must fit ±1 KiB)
```

**Structure Decision**: A new internal `src/breadcrumbs/` module owning the ring buffer + cause-chain
walker, wired into the core runtime at three thin seams (config normalization, the dispatcher, and
`emit()`), gated entirely behind the off-by-default `breadcrumbs` config. No pipeline stage is modified;
the cause chain reuses the existing sanitize→redact→guard stages by being written into `attributes`
before dispatch.

## Approach & sequencing

1. **`src/breadcrumbs/` module** — `BreadcrumbBuffer(maxEvents)` with `record(event)` (build + store a
   compact snapshot, excluding the trail key; O(1) ring write) and `attachTrailTo(errorEvent)` (write the
   ordered oldest→newest trail to `attributes['safesignal.breadcrumbs']`); `extractCauseChain(value,
   MAX_CAUSE_DEPTH)` (cycle-safe, depth-bounded → `{name,message}[]`); constants
   (`DEFAULT_MAX_EVENTS=20`, `MAX_EVENTS_BOUND=100`, `MAX_CAUSE_DEPTH=8`, the two reserved keys).
2. **Config** — add `LoggerConfig.breadcrumbs` + `BreadcrumbsOptions` (public types); add
   `NormalizedConfig.breadcrumbs` + `resolveBreadcrumbs()` (off→undefined; clamp `maxEvents` to [1,100]
   with one `onInternalError` notice; construct the buffer once).
3. **Cause chain** — in `logger.ts` `emit()`, gated by `cfg.breadcrumbs && level==='error' && errorValue`,
   extract the chain and merge `attributes['safesignal.errorCauses']` before `dispatch()` (so the existing
   pipeline sanitizes/redacts it).
4. **Trail + record** — in `dispatcher.ts`, gated by `config.breadcrumbs`, wrapped fail-safe: attach the
   trail to error events **before** `freezeInDev`; **after** fan-out, record the event's snapshot.
5. **Bundle** — `npm run build`; confirm `dist/index.mjs` gzip delta vs base is **< 1 KiB** (invariance
   gate); bump the stored `DEFAULT_ENTRY_*_GZ_MAX` ceilings with a documented justification comment.
6. **Tests** — contract, security, integration, performance, failure-safety (above).
7. **Docs** — README "error breadcrumbs" section (enable + the `safesignal.breadcrumbs` /
   `safesignal.errorCauses` shapes); update the duplicate-copy / federated guidance note (isolated).

All edits land via one PR gated by `ci-success` (incl. `bundle-invariance`).

## Complexity Tracking

> No Constitution Check violations. One notable design point (settled in the spec as Option A, recorded
> here for traceability): the breadcrumb capability ships in the **core default `.` entry** rather than a
> dedicated subpath.
>
> **Why:** the enrichment is intrinsically core pipeline work (the buffer must observe the post-pipeline
> event and the *real* error event delivered to every transport must carry the trail). A subpath would
> still need a core seam **plus** add a new public extension point and a packaged subpath — more total
> surface for a feature that must live in core regardless. Option A keeps the public surface minimal (one
> off-by-default config option). The only cost — a small increment to the default-entry bundle — is held
> under the **±1 KiB bundle-invariance gate** (the implementation is kept lean to fit) and reflected in
> the **re-baselined** stored ceilings (gate movement with documented justification, not removal).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Core default-entry growth (Option A) | Enrichment must run in the core pipeline; user chose the core-config delivery | A subpath (Option B) adds a new public extension seam + a packaged subpath (more surface) and still needs core changes; rejected by the user |
