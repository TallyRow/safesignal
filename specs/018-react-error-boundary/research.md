# Phase 0 Research: `./framework-react` Error Boundary + `useLogError()`

All NEEDS CLARIFICATION from Technical Context resolved below. Each item: **Decision / Rationale /
Alternatives considered**.

## R1 — Error boundary must be a class component

- **Decision**: `LogErrorBoundary` is a **class component** extending `React.Component`, using
  `static getDerivedStateFromError(error)` (to enter fallback state) and `componentDidCatch(error,
  info)` (to log, with `info.componentStack`).
- **Rationale**: React provides **no hook** equivalent for error boundaries; only class components
  with these lifecycle methods can catch render-tree errors. This is a hard React constraint, not a
  style choice. `componentDidCatch` is where the React **component stack** (`info.componentStack`) is
  available — the marquee diagnostic this feature adds over a bare error.
- **Alternatives**: A function-component "boundary" (impossible — React has no such API); a
  third-party `react-error-boundary` dependency (rejected — adds a runtime dep, and the catching logic
  is ~20 lines; we own the secure-logging integration anyway).

## R2 — Errors a boundary cannot catch → `useLogError()`

- **Decision**: Ship `useLogError(loggerOverride?)` returning a **stable** (`useCallback`-memoized)
  `logError(error, attributes?)` callback that emits via `logger.error`.
- **Rationale**: React error boundaries catch **only** render, lifecycle, and constructor errors —
  **not** event handlers, `setTimeout`/`Promise` callbacks, async effects, or errors thrown after the
  boundary itself started rendering. That gap is where most runtime errors live (a failed fetch in a
  click handler). The hook gives function components an explicit, ergonomic way to route those through
  the same logger/pipeline. Stable identity makes it safe in `useEffect`/`useCallback` dependency
  arrays.
- **Alternatives**: Tell consumers to call `logger.error` directly (rejected — loses the source
  marker, the stable-callback ergonomics, and the context-resolved logger); auto-instrument async via
  globals (rejected — that's `./capture`'s job and violates the no-globals contract).

## R3 — How the logger reaches the helpers: React context + explicit override

- **Decision**: Export a small **`LoggerProvider({ logger, children })`** backed by a React
  `LoggerContext`. `<LogErrorBoundary>` reads the logger from context (`static contextType`) with an
  optional `logger` **prop** override; `useLogError(loggerOverride?)` reads context with an optional
  **arg** override. If no logger is resolvable, the helper is a **safe no-op** (no emission, never
  throws).
- **Rationale**: A separate bundle MUST NOT read the core's module-scoped runtime slot (it would bind
  to a different, unconfigured slot — the exact hazard `./capture` documented), so the logger is
  always **consumer-provided**. A React context is the idiomatic, no-globals way to wire it **once**
  near the app root (the "~3 lines" the issue promises) while staying React-scoped (not a global
  registry). The explicit prop/arg override covers cases without a provider and keeps parity with
  `./capture`'s explicit-`Logger` API.
