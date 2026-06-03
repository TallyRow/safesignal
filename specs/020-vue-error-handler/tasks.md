# Tasks: Vue Error-Handling Adapter + Composables (`./framework-vue`)

**Feature**: `020-vue-error-handler` · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)
· **Contract**: [contracts/framework-vue.md](./contracts/framework-vue.md)

Mirrors the shipped `./framework-react` adapter (feature 018). Tests are **required** (Principle X — every
gate has a fail-closed test) and authored before/with the implementation per story. All emission routes
through `Logger.error`; `vue` is an externalized optional peer.

**Conventions**: `[P]` = parallelizable (distinct file, no incomplete dep). All five public exports live
in the single file `src/framework-vue/index.ts`, so source tasks touching it are **sequential** (no `[P]`
among them). Story labels: `[US1]` app-level adapter (P1), `[US2]` `useLogError` (P2), `[US3]`
`useErrorCapture` (P3).

---

## Phase 1: Setup

- [X] T001 Create `src/framework-vue/index.ts` scaffold: module header doc (no-globals/fail-closed/fail-safe, vue externalized peer), the type-only import `import type { Attributes, Logger } from '../api/types.js'`, runtime imports from `'vue'` (`inject`, `provide`, `onErrorCaptured`, `getCurrentInstance` + types `App`/`InjectionKey`/`Plugin`), and the three source-marker constants (`'vue-error-handler'`, `'vue-use-log-error'`, `'vue-error-captured'`).
- [X] T002 [P] In `package.json`: add the `"./framework-vue"` exports triple (`./dist/framework-vue.{d.ts,mjs,cjs}`, sorted after `"./framework-react"`); add `peerDependencies.vue: ">=3.0.0"`; add `peerDependenciesMeta.vue: { "optional": true }`; add `devDependencies.vue: "^3.5.0"`. Keep `dependencies` empty.
- [X] T003 [P] In `tsup.config.ts`: add entry `'framework-vue': 'src/framework-vue/index.ts'` and add `'vue'` to the `external` array.
- [X] T004 Run `npm install` to materialize the `vue` devDependency (needed for typecheck + tests), then `npm run build` once to confirm the new entry compiles to `dist/framework-vue.*`.

---

## Phase 2: Foundational (BLOCKING — distributed-surface parity, shared by all stories)

> The three hardcoded subpath-key lists must include `'./framework-vue'` (sorted, right after
> `'./framework-react'`) or contract tests fail CI. Do these before story tests run green.

- [X] T005 [P] In `tests/contract/distributed-surface.contract.test.ts`: add `'./framework-vue'` to `PUBLIC_SUBPATHS` and add the `'./framework-vue'` triple to `HONEST_PKG.exports`.
- [X] T006 [P] In `tests/contract/dependency-pins.test.ts`: add `'./framework-vue'` to the `Object.keys(exports).sort()` expected array and add `['./framework-vue', 'framework-vue']` to the per-entry triple `it.each`.
- [X] T007 [P] In `tests/contract/transport-beacon.contract.test.ts`: add `'./framework-vue'` to the TB-12 `Object.keys(exports).sort()` expected array and update the `describe`/`it` title string that enumerates the keys.

**Checkpoint**: `npm run build && npm run surface:check` green; `npm test -- tests/contract/dependency-pins.test.ts tests/contract/transport-beacon.contract.test.ts` green.

---

## Phase 3: User Story 1 — App-wide Vue errors reach my logs (P1) 🎯 MVP

**Goal**: `createErrorHandler` + `safesignalErrorHandler` plugin + `loggerKey` route
`app.config.errorHandler` errors through the consumer's `Logger`.

**Independent test**: mount a Vue app (raw `createApp` + happy-dom) wired with the adapter whose child
throws on render → exactly one `error` event via the fake logger, `safesignal.source =
'vue-error-handler'`, error forwarded, no global listener.

