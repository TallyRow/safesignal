# Tasks: React, Caught — Opt-in `./framework-react` Error Boundary + `useLogError()`

**Input**: Design documents from `/specs/018-react-error-boundary/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/framework-react.md ✅, quickstart.md ✅

**Tests**: REQUIRED (runtime feature touching browser-safety, redaction, a new public subpath, and the
package's first runtime peer dependency). Contract / integration / failure-safety / security / boundary
tests are written before/with the code they cover.

**Organization**: Tasks are grouped by user story (from spec.md) so each is an independently testable
increment. Constitution: **v1.5.0**.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- Exact file paths are included in each task

## Path notes

One new runtime module at `src/framework-react/index.ts` (authored with `React.createElement`, **no
JSX**). It imports `Logger`/`Attributes` **type-only** from `../api/types.js` and imports `react` at
runtime (an **externalized peer** — the first runtime external in the package). Build wiring in
`tsup.config.ts` + `package.json` (peer + dev deps). Tests under `tests/{contract,integration,security}/`.
The new `./framework-react` subpath (the 8th) is reconciled with Feature 012's parity gate. No change to
the core, the pipeline, the transports, or any other subpath.

---

## Phase 1: Setup

- [X] T001 [P] Create `src/framework-react/index.ts` scaffold per `contracts/framework-react.md`: the public types (`LogErrorBoundaryProps`, `LoggerProviderProps`), `LoggerContext` (`createContext<Logger | undefined>(undefined)`), and the exported signatures for `LoggerProvider`, `LogErrorBoundary` (class), and `useLogError(loggerOverride?)` — with a **type-only** `import type { Logger, Attributes } from '../api/types.js'` and a runtime `import { Component, createElement, createContext, useContext, useCallback } from 'react'`. Compiles cleanly (behavior filled in US1/US2).
- [X] T002 Add the `./framework-react` build wiring + React peer: in `package.json` add `"peerDependencies": { "react": ">=16.8.0" }` and devDependencies `@types/react`, `@types/react-dom`, `react`, `react-dom` (dev/test only), and the `"./framework-react": { types/import/require → ./dist/framework-react.* }` exports triple; in `tsup.config.ts` add `'framework-react': 'src/framework-react/index.ts'` to `entry` and ensure `react` is externalized (peerDeps are auto-external; add `external: ['react']` if T011 shows inlining). `npm run build` emits `dist/framework-react.{mjs,cjs,d.ts}` that reference `react` as an external import.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Reconcile the new 8th subpath + the new peer dependency with the distributed-surface and
dependency-pins gates so build + tests are green before any story work. **⚠️ Adding `./framework-react`
to `exports` without this makes the Feature-012 parity gate and `dependency-pins` fail.**

- [X] T003 Reconcile the distributed surface for `./framework-react`: add `'./framework-react'` to `PUBLIC_SUBPATHS` **and** `HONEST_PKG.exports` in `tests/contract/distributed-surface.contract.test.ts`, and to the exports-keys assertion **and** the per-entry triple `it.each` in `tests/contract/dependency-pins.test.ts`. Confirm the existing `dependency-pins` invariants still hold: `dependencies` stays `{}` (react is a **peer**, not a runtime dep) and the peerDependencies-vendor-free assertion passes (`react` is not an observability vendor). Run `npm run build && npm run surface:check && npm test -- tests/contract/dependency-pins.test.ts` → green.

**Checkpoint**: `./framework-react` ships, the distributed surface stays honest, and `dependencies` is still empty — story work can begin.

---

## Phase 3: User Story 1 — A render-tree crash becomes a logged event and a graceful fallback (Priority: P1) 🎯 MVP

**Goal**: `<LogErrorBoundary>` catches descendant render/lifecycle errors, emits an `error`-level event
(with the React component stack) through the resolved `Logger`, and renders a fallback instead of a
blank screen — with secrets redacted fail-closed.

**Independent Test**: Render a throwing child inside `<LogErrorBoundary>` (logger via `LoggerProvider`)
with a capturing transport → an `error`-level event carrying the error + `safesignal.react.componentStack`
arrives, and the fallback renders while sibling subtrees keep working (quickstart §1).

### Tests for User Story 1 ⚠️ (write first)

- [X] T004 [P] [US1] Contract test `tests/contract/framework-react.contract.test.ts` (FR-R1/R2/R7/R9/R10): with a mock/capturing `Logger`, a child that throws on render inside `<LogErrorBoundary>` triggers exactly one `logger.error(message, attributes, error)` with `attributes['safesignal.source'] === 'react-error-boundary'` + `attributes['safesignal.react.componentStack']` populated + the error value passed; the fallback renders (assert both a `ReactNode` fallback and a render-prop `(error, reset) => node`); **default fallback renders `null`** when none supplied; **FR-R10 no-op**: with no `LoggerProvider` and no `logger` prop, catching an error performs **0** emissions and does not throw; **non-`Error` thrown value** (a child throwing a string/plain object) is serialized into a well-formed `error`-level event without throwing (spec Edge Cases).
- [X] T005 [P] [US1] Integration test `tests/integration/framework-react.integration.test.ts` (FR-R1/R2/R5/R7, SSR): render into happy-dom via `react-dom/client` `createRoot` + `act`; a child throwing on render → an `error`-level event at a capturing transport **and** the fallback DOM is present while a sibling subtree outside the boundary still renders (SC-001); changing `resetKeys` (or invoking the render-prop `reset()`) clears caught state and re-mounts `children` (FR-R7 / SC-007); **fail-safety (FR-006/FR-R5, SC-004)**: with a `Logger` whose `error()` **throws** (and again with a throwing `onError`), a caught render error → the throw is swallowed (routed to `onError`/diagnostics, never re-thrown), the **fallback still renders**, nothing propagates to the page, and there is **no catch/render loop** (assert the boundary does not re-invoke its catch path on its own fallback render); an SSR smoke via `react-dom/server` `renderToString` does not throw.
- [X] T006 [P] [US1] Redaction security test `tests/security/framework-react-redaction.security.test.ts` (FR-R4): a known secret fixture embedded in the thrown error's message/stack **and** in the component stack does **not** reach the transport (masked by the pipeline; redaction-fail → event dropped), proving emission routes through the same fail-closed pipeline as any log with no bypass (SC-003).

### Implementation for User Story 1

- [X] T007 [US1] Implement `LoggerProvider`/`LoggerContext` and the `LogErrorBoundary` class in `src/framework-react/index.ts` per `contracts/framework-react.md` + `data-model.md`: `static getDerivedStateFromError(error)` → caught state; `componentDidCatch(error, info)` resolves `this.props.logger ?? this.context` (`static contextType = LoggerContext`) and **fail-safe** calls `logger?.error('React render error', { 'safesignal.source': 'react-error-boundary', 'safesignal.react.componentStack': info.componentStack }, error)` then the optional `onError` (also fail-safe); `render()` returns the resolved `fallback` (node or `(error, reset) => node`, default `null`) when caught, else `children`; `componentDidUpdate` resets on changed `resetKeys`; a `reset()` clears caught state. Makes T004/T005/T006 pass.

**Checkpoint**: US1 functional — a component crash is now both observable (redacted `error` event) and survivable (fallback). This is the marquee visible value (MVP).

---

## Phase 4: User Story 2 — Log the errors a boundary cannot catch — `useLogError()` (Priority: P2)

**Goal**: A function component gets a stable `logError(error, attributes?)` callback that routes
event-handler / async / effect errors through the same logger and secure pipeline.

**Independent Test**: A component using `useLogError()` reports an error from an event handler and from
an async callback → both produce `error`-level events with `safesignal.source: 'react-use-log-error'`;
the callback identity is stable across re-renders (quickstart §2).

### Tests for User Story 2 ⚠️ (write first)

- [X] T008 [P] [US2] Hook contract test in `tests/contract/framework-react.contract.test.ts` (FR-R3/R9/R10) — extend the US1 file: `useLogError()` (logger via `LoggerProvider`) returns a callback whose **identity is stable across re-renders** for a fixed logger (safe in dependency arrays); calling it from an event handler and from an async callback each emits one `error`-level event via `logger.error` with `attributes['safesignal.source'] === 'react-use-log-error'` and merged consumer `attributes`; `useLogError(explicitLogger)` override resolves; with **no** resolvable logger the callback is a **safe no-op** (0 emissions, no throw — FR-R10).

### Implementation for User Story 2

- [X] T009 [US2] Implement `useLogError(loggerOverride?)` in `src/framework-react/index.ts`: resolve `loggerOverride ?? useContext(LoggerContext)`; return a `useCallback`-memoized `(error, attributes?) => { try { logger?.error('Reported error', { 'safesignal.source': 'react-use-log-error', ...attributes }, error); } catch { /* fail-safe swallow */ } }` keyed on the resolved logger (stable identity). Safe no-op when no logger. Makes T008 pass. (Same file as T007 → sequential, not `[P]`.)

**Checkpoint**: US1 + US2 — render-tree crashes **and** the errors boundaries can't catch both flow through the secure pipeline.

---

## Phase 5: User Story 3 — No globals, framework-neutral, additive subpath (Priority: P3)

**Goal**: The helpers patch no globals and attach no listeners; React is an externalized **peer** so the
core and every other subpath stay React-free; the new subpath keeps the distributed surface honest.

**Independent Test**: A source/dist scan shows only `src/framework-react/**` imports `react`, the core
entry bundles zero React and attaches no globals, and `dist/framework-react.*` externalizes `react` and
names no vendor (quickstart §Notes; SC-005/SC-006).

### Tests for User Story 3 ⚠️ (write first)

- [X] T010 [P] [US3] React-import / no-globals boundary test `tests/contract/react-import-boundary.test.ts` (FR-R6/R8, SC-005/SC-006) — mirroring `tests/contract/internal-import-boundary.test.ts`: (a) a source scan asserts **only** `src/framework-react/**` imports `react`; (b) `src/framework-react/**` references **no** `window.onerror`, `addEventListener`, console patch, or timer/global — errors flow only through the logger; (c) the built `dist/index.{mjs,cjs}` imports **zero** React (no `from "react"`) and the core surface exposes no React identifier.
- [X] T011 [P] [US3] Bundle-shape security test `tests/security/framework-react-bundle-shape.security.test.ts` (FR-R8/R11, Principle XI), modeled on `capture-bundle-shape.security.test.ts`: (a) `src/framework-react/index.ts`'s only relative `src` import is the **type-only** `../api/types.js`; non-relative externals (`react`) are allowed; (b) `dist/framework-react.{mjs,cjs}` name no observability-vendor package/identifier; (c) **react is externalized** — the bundle contains a bare `from "react"` / `require("react")` import and does **not** inline React's source (assert a React-internal marker is absent); (d) default-entry isolation — `dist/index.{mjs,cjs}` contain neither `LogErrorBoundary` nor `useLogError`.

### Implementation for User Story 3

- [X] T012 [US3] Update `README.md`: add a "React error handling — `./framework-react` subpath" section showing the ~3-line wiring (`<LoggerProvider logger={log}><LogErrorBoundary fallback={…}>…`), `useLogError()` for handler/async errors, the emitted-event shape + `safesignal.source` markers, the **peer-dependency** note (`react >=16.8`, core stays React-free), and the **no-globals contrast with `./capture`** (per-component vs host-level global install; the two are complementary). Reconcile any roadmap/"does NOT do" wording that implied no framework adapters ship.

**Checkpoint**: All three stories functional; the no-globals + React-neutral boundary is enforced and documented.

---

## Phase 6: Polish & Validation

- [X] T013 Full build + suite + gates: `npm run build && npm test && npm run typecheck && npm run lint && npm run surface:check` all green; confirm `dist/framework-react.*` ships, references `react` externally, and the parity gate passes with the new subpath. Confirm `tests/tsconfig.json` typechecks the React tests (with `@types/react`/`@types/react-dom`) to the same standard as `src/`.
- [X] T014 [P] Security & privacy validation (Principle V): boundary/hook emissions are redacted before any transport (T006); the helpers read **no** ambient component props/state (no raw object dumping) and add no new sensitive source; source attributes are `safesignal.*`-namespaced; confirm no new leak path.
- [X] T015 [P] Neutrality & lightweight-`Logger` validation (Principles IV/VIII): `dependencies` stays `{}`; `react` is a **peer**, externalized; the core entry + all other subpaths import zero React; the helpers attach no globals and add no per-`Logger` cost (creating many loggers attaches nothing); duplicate-package-copy behavior is **isolated** (each copy routes through whatever logger it's handed).
- [X] T016 Run `quickstart.md` §1–§3 + Verify, and confirm each acceptance criterion (FR-R1..R11, SC-001..SC-007); record results in the PR.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: T001 (scaffold) → T002 (build wiring + peer/dev deps need the file).
- **Foundational (Phase 2)**: T003 needs T002 (the `./framework-react` exports entry + peer dep) — **blocks all stories** (build + parity + dependency-pins must be green).
- **User Stories**: US1 (T004–T007) first — defines the boundary + provider/context core. US2 (T008–T009) adds `useLogError` to the **same file** (sequential on it). US3 (T010–T012) needs the built subpath (T007/T009 + T002) for its bundle/import tests; T012 (docs) is independent.
- **Polish (Phase 6)**: after the stories.

### Within each story

- Tests (T004/T005/T006, T008, T010/T011) are written to FAIL before/with their implementation.
- `src/framework-react/index.ts` is built up sequentially: T001 scaffold → T007 boundary+provider (US1) → T009 hook (US2). These are **not** mutually `[P]` (same file).

### Parallel opportunities

- T001 (scaffold) is `[P]`.
- US1 tests T004 + T005 + T006 are `[P]` (different files); US3 tests T010 + T011 are `[P]`.
- T012 (README) runs parallel to US3 test work; Polish T014 + T015 are `[P]`.

---

## Implementation Strategy

### MVP first (User Story 1)

1. Setup (T001–T002) → Foundational (T003: subpath + peer reconciled, parity green).
2. US1 (T004–T007): boundary catches render errors, logs them with the component stack (redacted), and
   renders a fallback.
3. **STOP and VALIDATE**: render a throwing child inside the boundary → a redacted `error` event at the
   transport + a fallback instead of a blank screen. This alone is the marquee visible value.

### Incremental delivery

1. Setup + Foundational → `./framework-react` ships, surface honest, `dependencies` still empty.
2. US1 → render-tree crashes become observable + survivable (MVP).
3. US2 → `useLogError` covers handler/async errors boundaries can't catch.
4. US3 → no-globals + React-neutral boundary enforced + vendor-neutral/react-externalized bundle + docs.
5. Polish → full gates + the constitution validation passes + quickstart.

---

## Notes

- **First runtime peer dependency**: `react` is a **peer** (`>=16.8.0`), externalized — `dependencies`
  stays `{}` and non-React consumers install nothing extra (plan Complexity Tracking #1). Authored with
  `React.createElement` (no JSX) so the shared `tsconfig` needs no `jsx` option.
- **Consumer-provided `Logger` only**: like `./capture`, the subpath is a separate bundle and never reads
  the core's module-scoped runtime slot; the logger comes via `LoggerProvider` context or an explicit
  override, and is a documented **safe no-op** when absent (plan Complexity Tracking #2).
- The new `./framework-react` subpath **must** be reconciled with Feature 012's parity gate + the
  `dependency-pins` exports checks (T003) or CI fails.
- Commit after each task or logical group; the whole feature lands via one PR gated by `ci-success`.
