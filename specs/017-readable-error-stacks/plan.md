# Implementation Plan: Readable, Source-Mapped Error Stacks

**Branch**: `017-readable-error-stacks` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-readable-error-stacks/spec.md`

## Summary

Ship roadmap V4: **opt-in, fail-safe error-stack normalization** plus **optional consumer-provided
source-map resolution** — delivered as a small **core seam** + a dedicated **`./stacks` subpath**. When the
host configures `normalizeStack`, an error's raw stack is parsed into ordered, **trimmed** structured
frames (function / file / line / column), optionally **source-map-resolved** to original positions via a
consumer-supplied **synchronous** resolver, and attached to the error event as
`attributes['safesignal.stack']`. Normalization runs in the core pipeline (so the real error event every
transport receives carries the frames) but the heavy parser/trimmer/resolver lives in the `./stacks`
subpath (tree-shaken from non-users), keeping the default `.` entry within its ±1 KiB bundle gate.
**Off by default.** Frames are scrubbed + bounded **for free** by the existing pipeline (they ride in
`attributes`, which `urlScrub` + `redact` + `sanitize` already process), so a secret in a source URL
cannot leak (V). Resolution is **synchronous** → delivery stays fully synchronous and exactly-once (VII);
everything is fail-safe (III) and runtime-level with no per-`Logger` cost (VIII). No new dependency —
source maps and the resolver are consumer-provided.

## Technical Context

**Language/Version**: TypeScript 5.4+, browser-first ESM (the existing `src/` stack).

**Primary Dependencies**: **No new dependency.** A hand-written stack parser + trimmer; source-map data
and the resolver function are consumer-provided. The `./stacks` subpath imports **type-only** from
`../api/types.js` (`StackFrame`, `StackNormalizer`); the core seam adds an optional config function.

**Storage**: N/A (per-event, stateless transformation).

**Testing**: Vitest contract + security + failure-safety + integration tests, plus a `./stacks`
bundle-shape security test and parity reconciliation. Deterministic fixtures of real V8 / Firefox / Safari
stack strings; a fake sync resolver.

**Target Platform**: Browser-first; safe in Node/SSR (pure string parsing, no globals/ambient reads).

**Project Type**: Reusable browser package — a small **core** seam + a new opt-in **subpath**.

**Performance Goals**: Normalization runs only per **error** event when enabled; parsing is linear in the
stack's line count, bounded by `maxFrames`. Resolution is a bounded sync lookup per frame. **Zero** cost
when disabled (one falsy check) and **zero** per-`Logger` cost.

**Constraints**: Off by default (V); frames carry only post-pipeline-scrubbed data (IV/V); additive,
non-mutating, **synchronous exactly-once** delivery (VII); fail-safe, never blocks (III); runtime-level /
no per-`Logger` cost (VIII); no new dependency (XI); bounded output (FR-010). **Bundle**: the core seam
MUST stay within the dynamic ±1 KiB `bundle-invariance` gate vs `main`; the `./stacks` bundle has its own
shape/size test and joins the Feature 012 parity set; the stored default-entry ceilings are re-baselined
for the small seam delta with a documented justification.

**Scale/Scope**: 1 new `src/stacks/` subpath module (parser + trimmer + resolver application + options), a
small core seam (`StackFrame`/`StackNormalizer` types + `LoggerConfig.normalizeStack` + `emit()` wiring +
config passthrough), the `./stacks` tsup entry + `exports` triple, the parity / dependency-pins / TB-12
reconciliation, the stored-ceiling re-baseline, and contract/security/failure/integration tests. The
pipeline stages and `ConsoleTransport` are **not** modified.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Constitution version**: in-tree **v1.5.0**.

- **Spec-Driven Development (I)** — ✅ Spec → this plan; Constitution Check precedes code.
- **Stable Consumer API & Deprecation (II)** — ✅ **Additive**: a new opt-in `./stacks` subpath
  (`createStackNormalizer`), a small core seam (`LoggerConfig.normalizeStack` + `StackFrame`/`StackNormalizer`
  types), and a documented reserved `safesignal.stack` attribute shape. Nothing removed/changed; event
  shapes identical when disabled. Off by default (safe path stays easy). No deprecation.
- **Browser Resilience & Failure Safety (III)** — ✅ Normalizer + resolver are wrapped fail-safe (throw →
  `onInternalError`); a failure never reaches the page and **never prevents the error from being
  delivered** (it ships with the raw stack / un-resolved frames). Parsing/resolution are synchronous +
  bounded — they never block rendering/navigation.
- **Framework-Neutral Structured Observability (IV)** — ✅ Produces a **structured**, bounded, documented
  frame shape — not a re-serialized blob. Levels/shape otherwise unchanged.
- **Secure & Privacy-Safe Logging by Default (V)** — ✅ **Off by default.** Frames ride in `attributes`, so
  the existing `urlScrub` (per-frame `file` URL scrubbing) + `redact` (secret-shaped leaves) + `sanitize`
  (bounds) process them — a secret in a source URL is scrubbed. The resolver receives only frame positions,
  not app state. **No new sensitive-data path.**
- **Testable, Minimal, Maintainable (VI)** — ✅ **No new dependency**; the heavy parser is one
  self-contained subpath module; the core seam is tiny. Tests held to `src/` standards.
- **Log Integrity & Monitoring Suitability (VII)** — ✅ Additive enrichment of the **error** event only;
  never drops/reorders/dedupes/mutates other events; **synchronous, exactly-once** delivery (no deferral /
  duplication / out-of-order). Original `error.stack` preserved.
- **Lightweight Logger & Federated Runtime (VIII)** — ✅ Configured **once at the runtime level**; **no**
  per-`Logger` work, listeners, or ambient reads; runs only per error event. Duplicate copies **isolated**.
- **Reproducible Verification (IX)** — ✅ One `npm test`; deterministic stack fixtures + a fake resolver.
  Bundle gates run in CI + locally via the existing scripts.
- **Mechanical Enforcement of Documented Contracts (X)** — ✅ Every new gate (frame shape/trim/bounds,
  disabled = no-op, secret-free frames, fail-safe delivery, `./stacks` parity + vendor-neutral bundle) is
  paired with a test. The default-entry bundle gates are **not removed**: the dynamic ±1 KiB invariance
  still guards growth, and the stored ceilings are **re-baselined with a documented justification**.
- **Supply-Chain Integrity & Verifiable Provenance (XI)** — ✅ Adds one packaged subpath (`./stacks`); the
  documented surface + parity set are updated in lockstep; the subpath bundle is vendor-neutral (asserted).
  **No new dependency.** Attested publish, signed tags, DCO, pins intact.

**Result: PASS** (constitution v1.5.0). Complexity Tracking records the one notable point — the seam +
subpath split (forced by the ±1 KiB bundle gate, since the parser cannot live in core).

## Project Structure

### Documentation (this feature)

```text
specs/017-readable-error-stacks/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   └── stacks.md          # core seam + ./stacks API + reserved attribute shape + ST-1..ST-N guarantees
└── checklists/requirements.md
```

### Source / repository files affected

```text
New subpath module (the heavy logic):
└── src/stacks/
    └── index.ts            # createStackNormalizer(options?) + StackNormalizerOptions; parser (V8 +
                            #   Firefox/Safari), trimmer, sync resolver application, bounds.
                            #   Type-only import of StackFrame/StackNormalizer from ../api/types.js.

