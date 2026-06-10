# Implementation Plan: Catch the Silent Errors — Opt-in `./capture`

**Branch**: `013-global-error-capture` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-global-error-capture/spec.md`

## Summary

Ship the marquee V1 feature (#13): a host-installed, **opt-in `./capture` subpath** exposing
`installGlobalErrorCapture(logger, options?)` (returns a disposer) that attaches global
`error` + `unhandledrejection` listeners and routes uncaught exceptions and unhandled promise
rejections through the **existing secure pipeline** — by calling `logger.error(message, attrs,
errorValue)` on a `Logger` the host already owns. Reusing `Logger.error` (not a new emission path)
makes capture **fail-closed** (stacks/messages are sanitized + redacted by the same pipeline) for
free, and — critically — sidesteps the **separate-bundle module-scoped-runtime hazard**: `./capture`
builds as its own bundle and must NOT read the core's module-scoped runtime slot, so it operates
through a `Logger` handle (created from the core entry) instead. Capture is **fail-safe** (never
throws into the page, chains existing handlers via `addEventListener`, loop-safe), **host-owned**
(the explicit host-level install Principle VIII v1.5.0 now sanctions — never a `createLogger` side
effect; modules never install), and **errors-only** (no RUM). Adds a 5th `exports` subpath, which
is reconciled with Feature 012's distributed-surface parity gate, and delivers the **G1-filed
enforcement** (deadline 2026-09-01) that no per-`Logger`/module code attaches global listeners.

## Technical Context

**Language/Version**: TypeScript 5.4+, browser-first ESM (the existing `src/` stack).

**Primary Dependencies**: **No new dependency.** Reuses the public `Logger` (`logger.error`), the
existing dispatch pipeline (sanitize → URL-scrub → redact → control-char-guard → SafeTransport), and
`tsup` for the new bundle entry. The `./capture` source imports **type-only** from `../api/types.js`
(the established subpath pattern — like the transports), so it shares no runtime state across bundles.

**Storage**: N/A (no persistence; in-memory listener registration only).

**Testing**: Vitest contract + integration + failure-safety + security tests under `tests/`. Tests
attach the capturer to a **caller-supplied `EventTarget`** (`options.target`) and dispatch synthetic
`error` / `unhandledrejection` events, so behavior is deterministic and not dependent on happy-dom's
event shims. Acceptance by `quickstart.md`.

**Target Platform**: Modern browsers (host apps + federated modules); safe no-op where the global has
no `addEventListener`. SSR/worker tolerated (no throw).

**Project Type**: Reusable browser package — this is package **runtime** code (first runtime feature
since the core), additive via a new subpath.

**Performance Goals**: Install is a one-time host action (two `addEventListener` calls); per-captured-
error cost is one `logger.error` call through the existing pipeline. No per-`Logger` cost; creating
loggers stays constant-cost and side-effect-free (Principle VIII).

**Constraints**: MUST NOT throw/reject into page code (Principle III); MUST be fail-closed via the
existing pipeline (Principle V); MUST chain (never replace `window.onerror`/existing handlers); MUST
be loop-safe; MUST be host-only/opt-in (Principle VIII v1.5.0 host-install allowance); errors-only
(no RUM); no new dependency; `./capture` bundle MUST stay vendor-neutral; the new subpath MUST keep
the distributed surface honest (Feature 012). Identical local/CI verification (Principle IX).

**Scale/Scope**: 1 new `src/capture/` module (+ types), 1 tsup entry, 1 `exports` subpath, updates to
the 012 parity set + `dependency-pins` exports checks, a new bundle-shape security test, the
global-listener boundary enforcement test (G1 remediation), and contract/integration/failure tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Constitution version**: in-tree **v1.5.0** — this branch is rebased onto the merged G1 amendment
> (#12), so Principle VIII now explicitly permits the single, explicit, host-level global install this
> feature performs.

- **Spec-Driven Development (I)** — ✅ Spec → this plan; Constitution Check precedes code.
- **Stable Consumer API & Deprecation (II)** — ✅ **Additive**: a new opt-in `./capture` subpath and
  exports; no existing entry, type, or behavior changes. The safe path stays easy — capture is
  explicit/opt-in, never a default or a `createLogger` side effect. Nothing deprecated/removed.
- **Browser Resilience & Failure Safety (III)** — ✅ **Central.** The capturer's handlers are wrapped
  fail-safe (try/catch; never throw/reject into the page), attach via `addEventListener` (additive —
  never assign `window.onerror`, never `preventDefault`), and are **loop-safe** (a re-entrancy guard
  stops an error raised during emit from re-capturing). No internal path propagates into a page call
  site; internal failures route to `onInternalError` and are swallowed (mirroring `safeNotify`).
- **Framework-Neutral Structured Observability (IV)** — ✅ Captured errors emit as structured
  `error`-level events via the existing pipeline; no raw object dumping; documented shape + source
  marker. No proprietary wire format.
- **Secure & Privacy-Safe Logging by Default (V)** — ✅ **Fail-closed by construction**: capture emits
  through `logger.error`, so stacks/messages/reasons pass the same sanitize + URL-scrub + redact
  (drop-on-failure) pipeline before any transport sees them. The capturer adds **no** new sensitive
  source — it forwards the error value only; it MUST NOT read ambient page/browser state.
- **Testable, Minimal, Maintainable (VI)** — ✅ **No new dependency**; small self-contained
  `src/capture/` module reusing the public `Logger`. Test code held to `src/` standards.
- **Log Integrity & Monitoring Suitability (VII)** — ✅ Events are stable, machine-parseable,
  host-attributed (identity flows from the runtime via `Logger`), and source-marked
  (uncaught-exception vs unhandled-rejection) so downstream can separate captured from logged. No
  reorder/dedup of normal events.
- **Lightweight Logger & Federated Runtime (VIII)** — ✅ **The sanctioned host-level install** (v1.5.0
  "Explicit host-level global install (opt-in)"): single, explicit, host-owned, opt-in, fail-safe,
  fail-closed, explicitly named (`./capture`). `createLogger` attaches **no** listeners; modules never
  install; duplicate-package-copy behavior is **isolated** (each capturer uses the `Logger` from its
  own copy). Per-`Logger` construction constraints unchanged.
- **Reproducible Verification (IX)** — ✅ One `npm test`; deterministic (tests dispatch synthetic
  events on a caller-supplied target — no environment-dependent event shims). Built `dist/` consumed
  by bundle-shape/parity tests as other features do; honest prerequisites.
- **Mechanical Enforcement of Documented Contracts (X)** — ✅ Delivers the **G1-filed remediation**
  (deadline **2026-09-01**): a boundary test that `createLogger`/core attaches no global listeners
  (SC-007) and that **no non-`capture` `src/` module** references `addEventListener('error' |
  'unhandledrejection')` / `window.onerror` (source-scan, like `internal-import-boundary.test.ts`).
  The new subpath is added to the Feature 012 distributed-surface parity gate and the
  `dependency-pins` exports checks, keeping those gates green.
- **Supply-Chain Integrity & Verifiable Provenance (XI)** — ✅ Adds one packaged subpath (`./capture`
  → new `exports` entry + built files); the documented distributed surface + parity set are updated
  in lockstep. **No new dependency**; the `./capture` bundle is vendor-neutral (asserted by a
  bundle-shape security test). Attested publish, signed tags, DCO, pins unchanged.

**Result: PASS** (constitution v1.5.0; the host-level install is now constitutionally explicit;
Complexity Tracking empty).

## Project Structure

### Documentation (this feature)

```text
specs/013-global-error-capture/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   └── capture-api.md     # installGlobalErrorCapture signature, options, disposer, emitted-event
│                          #   shape, behavioral guarantees, and the global-listener boundary
└── checklists/requirements.md
```

### Source / repository files affected

```text
New runtime module (the feature):
└── src/capture/
    └── index.ts          # installGlobalErrorCapture(logger, options?) → disposer;
                          #   GlobalErrorCaptureOptions / GlobalErrorCaptureDisposer types.
                          #   Type-only import from ../api/types.js (no runtime-state sharing).