- **Alternatives**: Required `logger` prop on every boundary/hook (rejected — verbose; defeats the
  ~3-line promise); reading the core runtime slot via the core entry (rejected — cross-bundle slot
  hazard, Principle VIII isolation); minting a default `Noop` logger inside the subpath (rejected — it
  cannot create a logger without importing core, which would break bundle isolation; hence the safe
  no-op refinement of the spec's "routes to Noop" assumption — see plan Complexity Tracking).

## R4 — React as an externalized peer dependency; authored without JSX

- **Decision**: Declare `react` as a **peerDependency** (`">=16.8.0"`), **externalized** by tsup (never
  bundled). Author `src/framework-react/index.ts` in **plain `.ts` using `React.createElement`** (no
  `.tsx`, no JSX). Add `@types/react` (+ `react`, `react-dom`, `@types/react-dom`) to
  **devDependencies** only. `dependencies` stays empty.
- **Rationale**: Principle IV requires framework support to be *additive and clearly-scoped* without
  pulling React into the core. A peer (consumer-provided, externalized) keeps the core and every other
  subpath React-free and adds nothing to a non-React consumer's install graph. `>=16.8.0` is the floor
  for hooks (`useLogError`); class-component boundaries work even earlier, but the hook sets the floor.
  Authoring with `createElement` avoids adding a `jsx` option to the shared `tsconfig` (which `src/`
  and tests inherit) and keeps the module a uniform `.ts` file. tsup auto-externalizes
  `peerDependencies`; the bundle-shape test asserts react is referenced as an external `from "react"`
  import, not inlined.
- **Alternatives**: Bundling React (rejected — bloats the subpath, duplicates the consumer's React,
  breaks hooks/context identity across copies); `.tsx` + `jsx: "react-jsx"` in tsconfig (rejected —
  unnecessary toolchain change to the shared config for ~3 components); a `react` **dependency**
  (rejected — would force-install React for all consumers and break the empty-`dependencies` invariant).

## R5 — Fail-safety, no catch/render loop, and reset

- **Decision**: Wrap the `logger.error` call in try/catch routed to an optional `onError`/diagnostics
  hook and swallowed (mirroring `./capture`'s `safeNotify`), so a logger/transport throw **never
  prevents the fallback from rendering** and never propagates to the page. Rely on **React's native
  semantics** for loop-safety: a boundary does not catch an error thrown while rendering its own
  fallback (it propagates to the next boundary up), and we add no re-catch path. Support recovery via
  **`resetKeys`** (re-mount the subtree when any key changes) and a **`reset()`** function passed to a
  render-prop fallback (`fallback={(error, reset) => …}`).
- **Rationale**: Principle III is non-negotiable — logging is the lowest-priority concern when a
  component is already crashing. Latching into the fallback until an explicit reset (rather than
  re-rendering the crashing subtree every tick) is the standard, loop-free React error-boundary
  pattern.
- **Alternatives**: Auto-retry the crashed subtree (rejected — risks an infinite crash/render loop);
  no reset at all (rejected — a permanently-latched boundary can't recover after the underlying cause
  is fixed, e.g., a route change).

## R6 — Emitted event shape, level, and source markers

- **Decision**: Emit at **`error`** level via `logger.error(message, attributes, errorValue)`.
  Attributes carry `safesignal.source` = `'react-error-boundary'` (boundary) or `'react-use-log-error'`
  (hook), and the boundary adds `safesignal.react.componentStack` (the `componentDidCatch` info). The
  error value is passed as the third `error?` arg (serialized by the pipeline like any logged error).
  Consumer-supplied `attributes` merge in. **No** component props/state are auto-captured.
- **Rationale**: Reuses the established `Logger.error` contract and the `safesignal.*` attribute
  convention from `./capture` (`safesignal.source`/`safesignal.errorType`), keeping events
  machine-parseable, attributed, and separable downstream (VII). `error` level is always within the
  baseline production filter (IV), so the helpers work under production defaults.
- **Alternatives**: A bespoke emission path/shape (rejected — loses fail-closed redaction and the
  shared shape); auto-dumping props/state (rejected — Principle IV/V raw-object-dump ban and a PII
  leak vector).

## R7 — Testing React in happy-dom

- **Decision**: Render with **`react-dom/client` `createRoot`** inside the existing **happy-dom**
  Vitest environment, wrapped in `act`, driving the boundary with a child that throws synchronously on
  render. Assert events on a capturing test transport (the established pattern). Add an **SSR smoke
  test** via `react-dom/server` `renderToString`. `react`/`react-dom`/`@types/*` are devDependencies.
- **Rationale**: Deterministic (synchronous throw, `act` flushes), no environment-dependent shims, and
  exercises the real React error-boundary lifecycle end-to-end. happy-dom already backs the suite.
- **Alternatives**: `@testing-library/react` (kept optional — ergonomic but an extra devDep; default to
  raw `react-dom/client` + `act` to stay minimal; implementation may adopt it if the raw approach
  proves noisy); enzyme (rejected — unmaintained for modern React).

## R8 — Distributed-surface & dependency-pins reconciliation (Feature 012)

- **Decision**: Add `./framework-react` to `PUBLIC_SUBPATHS` + `HONEST_PKG.exports` in
  `distributed-surface.contract.test.ts`, and to the exports-keys assertion + triple `it.each` in
  `dependency-pins.test.ts`. Confirm `react` (peer) is non-vendor so the existing
  peerDependencies-vendor-free assertion stays green; `dependencies` stays `{}`.
- **Rationale**: Principle XI / Feature 012 require the documented surface, the parity gate, and the
  per-entry triple to move in lockstep with any new `exports` key. `react` is not in the vendor
  prefix/exact lists, so adding it as a peer requires no change to the vendor sets.
- **Alternatives**: Skipping the parity update (rejected — `surface:check` fails closed, by design).

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| Boundary as class vs hook | Class component (React constraint) — R1 |
| Catching async/handler errors | `useLogError()` stable callback — R2 |
| Logger provisioning | `LoggerProvider` context + explicit prop/arg override; safe no-op if absent — R3 |
| React dependency kind | Externalized **peer** (`>=16.8.0`); core stays React-free — R4 |
| JSX vs createElement | `React.createElement` (no JSX, no tsconfig change) — R4 |
| Fail-safety / loop / reset | try/catch-swallow; React-native loop-safety; `resetKeys` + render-prop `reset()` — R5 |
| Event shape / markers | `logger.error` at `error` level; `safesignal.source` + `…react.componentStack` — R6 |
| Test strategy | `react-dom/client` + `act` in happy-dom; SSR smoke — R7 |
| Surface reconciliation | parity + dependency-pins exports updates; react non-vendor peer — R8 |