Core seam (small):
├── src/api/types.ts        # + StackFrame, StackNormalizer; + LoggerConfig.normalizeStack?: StackNormalizer
├── src/index.ts            # + export type StackFrame, StackNormalizer
├── src/config/config.ts    # + NormalizedConfig.normalizeStack (passthrough)
├── src/api/logger.ts       # + gated: normalize event.error.stack pre-dispatch → attributes['safesignal.stack']; fail-safe
└── src/internal/errors/internal-errors.ts  # + 'stack_normalize_failed' PackageErrorCode

Build + packaging (the 7th subpath):
├── tsup.config.ts          # + entry: 'stacks': 'src/stacks/index.ts'
└── package.json            # + "./stacks" exports triple (→ dist/stacks.*)

Distributed-surface reconciliation:
├── tests/contract/distributed-surface.contract.test.ts   # + './stacks' to PUBLIC_SUBPATHS + HONEST_PKG
├── tests/contract/dependency-pins.test.ts                 # + './stacks' to keys + the per-entry triple
└── tests/contract/transport-beacon.contract.test.ts       # TB-12 keys assertion += './stacks'

Bundle re-baseline (gate movement, documented):
└── tests/security/transport-beacon-bundle-shape.security.test.ts  # bump DEFAULT_ENTRY_*_GZ_MAX for the seam