Build + packaging (the 5th subpath):
├── tsup.config.ts        # add entry: capture: 'src/capture/index.ts'
└── package.json          # add "./capture" exports triple (types/import/require → dist/capture.*)

Distributed-surface reconciliation (keep Feature 012 + dependency-pins green):
├── tests/contract/distributed-surface.contract.test.ts   # add './capture' to PUBLIC_SUBPATHS
└── tests/contract/dependency-pins.test.ts                 # add './capture' to the exports-keys
                                                           #   assertion + the triple it.each

Tests (REQUIRED — runtime feature):
├── tests/contract/capture.contract.test.ts          # API shape, emitted-event shape + source marker,
│                                                     #   routes through pipeline (redacted), disposer
├── tests/integration/capture.integration.test.ts    # end-to-end: throw/reject → event at transport;
│                                                     #   chains a pre-existing handler; host identity
├── tests/security/capture-bundle-shape.security.test.ts  # dist/capture.* vendor-neutral + isolated
├── tests/security/capture-redaction.security.test.ts     # secret in stack/message fully redacted
└── tests/contract/global-listener-boundary.test.ts  # G1 remediation: createLogger attaches no global
                                                      #   listeners; only src/capture/** may reference
                                                      #   addEventListener('error'/'unhandledrejection')

