# Implementation Plan: React, Caught — Opt-in `./framework-react` Error Boundary + `useLogError()`

**Branch**: `018-react-error-boundary` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-react-error-boundary/spec.md`

## Summary

Ship the **no-globals, React-native counterpart to `./capture`** (#17): a new opt-in
`./framework-react` subpath exporting a `<LogErrorBoundary>` class component, a `useLogError()` hook,
and a small `LoggerProvider` React context that wires a host's `Logger` into a subtree once. When a
descendant throws during render/lifecycle/constructor, the boundary catches it
(`getDerivedStateFromError` + `componentDidCatch`), calls `logger.error(message, attrs, errorValue)`
on the resolved `Logger` — carrying the React **component stack** — and renders a fallback instead of
unmounting the tree to a blank screen. `useLogError()` returns a **stable** `logError(error, attrs?)`
callback for the errors boundaries inherently can't catch (event handlers, async/effects).

Like `./capture`, this routes through the **existing secure pipeline** by reusing the public
`Logger.error` (no new emission path), so redaction/sanitization is **fail-closed for free**, and —
critically — `./framework-react` is its **own bundle** that must NOT read the core's module-scoped
runtime slot, so it operates only through a consumer-provided `Logger` handle. It is **fail-safe**
(a logging failure is swallowed and the fallback still renders; no catch/render loop), **no-globals**
(patches nothing, attaches no `window` listeners — the explicit contrast to `./capture`'s host-level
install), and **framework-neutral-preserving**: React is a **peer dependency** (the package's first
runtime external), externalized from the bundle, so the core `.` entry and every other subpath stay
React-free (Principle IV). Adds the **8th** `exports` subpath, reconciled with the Feature 012
distributed-surface parity gate and the `dependency-pins` exports checks; `dependencies` stays empty.

## Technical Context

**Language/Version**: TypeScript 5.4+, browser-first ESM (the existing `src/` stack). The subpath is
authored in **plain `.ts` using `React.createElement`** (no `.tsx`, no JSX transform) so the global
`tsconfig` needs no `jsx` option and `src/` stays uniform.

**Primary Dependencies**: **One new peer dependency: `react` (`>=16.8.0`)** — provided by the
consumer, **externalized** from the bundle (never bundled; `dependencies` stays empty). `@types/react`
(+ `react`/`react-dom` for tests) added to **devDependencies** only. The `./framework-react` source
imports **type-only** from `../api/types.js` (`Logger`, `Attributes`) plus a runtime import of
`react` (the established external-import allowance — bundle-shape test (a) permits non-relative
externals). No core/pipeline runtime import; shares no runtime state across bundles.

**Storage**: N/A (React component/hook state only — the boundary's caught-error state; no persistence).

**Testing**: Vitest contract + integration + failure-safety + security tests under `tests/`, rendering
React into **happy-dom** via `react-dom/client` `createRoot` + `act` (a thrown-on-render child drives
the boundary; an SSR smoke test via `react-dom/server`). A `./framework-react` bundle-shape security
test (vendor-neutral; react **externalized** not inlined; default-entry isolation). Deterministic —
errors are triggered synchronously inside controlled components.

**Target Platform**: Any React renderer (browser DOM + SSR). The boundary/hook are pure React
constructs — no `window`/DOM/ambient reads — so they work under SSR and in any React 16.8+ runtime.

**Project Type**: Reusable browser package — additive **framework-adapter** subpath over the public
`Logger`; package runtime code (a class component + a hook + a context), no core/pipeline change.

**Performance Goals**: Zero core cost and **zero per-`Logger` cost** — the helpers are React
constructs that call `logger.error` on a logger they're handed. The boundary adds one render-time
catch path; `useLogError` returns a `useCallback`-memoized stable callback. No timers, listeners,
network, or ambient reads.

**Constraints**: No-globals (FR-007: no `window.onerror`, no global listeners, no monkey-patching);
fail-safe (III — logging failure never escalates the crash, no catch/render loop); fail-closed via the
existing pipeline (V); React is a **peer** not a runtime/bundled dep, core stays React-free (IV);
explicit consumer-provided logger only (VIII — no module-scoped-runtime read across the bundle
boundary); additive / no existing contract change (II); the new subpath stays vendor-neutral and keeps
the distributed surface honest (XI / Feature 012); identical local/CI verification (IX).

**Scale/Scope**: 1 new `src/framework-react/` module (boundary + hook + provider/context + option
types), 1 tsup entry, 1 `exports` triple, `react` peer dep + `@types/react`/`react`/`react-dom`
devDeps + tsup react-external config, updates to the 012 parity set + `dependency-pins` exports
checks, a new bundle-shape security test, and contract/integration/failure/security tests. Core,
pipeline, and all other subpaths are **not** modified.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Constitution version**: in-tree **v1.5.0**.

- **Spec-Driven Development (I)** — ✅ Spec → this plan; Constitution Check precedes code.
- **Stable Consumer API & Deprecation (II)** — ✅ **Additive**: a new opt-in `./framework-react`
  subpath (`LogErrorBoundary`, `useLogError`, `LoggerProvider` + their prop/option types); no existing
  entry, type, or behavior changes. Safe path stays easy — wiring is explicit/opt-in, never a
  `createLogger` side effect. Nothing deprecated/removed.
- **Browser Resilience & Failure Safety (III)** — ✅ **Central.** The emit path is wrapped fail-safe
  (try/catch around `logger.error`; routed to an `onError`/diagnostics hook, swallowed) so a
  logger/transport throw **never escalates the original crash** and the **fallback still renders**.
  React's own semantics prevent a self-loop (the boundary does not catch errors thrown while it
  renders its own fallback — those propagate to the next boundary up); the design adds no re-catch
  path. No internal throw reaches page code.
- **Framework-Neutral Structured Observability (IV)** — ✅ This is the *additive, clearly-scoped*
  framework option Principle IV permits: it does **not** displace the neutral path and pulls **no**
  React into the core (peer dep, externalized; core `.` entry imports zero React — asserted). Emits
  **structured** `error`-level events via the existing pipeline with a documented source marker +
  component-stack attribute; no raw object dumping (props/state are **not** auto-logged).
- **Secure & Privacy-Safe Logging by Default (V)** — ✅ **Fail-closed by construction**: emits through
  `logger.error`, so message/stack/component-stack pass the same sanitize → URL-scrub → redact
  (drop-on-failure) → guard pipeline before any transport. The helpers add **no** new sensitive source
  — they forward the error value + React component stack + consumer-supplied attrs only; they MUST NOT
  read ambient component props/state.
- **Testable, Minimal, Maintainable (VI)** — ✅ Small self-contained `src/framework-react/` module
  reusing the public `Logger`; **no new runtime dependency** (React is a peer, dev-only types/tooling).
  Test code held to `src/` standards.
- **Log Integrity & Monitoring Suitability (VII)** — ✅ Events are stable, machine-parseable,
  attributed (identity flows from the provided `Logger`), and **source-marked** (boundary vs.
  `useLogError` vs. ordinary log) so downstream can separate them. No reorder/dedup/batch of normal
  events; synchronous emit.
- **Lightweight Logger & Federated Runtime (VIII)** — ✅ **No-globals and no per-`Logger` cost.** The
  helpers attach no listeners, patch no globals, start no timers, and read no ambient state — they
  call `logger.error` on a logger they're handed. Not the host-level global install (that's
  `./capture`); any module may use them in its own subtree because they carry no global side effects.
  Reads **no** module-scoped runtime slot across the bundle boundary (operates through the explicit
  `Logger`, mirroring `./capture`'s rationale). Duplicate-package-copy behavior is **isolated**.
- **Reproducible Verification (IX)** — ✅ One `npm test`; deterministic (React rendered into happy-dom
  with `act`, errors triggered synchronously). Built `dist/` consumed by bundle-shape/parity tests as
  other features do; honest prerequisites (`beforeAll` fails loudly if `dist/` missing).
- **Mechanical Enforcement of Documented Contracts (X)** — ✅ Every new gate is paired with a test:
  boundary catches + emits with component stack (contract), `useLogError` emits for handler/async
  errors (contract), redaction applied + fail-closed drop (security), fail-safe + no-loop + reset
  (failure/integration), **no-globals** boundary scan (only `src/framework-react/**` may import
  `react`; the helpers reference no `window.onerror`/global listeners), core entry imports **no React**
  (security/contract), and the `./framework-react` parity + vendor-neutral + react-externalized bundle
  shape (security). The subpath is added to the Feature 012 parity gate and `dependency-pins` checks.
- **Supply-Chain Integrity & Verifiable Provenance (XI)** — ✅ Adds one packaged subpath
  (`./framework-react` → new `exports` entry + built files) and **one peer dependency (`react`)** —
  **not** a runtime/bundled dep, so `dependencies` stays empty and the install graph adds nothing for
  non-React consumers. `react` is not an observability vendor (passes the vendor-free peer check). The
  documented distributed surface + parity set are updated in lockstep; the subpath bundle is
  vendor-neutral and **externalizes react** (asserted). Attested publish, signed tags, DCO, pins
  unchanged.

**Result: PASS** (constitution v1.5.0). Complexity Tracking records the two notable design points (the
first runtime peer dependency, and the consumer-provided-`Logger` / context model over a
module-scoped-runtime read).

## Project Structure

### Documentation (this feature)

```text
specs/018-react-error-boundary/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   └── framework-react.md   # LogErrorBoundary props, useLogError + LoggerProvider signatures,
│                            #   emitted-event shape + source markers, behavioral guarantees (FR-R1..),
│                            #   the no-globals + react-peer boundary
└── checklists/requirements.md
```

### Source / repository files affected

```text
New runtime module (the feature):
└── src/framework-react/
    └── index.ts            # LogErrorBoundary (class; getDerivedStateFromError + componentDidCatch),
                            #   useLogError() hook, LoggerProvider + LoggerContext, option/prop types.
                            #   Authored with React.createElement (no JSX). Type-only import of
                            #   Logger/Attributes from ../api/types.js; runtime import of 'react'.

Build + packaging (the 8th subpath):
├── tsup.config.ts          # + entry 'framework-react': 'src/framework-react/index.ts'; ensure
│                           #   'react' is external (peerDeps are auto-externalized; assert in test)
└── package.json            # + "./framework-react" exports triple (→ dist/framework-react.*);
                            #   + peerDependencies.react ">=16.8.0" (+ peerDependenciesMeta optional? NO);
                            #   + devDependencies: @types/react, react, react-dom, @types/react-dom

Distributed-surface reconciliation (keep Feature 012 + dependency-pins green):
├── tests/contract/distributed-surface.contract.test.ts  # + './framework-react' to PUBLIC_SUBPATHS
│                                                         #   + HONEST_PKG.exports
└── tests/contract/dependency-pins.test.ts               # + './framework-react' to the exports-keys
                                                          #   assertion + the triple it.each; the
                                                          #   peerDependencies-vendor-free check now
                                                          #   sees react (non-vendor → passes)

Tests (REQUIRED — runtime feature):
├── tests/contract/framework-react.contract.test.ts        # API shape; boundary catches render error →
│                                                           #   event w/ component stack + source marker;
│                                                           #   useLogError stable callback emits;
│                                                           #   LoggerProvider wiring; disabled/no-logger
│                                                           #   = safe no-op
├── tests/integration/framework-react.integration.test.ts  # end-to-end into happy-dom: throw on render →
│                                                           #   event at a capturing transport + fallback
│                                                           #   renders; sibling subtree unaffected; reset
│                                                           #   re-mounts; SSR smoke (renderToString)
├── tests/security/framework-react-redaction.security.test.ts   # secret in message/stack/componentStack
│                                                                #   redacted; redaction-fail → dropped
├── tests/security/framework-react-bundle-shape.security.test.ts # dist/framework-react.* vendor-neutral;
│                                                                 #   react EXTERNALIZED (from "react",
│                                                                 #   not inlined); default-entry isolation
│                                                                 #   (index.* has no LogErrorBoundary)
└── tests/contract/react-import-boundary.test.ts          # only src/framework-react/** imports 'react';
                                                           #   core entry/dist imports zero React; helpers
                                                           #   reference no window.onerror/global listeners

Preserved UNCHANGED:
├── src/index.ts (core), src/api/logger.ts, the pipeline, the transports, all other subpaths  # no edit
└── existing exports / behavior                                                                # additive only
```

**Structure Decision**: A new `src/framework-react/` subpath that consumes the public `Logger`, built
as the 8th tsup entry with `react` externalized. No change to the core, pipeline, or any other subpath;
the boundary/hook are thin, fail-safe React adapters over the existing emit path.

## Approach & sequencing

1. **`src/framework-react/` module** —
   - `LoggerContext` (React context, default `undefined`) + `LoggerProvider({ logger, children })`.
   - `useLogError(loggerOverride?)` → a `useCallback`-stable `logError(error, attributes?)` that
     resolves `loggerOverride ?? useContext(LoggerContext)`, then fail-safe `logger?.error('...',
     {'safesignal.source':'react-use-log-error', ...attrs}, error)`; **safe no-op** if no logger.
   - `LogErrorBoundary` (class, `static contextType = LoggerContext`): `getDerivedStateFromError` sets
     caught state; `componentDidCatch(error, info)` resolves `this.props.logger ?? this.context`, calls
     `logger.error('React render error', {'safesignal.source':'react-error-boundary',
     'safesignal.react.componentStack': info.componentStack}, error)` (fail-safe), and calls optional
     `onError`. Renders `fallback` (node or `(error, reset) => node`) when caught, else `children`.
     Supports `resetKeys` (re-mount on change) + a `reset()` passed to a render-prop fallback. Default
     fallback = render `null`.
   - Authored with `createElement` (no JSX). Type-only `import type { Logger, Attributes } from
     '../api/types.js'`; runtime `import { Component, createElement, createContext, useContext,
     useCallback } from 'react'`.
2. **Build + exports + peer** — add tsup entry; add `./framework-react` exports triple; add
   `peerDependencies.react ">=16.8.0"`; add `@types/react`/`@types/react-dom`/`react`/`react-dom`
   devDeps; confirm tsup externalizes `react` (peerDeps auto-external; add `external:['react']` if the
   bundle-shape test shows inlining). Build.
3. **Distributed-surface reconciliation** — add `./framework-react` to the 012 parity `PUBLIC_SUBPATHS`
   + `HONEST_PKG.exports`, and to the `dependency-pins` exports-keys + triple `it.each`; confirm the
   peerDependencies-vendor-free assertion still passes (react is non-vendor). `npm run surface:check`
   green.
4. **Tests** — contract (API + event shape + provider + no-logger no-op), integration (render → event +
   fallback; sibling isolation; reset; SSR), security (redaction fail-closed; bundle vendor-neutral +
   react-externalized + default-entry isolation), and the **react-import / no-globals boundary** test.
5. **Docs** — README `./framework-react` section: peer-dep note, ~3-line wiring
   (`<LoggerProvider logger={log}><LogErrorBoundary fallback={…}>…`), `useLogError` usage for
   handler/async errors, the emitted-event shape + source markers, and the no-globals vs. `./capture`
   contrast. CHANGELOG entry deferred to release.

All edits land via one PR gated by the (now `./framework-react`-aware) `ci-success` (incl.
`surface:check`).

## Complexity Tracking

> No Constitution Check violations. Two design decisions worth recording (neither is a violation):
>
> **(1) First runtime peer dependency.** Every prior subpath is dependency-free (type-only `src`
> imports). `./framework-react` necessarily imports `react` at runtime — but as a **peer** (consumer-
> provided) and **externalized** from the bundle, so `dependencies` stays empty, the core and all other
> subpaths stay React-free, and non-React consumers install nothing extra. This is exactly Principle
> IV's sanctioned *additive, clearly-scoped framework option*, and the peer is non-vendor (passes the
> `dependency-pins` peer check). Authoring with `React.createElement` (not JSX) avoids adding a `jsx`
> compiler option to the shared `tsconfig`.
>
> **(2) Consumer-provided `Logger` + React context, not a module-scoped-runtime read.** Like
> `./capture`, this is a **separate bundle**: reading the core's module-scoped runtime slot directly
> would bind to a *different* (unconfigured) slot and violate Principle VIII's no-copy-local-globals
> isolation. So the logger is always consumer-provided — via `LoggerProvider` context (idiomatic React,
> wires once) or an explicit `logger` prop/arg override. When genuinely absent, the helper is a
> documented **safe no-op** rather than minting a fallback logger (which would require coupling to
> core); this refines the spec's "routes to Noop" assumption while preserving the bundle isolation and
> "never throws" guarantee.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none) | — | — |