- [X] T008 [US1] In `tests/contract/framework-vue.contract.test.ts` (new): write the US1 contract assertions — `loggerKey` is exported; `createErrorHandler(logger)` returns a function that, when called with `(err, instance, info)`, emits one `logger.error` with message `'Vue error'`, `attributes['safesignal.source']='vue-error-handler'`, best-effort `safesignal.vue.info`/`safesignal.vue.componentName`, and the error forwarded; `safesignalErrorHandler` is a Vue plugin whose `install(app,{logger})` sets `app.config.errorHandler` and provides `loggerKey`; a throwing `logger.error` is swallowed. (Use a fake `Logger` spy.)
- [X] T009 [US1] In `src/framework-vue/index.ts`: implement `loggerKey: InjectionKey<Logger>`, a private `emit(logger, source, message, error, attributes?, instance?, info?)` helper (best-effort `vue.info`/`vue.componentName` extraction via `instance`/`getCurrentInstance`; all wrapped in try/catch — fail-safe), `createErrorHandler(logger)`, and the `safesignalErrorHandler` plugin (`install` sets `app.config.errorHandler = createErrorHandler(logger)` and `app.provide(loggerKey, logger)`). Export `VueErrorHandler` + `SafesignalErrorHandlerOptions` types.
- [X] T010 [P] [US1] In `tests/integration/framework-vue.integration.test.ts` (new): end-to-end via the real pipeline + a capturing transport — `createApp` with the plugin, a child that throws on render, assert one redacted `error` event reaches the transport with the source marker; assert a sibling subtree outside the failing component is unaffected; assert a throwing `logger.error` does not break the app (fail-safe).

**Checkpoint**: US1 tests green; app-level capture is a shippable MVP.

---

## Phase 4: User Story 2 — Report errors a framework handler can't catch (P2)

**Goal**: `useLogError(loggerOverride?)` returns a stable manual-report callback resolving the logger via
override → `inject(loggerKey)`.

**Independent test**: in a component setup, call the returned callback with an error + attributes →
one `error` event, `safesignal.source = 'vue-use-log-error'`, attributes merged; stable identity across
re-renders; no-op when no logger resolves.

- [X] T011 [US2] In `tests/contract/framework-vue.contract.test.ts`: add US2 assertions — `useLogError()` (called within a mounted component that has `loggerKey` provided) returns a callback that emits `error` with `safesignal.source='vue-use-log-error'` and merged attributes; explicit `loggerOverride` wins over the injected logger; identity is stable across re-renders for a fixed resolved logger; no-logger ⇒ no emission, no throw.
- [X] T012 [US2] In `src/framework-vue/index.ts`: implement `useLogError(loggerOverride?)` — resolve `loggerOverride ?? inject(loggerKey, undefined)`; return a callback (memoized per resolved logger so identity is stable) that calls the shared `emit(...)` with source `'vue-use-log-error'`, default message `'Reported error'`, merged attributes; fail-safe; no-op when unresolved.

**Checkpoint**: US1 + US2 tests green independently.

---

## Phase 5: User Story 3 — Contain a subtree and recover (P3)

**Goal**: `useErrorCapture(options?)` wraps `onErrorCaptured`, logs descendant errors once, stops
propagation by default (opt-out via `propagate: true`), with a fail-safe `onError`.

**Independent test**: wrapper component using the composable around a throwing child → one `error` event
with `safesignal.source='vue-error-captured'`; by default the app-level handler does NOT also log it;
`propagate: true` lets it bubble; a throwing `onError` is swallowed.