Preserved UNCHANGED:
├── src/index.ts (core), src/api/logger.ts, the pipeline, the transports   # no edit
└── existing exports / behavior                                            # additive only
```

**Structure Decision**: A new `src/capture/` subpath module that consumes the public `Logger`, built
as a 5th tsup entry. No change to the core or pipeline; capture is a thin, fail-safe host-level
adapter over the existing emit path.

## Approach & sequencing

1. **`src/capture/` module** — `installGlobalErrorCapture(logger, options?)`: bind `error` +
   `unhandledrejection` handlers on `options.target ?? globalThis`; each handler (fail-safe, loop-safe)
   extracts the error value and calls `logger.error(message, sourceAttrs, errorValue)`; return an
   idempotent disposer. Safe no-op when no `addEventListener` exists.
2. **Build + exports** — add the tsup entry + `./capture` exports triple; build.
3. **Distributed-surface reconciliation** — add `./capture` to the 012 parity `PUBLIC_SUBPATHS` and
   the `dependency-pins` exports checks; `npm run surface:check` green.
4. **Tests** — contract (API + event shape), integration (end-to-end + chaining + identity),
   security (bundle-shape vendor-neutral + redaction), and the **global-listener boundary** test
   (G1 remediation).
5. **Docs** — README `./capture` section + the host-install/federation note; CHANGELOG entry deferred
   to release.

All edits land via one PR gated by the (now `./capture`-aware) `ci-success`.

## Complexity Tracking

> No Constitution Check violations. One design decision worth recording (not a violation): the
> public entrypoint takes a **`Logger`**, not the raw "runtime" the issue's
> `installGlobalErrorCapture(runtime)` wording suggested. Rationale: a `Logger` is the only public
> handle over the configured runtime, `logger.error` already routes through the full fail-closed
> pipeline (so capture inherits redaction for free), and — decisively — `./capture` is a **separate
> bundle**, so reading the core's module-scoped runtime slot directly would bind to a *different*
> (unconfigured) slot. The `Logger` handle is created from the core entry and routes correctly. (A
> raw-runtime API or a runtime-singleton-in-globalThis was rejected: the former can't cross the bundle
> boundary safely; the latter violates Principle VIII's "no copy-local globals / no globalThis
> registry" isolation.)

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none) | — | — |