Tests (REQUIRED):
├── tests/unit/stacks/parse-trim.test.ts          # V8 + FF/Safari parsing; trimming policy; bounds; null fallback
├── tests/unit/stacks/resolver.test.ts            # sync resolver application; partial; per-frame fail-safe
├── tests/contract/stacks.contract.test.ts        # end-to-end via configureLogging: frames on error; disabled=no-op
├── tests/security/stacks.security.test.ts        # secret in a frame URL scrubbed; only post-safe data
└── tests/security/stacks-bundle-shape.security.test.ts  # dist/stacks.* vendor-neutral + size budget; default-entry isolation

Preserved UNCHANGED (non-regression):
├── src/pipeline/{sanitizer,url-scrubber,redactor,control-char-guard,freeze}.ts  # NOT modified
└── src/transport/console-transport.ts and existing exports                      # additive only
```

**Structure Decision**: A new `src/stacks/` subpath owning the parser/trimmer/resolver, invoked through a
small core seam (`LoggerConfig.normalizeStack`) that runs in `emit()` and stashes frames into
`attributes['safesignal.stack']` pre-dispatch, so the existing pipeline scrubs + bounds them. No pipeline
stage is modified.

## Approach & sequencing

1. **Core seam** — add `StackFrame` + `StackNormalizer` types + `LoggerConfig.normalizeStack`;
   `NormalizedConfig.normalizeStack` passthrough; `emit()` wiring (gated `cfg.normalizeStack && level ===
   'error' && event.error?.stack` → call fail-safe → stash frames at `attributes['safesignal.stack']` when
   non-empty). Add `'stack_normalize_failed'`.
2. **`./stacks` subpath** — `createStackNormalizer(options?)`: parse (V8 + FF/Safari), trim (policy),
   apply the sync `resolver` per frame (partial, fail-safe), cap `maxFrames`, return `StackFrame[]` (or
   `null`).
3. **Build + exports** — tsup entry + `./stacks` exports triple → `dist/stacks.{mjs,cjs,d.ts}`.
4. **Distributed-surface reconciliation** — add `./stacks` to the 012 parity `PUBLIC_SUBPATHS` + fixture,
   `dependency-pins` (keys + triple), the `transport-beacon` TB-12 keys assertion; `surface:check` green.
5. **Bundle** — `npm run build`; confirm `dist/index.mjs` gzip delta vs `main` < 1 KiB (invariance gate);
   re-baseline the stored `DEFAULT_ENTRY_*_GZ_MAX` ceilings for the seam delta with a documented comment.
6. **Tests** — unit (parse/trim/bounds/resolver), contract (end-to-end frames; disabled no-op), security
   (frame-URL scrub; only post-safe data; vendor-neutral `dist/stacks.*`; default-entry isolation),
   failure-safety (throwing parser/resolver swallowed; error still delivered).
7. **Docs** — README `./stacks` section (enable via `normalizeStack: createStackNormalizer({ resolver })`;
   the `safesignal.stack` shape; sync-resolver / preload note).

All edits land via one PR gated by `ci-success` (incl. `bundle-invariance`, `surface:check`).

## Complexity Tracking

> No Constitution Check violations. One notable design point (recorded for traceability): the feature is
> split into a **small core seam** + a **`./stacks` subpath** rather than living entirely in core (as
> Feature 016 breadcrumbs did) or entirely in a subpath.
>
> **Why:** normalization must run **in the core pipeline** (so the real error event delivered to every
> transport carries the frames, and the frames are scrubbed/bounded by the existing stages) — a pure
> subpath cannot reach the pipeline, so a core seam is unavoidable. But the parser/trimmer/resolver is
> **too large to fit the default entry's hard ±1 KiB `bundle-invariance` gate** (core is already ~9.8 KB
> gz after Feature 016). So only the tiny seam lives in core; the heavy logic lives in the tree-shakeable
> `./stacks` subpath. This is the minimum core footprint that still delivers the frames to all transports.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Seam + subpath split (vs all-core) | Parser must run in-pipeline but is too big for the ±1 KiB core gate | All-core (F016-style) would blow the bundle-invariance gate; pure-subpath can't enrich the pipeline event |