- [X] T013 [US3] In `tests/contract/framework-vue.contract.test.ts`: add US3 assertions — `useErrorCapture` logs a captured descendant error once with `safesignal.source='vue-error-captured'`; default stops propagation (returns `false`); `{ propagate: true }` keeps propagating; `onError(error, info)` is invoked fail-safe after logging; explicit `options.logger` override honored; no-logger ⇒ no-op.
- [X] T014 [US3] In `src/framework-vue/index.ts`: implement `useErrorCapture(options?)` — resolve `options?.logger ?? inject(loggerKey, undefined)`; register `onErrorCaptured((err, instance, info) => { emit(...source 'vue-error-captured'...); try { options?.onError?.(err, info) } catch {}; return options?.propagate ? undefined : false })`; fail-safe throughout. Export `UseErrorCaptureOptions` type.
- [X] T015 [P] [US3] In `tests/integration/framework-vue.integration.test.ts`: add the propagation integration case — a boundary around a throwing child logs once and the app-level handler does NOT double-log (default); with `propagate: true` both log.

**Checkpoint**: all three stories green independently.

---

## Phase 6: Polish & Cross-Cutting

- [X] T016 [P] In `tests/security/framework-vue-redaction.security.test.ts` (new): fail-closed — a token-shaped secret in a caught Vue error message/stack is `[REDACTED]` (or the event dropped) before it reaches a capturing transport; proves routing through the secure pipeline with no bypass.
- [X] T017 [P] In `tests/security/framework-vue-bundle-shape.security.test.ts` (new): assert `src/framework-vue/index.ts` only type-only-imports `../api/types.js` intra-package; `dist/framework-vue.{mjs,cjs}` is vendor-neutral and imports `vue` as a bare external (`from "vue"` / `require("vue")`, source not inlined); default-entry isolation — `dist/index.{mjs,cjs}` contain none of `createErrorHandler`/`useLogError`/`useErrorCapture`/`safesignalErrorHandler`/`loggerKey`.
- [X] T018 [P] In `tests/contract/vue-import-boundary.test.ts` (new): source scan — **only** `src/framework-vue/**` imports `vue`; core + every other subpath import zero Vue; `src/framework-vue/**` patches no globals / attaches no listeners (no `window.onerror`, `addEventListener`, `setTimeout`, `setInterval`); `dist/index.{mjs,cjs}` import zero Vue.
- [X] T019 In `README.md`: add a "## Catch Vue errors — `./framework-vue` subpath" section parallel to the React section (plugin + factory install, `useLogError`, `useErrorCapture`, peer-dependency note, security note). Model safe logging only (no props/state dump, no global capture).
- [X] T020 Run the full gate: `npm run verify` (build → typecheck → lint → format:check → test → api:check) and `npm run surface:check` — all green. Fix any lint/format via `npm run format`. (No `api:check` baseline change expected — the new subpath is independently surfaced, not part of the core `.` surface; confirm `api:check` passes as-is and update the baseline only if the tool requires it.)

---

## Dependencies & Execution Order

- **Setup (T001–T004)** → blocks everything (scaffold + build wiring + vue devDep).
- **Foundational (T005–T007)** → blocks green test runs (parity lists); independent of each other `[P]`.
- **US1 (T008–T010)** → the MVP; depends on Setup + Foundational. Source tasks T009 (and later T012,
  T014) edit the same `index.ts` → strictly sequential T009 → T012 → T014.
- **US2 (T011–T012)** → depends on US1's `loggerKey` + `emit` helper (T009).
- **US3 (T013–T015)** → depends on US1's `loggerKey` + `emit` helper (T009).
- **Polish (T016–T020)** → after the surface exists; T016/T017/T018 are `[P]` (distinct new files);
  T020 last.

## Parallel Execution Examples

- After T004: run T005, T006, T007 together (three distinct test files).
- Within US1: T008 (contract) then T009 (impl); T010 (integration, distinct file) can be authored in
  parallel with T008.
- Polish: T016, T017, T018 in parallel (three new, independent files).

## Implementation Strategy

**MVP = Phases 1–3 (through US1)**: app-wide Vue error capture through the consumer's `Logger` is already
valuable and independently shippable. US2 and US3 are additive increments on the same `emit` helper +
`loggerKey`. Ship order: Setup → Foundational → US1 → US2 → US3 → Polish, then `npm run verify`, commit,
open PR on `020-vue-error-handler`, merge after `ci-success`.
